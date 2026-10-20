import { useEffect, useRef, useState } from 'react';

/**
 * WhatsApp-style attachment sheet: Document / Photos & videos / Camera / Poll / Location.
 * Only offers what the conversation allows (`can` flags). Rendered as a popover above the composer.
 */
function Tile({ color, icon, label, onClick }) {
  return (
    <button type="button" className="att-tile" onClick={onClick}>
      <span className="att-tile__icon" style={{ background: color }} aria-hidden="true">{icon}</span>
      <span className="att-tile__label">{label}</span>
    </button>
  );
}

const svg = (d) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICONS = {
  doc: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  media: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></>),
  camera: svg(<><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  poll: svg(<><path d="M5 20V10M12 20V4M19 20v-7" /></>),
  pin: svg(<><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
};

export default function AttachMenu({ ar, canFiles, canMedia, canPoll, canLocation, onPickFiles, onPickMedia, onPickCamera, onPoll, onLocation, title }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn?.(); };

  return (
    <div className="att-wrap" ref={wrap}>
      <button type="button" className={`msg-icon-btn${open ? ' is-active' : ''}`} title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .18s' }}><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open && (
        <div className="att-sheet" role="menu">
          {canFiles && <Tile color="#7f66ff" icon={ICONS.doc} label={ar ? 'مستند' : 'Document'} onClick={run(onPickFiles)} />}
          {canMedia && <Tile color="#1fa855" icon={ICONS.media} label={ar ? 'صور وفيديو' : 'Photos & videos'} onClick={run(onPickMedia)} />}
          {canMedia && <Tile color="#e53e6b" icon={ICONS.camera} label={ar ? 'الكاميرا' : 'Camera'} onClick={run(onPickCamera)} />}
          {canPoll && <Tile color="#f59e0b" icon={ICONS.poll} label={ar ? 'استطلاع' : 'Poll'} onClick={run(onPoll)} />}
          {canLocation && <Tile color="#0ea5a4" icon={ICONS.pin} label={ar ? 'الموقع' : 'Location'} onClick={run(onLocation)} />}
        </div>
      )}
    </div>
  );
}
