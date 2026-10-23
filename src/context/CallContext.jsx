import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getTokens, MUTATION_EVENT } from '../api/client';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { createCallEngine } from '../lib/calls/callEngine';
import { startTone, stopTone, blip, unlockAudio } from '../lib/calls/ringtone';
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

function getUserMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('unsupported');
    e.name = 'NotSupportedError';
    return Promise.reject(e);
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
}

/** System notification + tab-title flash for a call that rings while the tab is in the background. */
function notifyIncoming(call, ar) {
  const name = (call && call.peer && call.peer.name) || '';
  const title = ar ? 'مكالمة صوتية واردة' : 'Incoming voice call';
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

export function CallProvider({ children }) {
  const { user, status, can, permissionsReady } = useAuth();
  const { locale } = useLanguage();
  const [state, setState] = useState(IDLE);
  const engineRef = useRef(null);
  const audioRef = useRef(null);
  const arRef = useRef(locale === 'ar');
  arRef.current = locale === 'ar';

  const enabled = status === 'authenticated' && !!user && permissionsReady && can('messaging.use');
  const userId = user && user.id;

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
      createPc: (cfg) => new RTCPeerConnection(cfg),
      tones: { start: startTone, stop: stopTone, blip },
      setRemoteStream: (stream, track) => {
        const el = audioRef.current;
        if (!el) return;
        el.srcObject = stream || (track ? new MediaStream([track]) : null);
        if (el.srcObject) el.play().catch(() => {});
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
    };
  }, [enabled, userId]);

  const actions = useMemo(() => ({
    startCall: (conversationId, peer) => (engineRef.current ? engineRef.current.startCall(conversationId, peer) : Promise.resolve(false)),
    accept: () => engineRef.current && engineRef.current.accept(),
    decline: () => engineRef.current && engineRef.current.decline(),
    hangup: () => engineRef.current && engineRef.current.hangup(),
    toggleMute: () => engineRef.current && engineRef.current.toggleMute(),
    setMinimized: (v) => engineRef.current && engineRef.current.setMinimized(v),
    dismissNotice: () => engineRef.current && engineRef.current.dismissNotice(),
  }), []);

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);

  return (
    <CallCtx.Provider value={value}>
      {children}
      {/* The remote voice plays here; it must stay mounted for the whole call. */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
      {enabled && <CallUI />}
    </CallCtx.Provider>
  );
}
