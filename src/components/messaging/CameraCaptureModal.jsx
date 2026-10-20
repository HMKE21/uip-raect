import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FILTERS = [
  { id: 'none', en: 'Normal', ar: 'عادي', css: 'none' },
  { id: 'bw', en: 'B&W', ar: 'أبيض وأسود', css: 'grayscale(1) contrast(1.1)' },
  { id: 'sepia', en: 'Sepia', ar: 'سيبيا', css: 'sepia(.85)' },
  { id: 'vintage', en: 'Vintage', ar: 'قديم', css: 'sepia(.4) contrast(1.1) brightness(.95) saturate(1.3) hue-rotate(-10deg)' },
  { id: 'warm', en: 'Warm', ar: 'دافئ', css: 'sepia(.25) saturate(1.3) brightness(1.05) hue-rotate(-8deg)' },
  { id: 'cool', en: 'Cool', ar: 'بارد', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.03)' },
  { id: 'vivid', en: 'Vivid', ar: 'ساطع', css: 'saturate(1.8) contrast(1.15)' },
  { id: 'fade', en: 'Fade', ar: 'باهت', css: 'contrast(.85) brightness(1.1) saturate(.8)' },
  { id: 'noir', en: 'Noir', ar: 'داكن', css: 'grayscale(1) contrast(1.5) brightness(.85)' },
];

/** In-app camera capture (desktop + Android APK) (getUserMedia) with live filters. Returns a File via onCapture. */
export default function CameraCaptureModal({ ar, onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const filterRef = useRef('none');
  const rafRef = useRef(0);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState('user');
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState('none');
  const [mode, setMode] = useState('photo'); // photo | video
  const [secs, setSecs] = useState(0);
  const audioRef = useRef(null);

  const canFilter = typeof document !== 'undefined' && 'filter' in document.createElement('canvas').getContext('2d');
  filterRef.current = canFilter ? (FILTERS.find((f) => f.id === filter)?.css || 'none') : 'none';

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const stopAudio = () => { audioRef.current?.getTracks().forEach((t) => t.stop()); audioRef.current = null; };

  const draw = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (v && c && v.videoWidth) {
      if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
      const ctx = c.getContext('2d');
      ctx.filter = filterRef.current;
      ctx.drawImage(v, 0, 0, c.width, c.height);
    }
    rafRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false); setError('');
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(ar ? 'المتصفح لا يدعم الكاميرا (يتطلب HTTPS).' : 'Camera is not supported (HTTPS required).');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current;
        if (v) { v.srcObject = s; v.play?.().catch(() => {}); }
        setReady(true);
        rafRef.current = requestAnimationFrame(draw);
      })
      .catch((e) => setError(e?.name === 'NotAllowedError'
        ? (ar ? 'تم رفض إذن الكاميرا. فعّله من إعدادات المتصفح.' : 'Camera permission denied. Allow it in browser settings.')
        : (ar ? 'لا توجد كاميرا متاحة.' : 'No camera available.')));
    return () => { cancelled = true; stop(); stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, ar]);

  useEffect(() => {
    if (!recording) { setSecs(0); return undefined; }
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const snap = () => {
    const c = canvasRef.current;
    if (!c || !c.width) return;
    c.toBlob((b) => {
      if (b) onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  const toggleRec = async () => {
    if (recording) { recRef.current?.stop(); return; }
    const c = canvasRef.current;
    if (!c || !c.captureStream || typeof MediaRecorder === 'undefined') return;
    chunksRef.current = [];
    const out = c.captureStream(30);
    try {
      const a = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRef.current = a;
      a.getAudioTracks().forEach((t) => out.addTrack(t));
    } catch { /* record without sound */ }
    const pref = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    const rec = pref ? new MediaRecorder(out, { mimeType: pref }) : new MediaRecorder(out);
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      setRecording(false);
      stopAudio();
      const type = (rec.mimeType || 'video/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      onCapture(new File([new Blob(chunksRef.current, { type })], `video-${Date.now()}.${ext}`, { type }));
    };
    recRef.current = rec; rec.start(1000); setRecording(true);
  };

  const shutter = () => (mode === 'photo' ? snap() : toggleRec());
  const canVideo = typeof MediaRecorder !== 'undefined';
  const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const btn = { border: 0, borderRadius: 999, padding: '10px 18px', cursor: 'pointer', fontWeight: 600 };
  const thumbBase = { flex: '0 0 auto', border: '2px solid transparent', borderRadius: 10, padding: 0, background: 'none', cursor: 'pointer', color: '#fff', fontSize: 12, textAlign: 'center' };
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget && !recording) onClose(); }}>
      <div style={{ background: '#111', borderRadius: 16, padding: 14, width: 'min(560px,100%)', maxHeight: '100%', overflowY: 'auto', color: '#fff' }}>
        <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
        {error ? <p style={{ padding: 24, textAlign: 'center' }}>{error}</p> : (
          <canvas ref={canvasRef} style={{ width: '100%', borderRadius: 12, background: '#000', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
        )}
        {!error && canFilter && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 4 }} role="listbox" aria-label={ar ? 'الفلاتر' : 'Filters'}>
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                style={{ ...thumbBase, borderColor: filter === f.id ? '#e53e6b' : 'transparent' }}>
                <span style={{ display: 'block', width: 64, height: 44, borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#22c55e 50%,#3b82f6)', filter: f.css }} />
                <span style={{ display: 'block', marginTop: 3 }}>{ar ? f.ar : f.en}</span>
              </button>
            ))}
          </div>
        )}
        {!error && canVideo && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
            {[['photo', ar ? 'صورة' : 'Photo'], ['video', ar ? 'فيديو' : 'Video']].map(([k, l]) => (
              <button key={k} type="button" disabled={recording} onClick={() => setMode(k)}
                style={{ ...btn, padding: '6px 16px', background: mode === k ? '#fff' : '#374151', color: mode === k ? '#111' : '#fff' }}>{l}</button>
            ))}
          </div>
        )}
        {recording && <div style={{ textAlign: 'center', marginTop: 8, color: '#f87171', fontWeight: 700 }}>● {fmt(secs)}</div>}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
          <button type="button" style={{ ...btn, background: '#fff', color: '#111' }} onClick={() => { if (recording) recRef.current?.stop(); onClose(); }}>{ar ? 'إغلاق' : 'Close'}</button>
          {!error && (
            <button type="button" aria-label={mode === 'photo' ? (ar ? 'التقاط' : 'Capture') : (recording ? (ar ? 'إيقاف' : 'Stop') : (ar ? 'تسجيل' : 'Record'))}
              disabled={!ready} onClick={shutter}
              style={{ width: 66, height: 66, borderRadius: '50%', border: '4px solid #fff', background: 'transparent', padding: 4, cursor: 'pointer' }}>
              <span style={{ display: 'block', width: '100%', height: '100%', background: mode === 'video' ? '#dc2626' : '#fff', borderRadius: recording ? 8 : '50%', transition: 'border-radius .15s' }} />
            </button>
          )}
          {!error && <button type="button" style={{ ...btn, background: '#374151', color: '#fff' }} disabled={recording} onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>{facing === 'user' ? (ar ? 'الخلفية' : 'Rear') : (ar ? 'الأمامية' : 'Front')}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
