import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getTokens, MUTATION_EVENT } from '../api/client';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { createCallEngine } from '../lib/calls/callEngine';
import { startTone, stopTone, blip, unlockAudio } from '../lib/calls/ringtone';
import { createVideoFx } from '../lib/calls/videoFx';
import CallUI from '../components/calls/CallUI';
import { CallCtx, IDLE, useCall } from './callCtx';

export { useCall };

/**
 * Global call layer: mounted once under <AuthProvider>. Polls for incoming calls on every page (so a call rings
 * wherever you are in the site), owns the single active call, and renders the incoming/active-call UI.
 * Chat components only need `const call = useCall(); call.startCall(conversationId, { name, avatar })`.
 */

const BASE = '/api/v1/messaging/calls';

// One id per page load (NOT sessionStorage: "duplicate tab" copies it and two tabs would share an id).
const CLIENT_ID = (() => {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
})();

const NOISE_KEY = 'uip.call.noise';
const readNoisePref = () => { try { return localStorage.getItem(NOISE_KEY) !== '0'; } catch { return true; } };

/**
 * opts: { video?: boolean, audio?: boolean (default true), facing?: 'user'|'environment', noise?: boolean (default true) }
 * Noise suppression / echo cancellation / auto gain are the browser's built-in processing (the same engine Meet-style
 * web calls use); `voiceIsolation` is picked up by browsers that support it and ignored elsewhere.
 */
function getUserMedia(opts = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('unsupported');
    e.name = 'NotSupportedError';
    return Promise.reject(e);
  }
  const noise = opts.noise !== false;
  const audio = opts.audio === false ? false : {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: noise },
    autoGainControl: { ideal: noise },
    voiceIsolation: { ideal: noise },
    channelCount: { ideal: 1 },
  };
  // phones/tablets: 640x480 @ ≤20 fps keeps encoding cheap (720p made weaker devices stutter/freeze)
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  const video = opts.video ? {
    width: { ideal: mobile ? 640 : 1280 }, height: { ideal: mobile ? 480 : 720 }, frameRate: mobile ? { ideal: 20, max: 24 } : { ideal: 24, max: 30 },
    facingMode: { ideal: opts.facing === 'environment' ? 'environment' : 'user' },
  } : false;
  return navigator.mediaDevices.getUserMedia({ audio, video });
}

function getDisplayMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    const e = new Error('unsupported');
    e.name = 'NotSupportedError';
    return Promise.reject(e);
  }
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
}

async function countCameras() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((d) => d.kind === 'videoinput').length;
  } catch { return 1; }
}

/** System notification + tab-title flash for a call that rings while the tab is in the background. */
function notifyIncoming(call, ar) {
  const name = (call && call.peer && call.peer.name) || '';
  const video = call && call.type === 'video';
  const title = video ? (ar ? 'مكالمة فيديو واردة' : 'Incoming video call') : (ar ? 'مكالمة صوتية واردة' : 'Incoming voice call');
  let n = null;
  let flash = 0;
  const prevTitle = document.title;
  if (document.visibilityState === 'hidden') {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        n = new Notification(title, { body: name, tag: 'uip-call', renotify: true, requireInteraction: true, icon: '/favicon.svg' });
        n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n && n.close(); };
      }
    } catch { /* some browsers only allow notifications via a service worker */ }
    let on = false;
    flash = setInterval(() => { on = !on; document.title = on ? `📞 ${name || title}` : prevTitle; }, 900);
  }
  return () => {
    if (flash) clearInterval(flash);
    document.title = prevTitle;
    try { n && n.close(); } catch { /* ignore */ }
  };
}

