import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Drag handle on the inner edge of the conversation-info panel.
 *  - drag with mouse / touch / pen, or focus it and use ← → (Shift = bigger steps), Home / End
 *  - double-click (or Enter) resets to the default width
 *  - the width is clamped so the chat itself never gets squeezed below a usable size
 *  - remembered per browser
 * It only drives the `--msg-info-w` custom property on `.msg-app`; all layout stays in CSS.
 */
export const INFO_W_KEY = 'uip_msg_info_w';
export const INFO_W_MIN = 280;
export const INFO_W_MAX = 560;
export const INFO_W_DEFAULT = 340;
const THREAD_MIN = 380; // never let the chat column get narrower than this

export const readInfoWidth = () => {
  try {
    const n = Number(localStorage.getItem(INFO_W_KEY));
    return Number.isFinite(n) && n >= INFO_W_MIN && n <= INFO_W_MAX ? n : null;
  } catch { return null; }
};

export default function InfoResizer({ appRef, width, onWidth }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [drag, setDrag] = useState(false);
  const edge = useRef(0);
  const raf = useRef(0);

  const limit = useCallback(() => {
    const app = appRef.current;
    if (!app) return INFO_W_MAX;
    const total = app.clientWidth;
    const railW = app.classList.contains('rail-collapsed') ? 0 : (app.querySelector('.msg-rail')?.offsetWidth || 0);
    const overlay = total < 1480; // the panel floats over the chat at these widths
    const room = overlay ? total * 0.92 : total - railW - THREAD_MIN - 32;
    return Math.max(INFO_W_MIN, Math.min(INFO_W_MAX, Math.floor(room)));
  }, [appRef]);

  const clamp = useCallback((w) => Math.round(Math.max(INFO_W_MIN, Math.min(limit(), w))), [limit]);
  const commit = useCallback((w, persist) => {
    const v = clamp(w);
    onWidth(v, persist);
  }, [clamp, onWidth]);

  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const panel = appRef.current?.querySelector(':scope > .msg-info');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    // the panel's outer edge stays put; the inner edge follows the pointer
    edge.current = document.documentElement.dir === 'rtl' || getComputedStyle(panel).direction === 'rtl' ? r.left : r.right;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(true);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!drag) return;
    const x = e.clientX;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => commit(Math.abs(x - edge.current), false));
  };
  const onUp = (e) => {
    if (!drag) return;
    setDrag(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    commit(Math.abs(e.clientX - edge.current), true);
  };
  const onKey = (e) => {
    const step = e.shiftKey ? 48 : 16;
    const rtl = getComputedStyle(appRef.current || document.body).direction === 'rtl';
    // the panel sits at the inline-end; an arrow moving its inner edge away from the screen edge widens it
    const dir = e.key === 'ArrowLeft' ? (rtl ? -1 : 1) : e.key === 'ArrowRight' ? (rtl ? 1 : -1) : 0;
    if (dir) { e.preventDefault(); commit(width + dir * step, true); return; }
    if (e.key === 'Home') { e.preventDefault(); commit(INFO_W_MIN, true); }
    else if (e.key === 'End') { e.preventDefault(); commit(INFO_W_MAX, true); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(INFO_W_DEFAULT, true); }
  };

  // keep the width valid when the window shrinks
  useEffect(() => {
    const fix = () => { const v = clamp(width); if (v !== width) onWidth(v, false); };
    window.addEventListener('resize', fix);
    return () => { window.removeEventListener('resize', fix); cancelAnimationFrame(raf.current); };
  }, [clamp, width, onWidth]);

  useEffect(() => {
    if (!drag) return undefined;
    document.body.classList.add('msg-resizing');
    return () => document.body.classList.remove('msg-resizing');
  }, [drag]);

  return (
    <div
      className={`msg-info-resizer${drag ? ' is-drag' : ''}`}
      role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={ar ? 'تغيير عرض معلومات المحادثة' : 'Resize conversation info'}
      aria-valuemin={INFO_W_MIN} aria-valuemax={INFO_W_MAX} aria-valuenow={width}
      title={ar ? 'اسحب للتوسيع أو التضييق · دبل كليك للرجوع للحجم الافتراضي' : 'Drag to resize · double-click to reset'}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onDoubleClick={() => commit(INFO_W_DEFAULT, true)}
      onKeyDown={onKey}
    >
      <span className="msg-info-resizer__grip" aria-hidden="true" />
      {drag && <span className="msg-info-resizer__tip" aria-hidden="true">{width}px</span>}
    </div>
  );
}
