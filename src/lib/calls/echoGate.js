/**
 * Forced echo / feedback breaker ("half-duplex"), used by 1:1 calls AND meeting rooms.
 *
 * Why it exists: the browser's own echo canceller is a *best effort* — on some machines / headsets / WebViews it does nothing,
 * and then the other person's voice leaks from the speaker back into the mic, travels back to them delayed (the "repeating"
 * voice) and, when the loop gain reaches 1, turns into a whistle. No amount of tuning the constraints fixes a canceller that is
 * not running, so this module breaks the loop *electrically* instead:
 *
 *   mic track -> [gain gate] -> track we send
 *
 * The gate CLOSES (mic muted) the moment any remote participant is audible, and re-opens ~450 ms after they stop (that tail
 * covers the room reverb + network round trip). While it is closed nothing from the speaker can be sent back, so there is no
 * loop and nothing to repeat or squeal. The price is walkie-talkie behaviour: you cannot talk over someone — except by speaking
 * clearly LOUDER than an echo ever is (barge-in), which re-opens the gate for 300 ms at a time.
 *
 * Safety rules (this must never leave anybody silent):
 *  - the AudioContext must be "running" when the gate is built, otherwise no gate is added and the plain mic is used;
 *  - hidden tab / timer throttled (> 300 ms between checks) -> the gate fails OPEN;
 *  - switch it off for yourself with localStorage `uip.call.halfduplex` = '0'.
 */

const KEY = 'uip.call.halfduplex';
export const echoGateEnabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setEchoGateEnabled = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } };

const TICK_MS = 20;
const REMOTE_PEAK = 0.02;   // a remote voice is "audible" above this (0..1 of full scale)
const HOLD_MS = 450;        // keep the mic closed this long after the last remote sound
const BARGE_PEAK = 0.3;     // your own clearly-louder voice breaks through
const BARGE_TICKS = 2;      // ...if it stays above for 2 checks in a row (40 ms)
const BARGE_HOLD_MS = 300;

let ctx = null;
function getCtx() {
  if (ctx && ctx.state !== 'closed') return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { ctx = null; } }
  return ctx;
}

function peakOf(an, buf) {
  an.getByteTimeDomainData(buf);
  let p = 0;
  for (let i = 0; i < buf.length; i += 1) { const v = Math.abs(buf[i] - 128); if (v > p) p = v; }
  return p / 128;
}

/** key -> { src, an, buf } — remote voices we listen to (analysis only: never connected to the speakers). */
const remotes = new Map();
const gates = new Set();
let timer = null;
let holdUntil = 0;
let lastTick = 0;

/** Tell the gate which remote audio exists. Pass null (or a stream without audio) to forget that key. */
export function setRemoteAudio(key, stream) {
  const old = remotes.get(key);
  if (old) { try { old.src.disconnect(); } catch { /* gone */ } remotes.delete(key); }
  if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return;
  const c = getCtx();
  if (!c) return;
  try {
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    remotes.set(key, { src, an, buf: new Uint8Array(an.fftSize) });
  } catch { /* an ended / unsupported track: it simply isn't monitored */ }
}

/** Forget every remote whose key starts with `prefix` (leaving a meeting / ending a call). */
export function clearRemoteAudio(prefix = '') {
  Array.from(remotes.keys()).forEach((k) => { if (k.startsWith(prefix)) setRemoteAudio(k, null); });
}

function openAll() {
  gates.forEach((g) => g.set(false));
}

function tick() {
  const now = performance.now();
  const gap = lastTick ? now - lastTick : 0;
  lastTick = now;
  // Throttled timers (background tab) or a hidden page: never keep anybody muted on stale information.
  if (gap > 300 || (typeof document !== 'undefined' && document.hidden)) { holdUntil = 0; openAll(); return; }

  let remote = 0;
  remotes.forEach((r) => { const p = peakOf(r.an, r.buf); if (p > remote) remote = p; });
  if (remote > REMOTE_PEAK) holdUntil = now + HOLD_MS;
  const remoteActive = now < holdUntil;

  gates.forEach((g) => {
    const mic = peakOf(g.an, g.buf);
    g.loud = mic > BARGE_PEAK ? g.loud + 1 : 0;
    if (g.loud >= BARGE_TICKS) g.bargeUntil = now + BARGE_HOLD_MS;
    g.set(remoteActive && now >= g.bargeUntil);
  });
}

/**
 * Put the gate in front of the microphone of `stream`.
 * @param {MediaStream} stream  stream whose FIRST audio track is the microphone (video tracks are passed through untouched)
 * @returns {Promise<null | { stream: MediaStream }>} null -> no gate (caller keeps using `stream`)
 */
export async function attachEchoGate(stream) {
  const micTrack = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
  if (!micTrack) return null;
  const c = getCtx();
  if (!c) return null;
  try {
    if (c.state !== 'running') {
      await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
    }
    if (c.state !== 'running') return null; // a suspended context outputs silence: never risk a muted mic

    const src = c.createMediaStreamSource(new MediaStream([micTrack]));
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const gain = c.createGain();
    gain.gain.value = 1;
    const dest = c.createMediaStreamDestination();
    src.connect(gain);
    gain.connect(dest);
    const out = dest.stream.getAudioTracks()[0];
    if (!out) { try { src.disconnect(); } catch { /* ignore */ } return null; }
    try { out.contentHint = 'speech'; } catch { /* optional */ }

    const g = {
      an, buf: new Uint8Array(an.fftSize), loud: 0, bargeUntil: 0, closed: false,
      set(close) {
        if (close === g.closed) return;
        g.closed = close;
        const t = c.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(close ? 0 : 1, t, close ? 0.004 : 0.03);
      },
    };
    gates.add(g);
    if (!timer) { lastTick = 0; timer = setInterval(tick, TICK_MS); }

    // Stopping the track we send must release the real microphone and the gate.
    const realStop = out.stop.bind(out);
    let released = false;
    out.stop = () => {
      if (released) return;
      released = true;
      gates.delete(g);
      if (!gates.size && timer) { clearInterval(timer); timer = null; }
      try { realStop(); } catch { /* already stopped */ }
      try { micTrack.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
    micTrack.addEventListener('ended', () => { if (!released) out.stop(); });

    return { stream: new MediaStream([out, ...stream.getVideoTracks()]) };
  } catch (e) {
    try { console.warn('[call] echo gate unavailable, sending the plain microphone:', e && e.message); } catch { /* diagnostics only */ }
    return null;
  }
}