// A 0.1 s silent WAV. Playing it from inside a click "unlocks" the <audio> element on iOS Safari / Android WebView, which otherwise
// refuse to start the remote voice later (it begins asynchronously, long after the tap) - that is a classic one-way-audio cause.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function CallProvider({ children }) {
  const { user, status, can, permissionsReady } = useAuth();
  const { locale } = useLanguage();
  const [state, setState] = useState(IDLE);
  const [media, setMedia] = useState({ local: null, remote: null }); // live MediaStreams for the <video> tags
  const [audioBlocked, setAudioBlocked] = useState(false); // the browser refused to start the other person's voice until the user taps
  const engineRef = useRef(null);
  const audioRef = useRef(null);
  const arRef = useRef(locale === 'ar');
  arRef.current = locale === 'ar';

  const enabled = status === 'authenticated' && !!user && permissionsReady && can('messaging.use');
  const userId = user && user.id;

  /** Call from a user gesture (tap on call / answer): lets the remote <audio> start later without another tap. */
  const primeAudio = () => {
    const el = audioRef.current;
    if (!el || el.srcObject) return;
    try {
      el.muted = false;
      el.volume = 1;
      el.src = SILENT_WAV;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch { /* best effort */ }
  };

  /** Retry playing the remote voice (used by the "tap to enable sound" button and by any later user gesture). */
  const resumeAudio = () => {
    const el = audioRef.current;
    if (!el || !el.srcObject) return;
    el.muted = false;
    el.volume = 1;
    const p = el.play();
    if (p && p.then) p.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    else setAudioBlocked(false);
  };

  // Browsers only start audio after a gesture: unlock the ringtone context on the first interaction.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const engine = createCallEngine({
      api,
      clientId: CLIENT_ID,
      base: BASE,
      getUserMedia,
      getDisplayMedia: typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia ? getDisplayMedia : null,
      countCameras,
      createFx: createVideoFx,
      makeStream: (tracks) => new MediaStream(tracks),
      setLocalVideo: (stream) => setMedia((m) => (m.local === stream ? m : { ...m, local: stream })),
      setRemoteVideo: (stream) => setMedia((m) => (m.remote === stream ? m : { ...m, remote: stream })),
      initialNoise: readNoisePref(),
      onPref: (key, value) => { if (key === 'noise') { try { localStorage.setItem(NOISE_KEY, value ? '1' : '0'); } catch { /* private mode */ } } },
      createPc: (cfg) => new RTCPeerConnection(cfg),
      tones: { start: startTone, stop: stopTone, blip },
      setRemoteStream: (stream, track) => {
        const el = audioRef.current;
        if (!el) return;
        const src = stream || (track ? new MediaStream([track]) : null);
        if (el.srcObject !== src) { el.srcObject = src; } // an unmute re-attach hands us the same stream: don't restart playback
        if (!src) { setAudioBlocked(false); return; }
        el.muted = false;
        el.volume = 1;
        const p = el.play();
        if (p && p.then) {
          p.then(() => setAudioBlocked(false)).catch(() => {
            // autoplay refused: ask for a tap, and also retry on the very next interaction anywhere on the page
            setAudioBlocked(true);
            const retry = () => resumeAudio();
            window.addEventListener('pointerdown', retry, { once: true, capture: true });
            window.addEventListener('keydown', retry, { once: true, capture: true });
          });
        }
      },
      onChange: setState,
      onFinished: () => {
        // The log message (and the inbox preview) changed on the server: let chat pages refetch right away.
        try { window.dispatchEvent(new CustomEvent(MUTATION_EVENT, { detail: { method: 'POST', path: BASE } })); } catch { /* ignore */ }
      },
      isHidden: () => document.visibilityState === 'hidden',
      notify: (kind, call) => notifyIncoming(call, arRef.current),
      vibrate: (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } },
    });
    engineRef.current = engine;
    engine.start();

    const onVisible = () => { if (document.visibilityState === 'visible') engine.kick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Best effort: closing the tab mid-call tells the server straight away (otherwise it notices after ~25 s).
    const leave = () => {
      const s = engine.getState();
      if (!s.call || !['outgoing', 'connecting', 'active'].includes(s.phase)) return;
      try {
        const { accessToken } = getTokens();
        fetch(`${BASE}/${s.call.id}/end`, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ reason: 'hangup' }),
        }).catch(() => {});
      } catch { /* the server's 25 s heartbeat timeout is the fallback */ }
    };
    window.addEventListener('beforeunload', leave);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('beforeunload', leave);
      engine.stop();
      engineRef.current = null;
      setState(IDLE);
      setMedia({ local: null, remote: null });
      setAudioBlocked(false);
    };
  }, [enabled, userId]);

  const actions = useMemo(() => ({
    startCall: (conversationId, peer, opts) => { primeAudio(); return engineRef.current ? engineRef.current.startCall(conversationId, peer, opts) : Promise.resolve(false); },
    accept: (opts) => { primeAudio(); return engineRef.current && engineRef.current.accept(opts); },
    resumeAudio: () => resumeAudio(),
    getDiagnostics: () => (engineRef.current && engineRef.current.diagnostics ? engineRef.current.diagnostics() : Promise.resolve(null)),
    toggleCamera: () => engineRef.current && engineRef.current.toggleCamera(),
    switchCamera: () => engineRef.current && engineRef.current.switchCamera(),
    toggleScreenShare: () => engineRef.current && engineRef.current.toggleScreenShare(),
    setFilter: (name) => engineRef.current && engineRef.current.setFilter(name),
    setNoise: (on) => engineRef.current && engineRef.current.setNoise(on),
    decline: () => engineRef.current && engineRef.current.decline(),
    hangup: () => engineRef.current && engineRef.current.hangup(),
    toggleMute: () => engineRef.current && engineRef.current.toggleMute(),
    setMinimized: (v) => engineRef.current && engineRef.current.setMinimized(v),
    dismissNotice: () => engineRef.current && engineRef.current.dismissNotice(),
  }), []);

  const value = useMemo(() => ({ ...state, ...actions, localVideo: media.local, remoteVideo: media.remote, audioBlocked }), [state, actions, media, audioBlocked]);

  return (
    <CallCtx.Provider value={value}>
      {children}
      {/* The remote voice plays here; it must stay mounted for the whole call. */}
      {/* not display:none - some WebViews / Safari pause media elements that are not rendered */}
      <audio ref={audioRef} autoPlay playsInline style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }} />
      {enabled && <CallUI />}
    </CallCtx.Provider>
  );
}
