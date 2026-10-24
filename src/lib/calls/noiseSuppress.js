import { createRnnoiseNode, rnnoiseSupported, RNNOISE_SAMPLE_RATE } from '../rnnoise';

/**
 * Real noise isolation for calls. The browser's built-in "noiseSuppression" only removes steady hiss; fans, keyboards, traffic and
 * background chatter pass straight through. RNNoise is a neural voice-activity/denoise model that keeps the voice and drops the rest.
 *
 *   mic track -> [RNNoise] -> gain -> destination track   (what we send)
 *            \-> gain(raw) -/                              (bypass, when the user switches isolation off)
 *
 * Switching on/off mid-call is just a crossfade between the two gains, so the track the peer connection already sends never changes.
 * Anything that goes wrong (no AudioWorklet, wasm blocked, 44.1 kHz-only device...) returns null and the call simply keeps the
 * browser's own suppression - it must never break a call.
 */

export const noiseSuppressSupported = () => rnnoiseSupported();

/**
 * @param {MediaStream} stream  a stream from getUserMedia (audio and optionally video)
 * @param {boolean} enabled     initial state of the isolation switch
 * @returns {Promise<null | { stream: MediaStream, setEnabled: (on: boolean) => void }>}
 */
export async function attachNoiseSuppressor(stream, enabled = true) {
  if (!noiseSuppressSupported()) return null;
  const micTrack = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
  if (!micTrack) return null;

  let ctx = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ sampleRate: RNNOISE_SAMPLE_RATE, latencyHint: 'interactive' }); // RNNoise works at 48 kHz only
    const rnnoise = await createRnnoiseNode(ctx);
    if (!rnnoise) { ctx.close(); return null; }
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* resumes on the next gesture */ } }

    const src = ctx.createMediaStreamSource(new MediaStream([micTrack]));
    const dest = ctx.createMediaStreamDestination();
    const gainClean = ctx.createGain();
    const gainRaw = ctx.createGain();
    src.connect(rnnoise); rnnoise.connect(gainClean); gainClean.connect(dest);
    src.connect(gainRaw); gainRaw.connect(dest);

    const setEnabled = (on) => {
      const t = ctx.currentTime;
      gainClean.gain.setTargetAtTime(on ? 1 : 0, t, 0.02);
      gainRaw.gain.setTargetAtTime(on ? 0 : 1, t, 0.02);
    };
    setEnabled(!!enabled);

    const outAudio = dest.stream.getAudioTracks()[0];
    if (!outAudio) { ctx.close(); return null; }

    // Stopping the track the call sends must also release the real microphone and the audio graph.
    const realStop = outAudio.stop.bind(outAudio);
    let released = false;
    outAudio.stop = () => {
      if (released) return;
      released = true;
      try { realStop(); } catch { /* already stopped */ }
      try { micTrack.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); rnnoise.disconnect(); } catch { /* ignore */ }
      try { rnnoise.destroy && rnnoise.destroy(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
    };
    // If the OS/browser ends the microphone (unplugged, permission revoked), end ours too.
    micTrack.addEventListener('ended', () => { if (!released) outAudio.stop(); });

    const out = new MediaStream([outAudio, ...stream.getVideoTracks()]);
    return { stream: out, setEnabled };
  } catch (e) {
    try { console.warn('[call] noise isolation unavailable, using the browser filter:', e && e.message); } catch { /* diagnostics only */ }
    try { ctx && ctx.close(); } catch { /* ignore */ }
    return null;
  }
}
