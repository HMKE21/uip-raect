/**
 * Camera effects for the meeting room: colour filters, skin softening, low-light boost and background blur.
 *
 *   raw camera track -> hidden <video> -> canvas (filter / blur) -> canvas.captureStream() track (what peers receive)
 *
 * The raw camera track is never touched, so switching back to "No effect" is just swapping the sender back to it. Frames are
 * pumped by a Worker timer rather than requestAnimationFrame so the picture does not freeze when the meeting tab is in the
 * background. Background blur needs a person-segmentation model (MediaPipe, loaded on demand from a CDN the first time it is
 * chosen); if it cannot load, the caller is told and keeps a plain colour effect instead of breaking the camera.
 */

export const CAMERA_EFFECTS = [
  { id: 'none', label: 'No effect', css: '' },
  { id: 'enhance', label: 'Enhance', css: 'brightness(1.06) contrast(1.1) saturate(1.18)' },
  { id: 'lowlight', label: 'Low light', css: 'brightness(1.35) contrast(1.08) saturate(1.05)' },
  { id: 'soft', label: 'Soft skin', css: 'brightness(1.05) saturate(1.05)', soften: true },
  { id: 'warm', label: 'Warm', css: 'sepia(0.22) saturate(1.2) brightness(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(-10deg) saturate(1.1) brightness(1.04)' },
  { id: 'bw', label: 'Black & white', css: 'grayscale(1) contrast(1.12)' },
  { id: 'blur', label: 'Blur background', css: 'brightness(1.03) contrast(1.04)', segment: true },
];

export const cameraFxSupported = () => typeof document !== 'undefined'
  && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
let segmenterPromise = null;

function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const make = (delegate) => vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
      });
      try { return await make('GPU'); } catch { return make('CPU'); }
    })().catch((e) => { segmenterPromise = null; throw e; });
  }
  return segmenterPromise;
}

/** A timer that keeps ticking in background tabs (Worker timers are not throttled like main-thread ones). */
function makeTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${ms})`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

/**
 * @param {MediaStreamTrack} rawTrack the real camera track
 * @returns {{ track: MediaStreamTrack, setEffect: (id: string) => Promise<void>, stop: () => void }}
 */
export function createCameraFx(rawTrack) {
  const settings = rawTrack.getSettings ? rawTrack.getSettings() : {};
  const W = settings.width || 1280;
  const H = settings.height || 720;
  const FPS = Math.min(30, Math.round(settings.frameRate || 30));

  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.srcObject = new MediaStream([rawTrack]);
  video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const out = canvas.captureStream(FPS);
  const track = out.getVideoTracks()[0];
  try { track.contentHint = 'motion'; } catch { /* optional */ }

  // person cut-out helpers (background blur)
  const personCanvas = document.createElement('canvas'); personCanvas.width = W; personCanvas.height = H;
  const pctx = personCanvas.getContext('2d');
  const maskCanvas = document.createElement('canvas');
  const mctx = maskCanvas.getContext('2d');
  let segmenter = null;
  let haveMask = false;
  let segBusy = false;
  let lastSeg = 0;

  let effect = CAMERA_EFFECTS[0];
  let stopped = false;

  function updateMask(result) {
    const m = result && result.confidenceMasks && result.confidenceMasks[0];
    if (!m) return;
    const w = m.width; const h = m.height;
    const data = m.getAsFloat32Array();
    if (maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas.width = w; maskCanvas.height = h; }
    // Polarity differs between model builds (mask = "person" vs "background"); the person is the thing in the middle of the frame.
    let centre = 0; let corners = 0; let nc = 0; let nk = 0;
    for (let y = Math.floor(h * 0.35); y < Math.floor(h * 0.75); y += 4) for (let x = Math.floor(w * 0.4); x < Math.floor(w * 0.6); x += 4) { centre += data[y * w + x]; nc += 1; }
    for (let y = 0; y < Math.floor(h * 0.2); y += 4) for (let x = 0; x < Math.floor(w * 0.15); x += 4) { corners += data[y * w + x]; nk += 1; }
    const invert = nc && nk ? (centre / nc) < (corners / nk) : false;
    const img = mctx.createImageData(w, h);
    for (let i = 0; i < data.length; i += 1) {
      const p = invert ? 1 - data[i] : data[i];
      img.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(((p - 0.35) / 0.3) * 255))); // soft edge
    }
    mctx.putImageData(img, 0, 0);
    haveMask = true;
  }

  function draw() {
    if (stopped || video.readyState < 2) return;
    const now = performance.now();
    const fx = effect;

    if (fx.segment && segmenter && now - lastSeg > 55 && !segBusy) {
      segBusy = true; lastSeg = now;
      try { segmenter.segmentForVideo(video, now, (res) => { updateMask(res); segBusy = false; }); } catch { segBusy = false; }
    }

    if (fx.segment && segmenter && haveMask) {
      ctx.filter = 'blur(14px) brightness(1.02)';
      ctx.drawImage(video, 0, 0, W, H);
      ctx.filter = 'none';
      pctx.globalCompositeOperation = 'source-over';
      pctx.clearRect(0, 0, W, H);
      pctx.filter = fx.css || 'none';
      pctx.drawImage(video, 0, 0, W, H);
      pctx.filter = 'none';
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(maskCanvas, 0, 0, W, H);
      ctx.drawImage(personCanvas, 0, 0, W, H);
      return;
    }

    ctx.filter = fx.css || 'none';
    ctx.drawImage(video, 0, 0, W, H);
    ctx.filter = 'none';
    if (fx.soften) {
      ctx.globalAlpha = 0.45;
      ctx.filter = 'blur(2.5px) brightness(1.04)';
      ctx.drawImage(video, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
  }

  const stopTicker = makeTicker(draw, Math.round(1000 / FPS));

  return {
    track,
    async setEffect(id) {
      const next = CAMERA_EFFECTS.find((e) => e.id === id) || CAMERA_EFFECTS[0];
      if (next.segment && !segmenter) segmenter = await loadSegmenter(); // throws if the model cannot be fetched
      haveMask = false;
      effect = next;
    },
    stop() {
      stopped = true;
      stopTicker();
      try { track.stop(); } catch { /* already stopped */ }
      try { video.srcObject = null; } catch { /* ignore */ }
    },
  };
}
