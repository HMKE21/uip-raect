import { createRnnoiseNode, rnnoiseSupported, RNNOISE_SAMPLE_RATE } from '../../lib/rnnoise';

/**
 * Voice-note audio engine: live level meter (drives the scrolling waveform) + optional noise cancelling.
 *
 *   mic ─┬─ raw ─────────────────────────────────────────────────────┐
 *        └─ high-pass → RNNoise → limiter → low-pass → noise gate ┴→ [recorded stream]
 *
 * "Noise cancel" ON  = RNNoise (a recurrent neural network trained on speech, runs in an AudioWorklet — it removes keyboard
 *                      clicks, fans, street noise, crowd chatter…) + the filter chain + a gentle adaptive gate.
 *                      While RNNoise is still loading (first use only) or if it is unsupported, the browser's own noise
 *                      suppression + a stricter adaptive gate cover for it, so the first seconds are never unprotected.
 * OFF                = untouched microphone signal. Can be flipped at any moment, even mid-recording (cross-faded).
 * Falls back to the plain stream when Web Audio is unavailable, so recording itself can never break.
 */
const BAR = 3;
const GAP = 2;

export function createVoiceEngine(stream, { noiseCancel = true, getCanvas } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const fallback = { recordStream: stream, setNoiseCancel() {}, stop() {}, supported: false };
  if (!AC) return fallback;

  let ctx;
  try {
    ctx = new AC({ sampleRate: RNNOISE_SAMPLE_RATE }); // RNNoise only works at 48 kHz
  } catch {
    try { ctx = new AC(); } catch { return fallback; }
  }
  let on = !!noiseCancel;
  let raf = 0;
  let stopped = false;
  let neural = false; // RNNoise node is in the graph
  let neuralFailed = !rnnoiseSupported(); // RNNoise cannot run here (or failed to load): the browser's own processing takes over

  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.4;
  src.connect(analyser);

  const dest = ctx.createMediaStreamDestination();
  const rawGain = ctx.createGain();
  const procGain = ctx.createGain();
  src.connect(rawGain); rawGain.connect(dest);

  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30; hp.Q.value = 0.6;   // rumble, AC hum, wind
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.7;   // hiss above speech
  // brick-wall limiter (no compressor: it lifted the room noise in every pause and squeezed the voice)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.1;
  const gate = ctx.createGain();
  // denoiseIn → denoiseOut is a straight wire until RNNoise finishes loading, then it is re-routed through the network.
  const denoiseIn = ctx.createGain();
  const denoiseOut = ctx.createGain();
  src.connect(hp); hp.connect(denoiseIn); denoiseIn.connect(denoiseOut);
  denoiseOut.connect(lp); lp.connect(comp); comp.connect(gate); gate.connect(procGain); procGain.connect(dest);

  const track = stream.getAudioTracks()[0];
  const applyMode = () => {
    const t = ctx.currentTime;
    rawGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.03);
    procGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.03);
    if (!on) gate.gain.setTargetAtTime(1, t, 0.02);
    // RNNoise does the heavy lifting; stacking the browser's echo canceller / suppressor / auto-gain on top of it only adds
    // artefacts (measured: ~4 dB lost on the cleaned voice, and the gain control lifts the room noise in every pause), so
    // they step aside while RNNoise runs or is about to. Only when it cannot run does the browser's processing take over.
    const useBrowser = !(on && !neuralFailed);
    try { track?.applyConstraints({ noiseSuppression: on && useBrowser, echoCancellation: useBrowser, autoGainControl: on && useBrowser }).catch(() => {}); } catch { /* not supported live */ }
  };
  applyMode();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  createRnnoiseNode(ctx).then((rn) => {
    if (!rn) { neuralFailed = true; applyMode(); return; }
    if (stopped) { try { rn.disconnect(); } catch { /* gone */ } return; }
    try {
      denoiseIn.disconnect(denoiseOut);
      denoiseIn.connect(rn); rn.connect(denoiseOut);
      neural = true;
      applyMode();
    } catch { /* keep the filter chain */ }
  });

  // ---- meter + gate + waveform
  const buf = new Uint8Array(analyser.fftSize);
  const levels = [];
  let level = 0;       // smoothed 0..1 for drawing
  let floor = 0.01;    // adaptive noise floor (RMS)
  let hang = 0;        // gate hang time (ms)
  let lastPush = 0;
  let last = performance.now();
  let color = '';

  const draw = () => {
    const canvas = getCanvas?.();
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    if (!color) color = getComputedStyle(canvas).color || '#5b6cff';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const n = Math.floor((w + GAP) / (BAR + GAP));
    const shown = levels.slice(-n);
    const mid = h / 2;
    g.fillStyle = color;
    for (let i = 0; i < n; i += 1) {
      const v = shown[shown.length - 1 - i];            // newest bar sits at the right edge
      const x = w - (i + 1) * (BAR + GAP) + GAP;
      const bh = Math.max(3, (v === undefined ? 0 : v) * (h - 2));
      g.globalAlpha = v === undefined ? 0.18 : 0.95 - Math.min(0.55, i / n * 0.55);
      g.beginPath();
      if (g.roundRect) g.roundRect(x, mid - bh / 2, BAR, bh, 1.5); else g.rect(x, mid - bh / 2, BAR, bh);
      g.fill();
    }
    g.globalAlpha = 1;
  };

  const tick = (now) => {
    if (stopped) return;
    const dt = now - last; last = now;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) { const x = (buf[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / buf.length);

    // noise floor: drops instantly to quieter rooms, creeps up slowly (so a long word does not become "noise")
    floor = rms < floor ? rms : floor + (rms - floor) * 0.0015;
    const open = rms > Math.max(0.014, floor * 2.4);
    if (open) hang = 260; else hang = Math.max(0, hang - dt);
    // with RNNoise the gate only has to mop up what is left, so it stays gentle (no pumping); without it, it is strict.
    if (on) gate.gain.setTargetAtTime(open || hang > 0 ? 1 : (neural ? 0.35 : 0.1), ctx.currentTime, open ? 0.008 : 0.14);

    const target = Math.min(1, Math.pow(rms * 4.2, 0.8));
    level += (target - level) * (target > level ? 0.55 : 0.18); // fast attack, slow release
    if (now - lastPush > 55) { levels.push(level); if (levels.length > 600) levels.shift(); lastPush = now; }
    draw();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    supported: true,
    get neural() { return neural; },
    recordStream: dest.stream,
    setNoiseCancel(v) { on = !!v; applyMode(); },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      try { src.disconnect(); } catch { /* already gone */ }
      ctx.close().catch(() => {});
    },
  };
}
