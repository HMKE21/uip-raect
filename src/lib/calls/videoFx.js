/**
 * Live video filters for calls — no libraries, no network: the camera track is drawn into a <canvas> with the
 * 2D context's CSS-style `filter`, and the canvas' captureStream() track is what gets sent to the peer.
 * It is only created when a filter is picked; with "none" the raw camera track goes out untouched.
 *
 * Needs ctx.filter (Chrome, Edge, Firefox, Android WebView). Safari lacks it → supportsVideoFx() is false
 * and the UI hides the filters. Frames are drawn from a timer, so a background tab sends ~1 fps while a filter is on.
 */

export const FILTER_CSS = {
  bright: 'brightness(1.18) contrast(1.05) saturate(1.1)',
  vivid: 'contrast(1.12) saturate(1.45)',
  warm: 'sepia(.28) saturate(1.2) hue-rotate(-8deg) brightness(1.04)',
  cool: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)',
  bw: 'grayscale(1) contrast(1.1)',
  vintage: 'sepia(.6) contrast(1.05) brightness(.98) saturate(.9)',
};

/** Picker order + labels (en / ar). `css` is also used for the live preview chips. */
export const FILTER_LIST = [
  { id: 'none', en: 'None', ar: 'بدون' },
  { id: 'bright', en: 'Bright', ar: 'إضاءة' },
  { id: 'vivid', en: 'Vivid', ar: 'حيوي' },
  { id: 'warm', en: 'Warm', ar: 'دافئ' },
  { id: 'cool', en: 'Cool', ar: 'بارد' },
  { id: 'soft', en: 'Soft skin', ar: 'بشرة ناعمة' },
  { id: 'bw', en: 'B&W', ar: 'أبيض وأسود' },
  { id: 'vintage', en: 'Vintage', ar: 'قديم' },
  { id: 'portrait', en: 'Focus blur', ar: 'تركيز' },
];

let supportCache = null;
export function supportsVideoFx() {
  if (supportCache !== null) return supportCache;
  try {
    if (typeof document === 'undefined') return (supportCache = false);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    supportCache = !!ctx && 'filter' in ctx && typeof c.captureStream === 'function';
  } catch {
    supportCache = false;
  }
  return supportCache;
}

const MAX_W = 960; // cap the processed size: keeps CPU low on phones and the bitrate sane
const FPS = 24;

/** @returns {{attach:(track:MediaStreamTrack, filter:string)=>MediaStreamTrack|null, stop:()=>void}} */
export function createVideoFx() {
  if (!supportsVideoFx()) return { attach: () => null, stop() {} };

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  const work = document.createElement('canvas'); // scratch canvas for the focus-blur mask
  const wctx = work.getContext('2d');

  let filter = 'none';
  let src = null;
  let out = null;
  let timer = 0;
  let stopped = false;

  function fit() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    const k = Math.min(1, MAX_W / vw);
    const w = Math.round(vw * k);
    const h = Math.round(vh * k);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      work.width = w;
      work.height = h;
    }
    return true;
  }

  function draw() {
    if (stopped || video.readyState < 2 || !fit()) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    try {
      if (filter === 'portrait') {
        // soft-focus the whole frame, then paint the sharp frame back through a feathered round mask (centre stays sharp)
        ctx.filter = 'blur(10px) brightness(.96)';
        ctx.drawImage(video, -24, -24, w + 48, h + 48);
        ctx.filter = 'none';
        wctx.save();
        wctx.globalCompositeOperation = 'source-over';
        wctx.clearRect(0, 0, w, h);
        wctx.drawImage(video, 0, 0, w, h);
        wctx.globalCompositeOperation = 'destination-in';
        const g = wctx.createRadialGradient(w / 2, h * 0.5, h * 0.28, w / 2, h * 0.5, h * 0.6);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        wctx.fillStyle = g;
        wctx.fillRect(0, 0, w, h);
        wctx.restore();
        ctx.drawImage(work, 0, 0, w, h);
      } else if (filter === 'soft') {
        // sharp frame + a translucent blurred, slightly brighter copy on top = smoothing without losing the eyes/edges
        ctx.filter = 'none';
        ctx.drawImage(video, 0, 0, w, h);
        ctx.globalAlpha = 0.55;
        ctx.filter = 'blur(2.5px) brightness(1.08) saturate(1.05)';
        ctx.drawImage(video, 0, 0, w, h);
      } else {
        ctx.filter = FILTER_CSS[filter] || 'none';
        ctx.drawImage(video, 0, 0, w, h);
      }
    } catch { /* a frame that fails to draw is simply skipped */ }
    ctx.restore();
  }

  return {
    attach(track, f) {
      if (stopped || !track) return null;
      filter = f || 'none';
      if (src !== track) {
        src = track;
        video.srcObject = new MediaStream([track]);
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      }
      if (!out) {
        out = canvas.captureStream(FPS).getVideoTracks()[0] || null;
        if (!out) return null;
        timer = setInterval(draw, Math.round(1000 / FPS));
      }
      return out;
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = 0;
      try { out && out.stop(); } catch { /* ignore */ }
      out = null;
      try { video.srcObject = null; } catch { /* ignore */ }
    },
  };
}
