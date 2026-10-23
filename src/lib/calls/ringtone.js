/**
 * Call sounds, synthesized with Web Audio (no audio files to ship or cache).
 *   startTone('incoming')  two-beat ring, repeats until stopTone()
 *   startTone('outgoing')  soft ringback (what the caller hears while the other phone rings)
 *   blip('connect'|'end')  short confirmation tones
 * Browsers only allow audio after a user gesture: unlockAudio() is called on the first pointer/key event of the page,
 * so a call that arrives before any interaction rings silently (the visual card + system notification still show).
 */
let ctx = null;
let timer = 0;
let current = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function beep(freqs, at, dur, vol) {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + at;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  g.gain.setValueAtTime(vol, t0 + Math.max(0.04, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(c.destination);
  freqs.forEach((f) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

const PATTERNS = {
  // [beats...] each beat = [freqs, offsetSeconds, durationSeconds]; cycle = total length in ms
  incoming: { cycle: 3000, vol: 0.22, beats: [[[440, 480], 0, 0.4], [[440, 480], 0.55, 0.4]] },
  outgoing: { cycle: 4000, vol: 0.14, beats: [[[425], 0, 1.0]] },
};

export function stopTone() {
  if (timer) clearInterval(timer);
  timer = 0;
  current = null;
}

export function startTone(kind) {
  if (current === kind) return;
  stopTone();
  const p = PATTERNS[kind];
  if (!p) return;
  current = kind;
  const play = () => {
    unlockAudio();
    p.beats.forEach(([f, at, d]) => beep(f, at, d, p.vol));
  };
  play();
  timer = setInterval(play, p.cycle);
}

export function blip(kind) {
  unlockAudio();
  if (kind === 'connect') {
    beep([660], 0, 0.12, 0.16);
    beep([880], 0.14, 0.16, 0.16);
  } else {
    beep([520], 0, 0.14, 0.16);
    beep([390], 0.16, 0.2, 0.16);
  }
}
