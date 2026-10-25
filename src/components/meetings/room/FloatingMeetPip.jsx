import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../Icon';

/**
 * Google-Meet-style FLOATING window (Document Picture-in-Picture, Chrome / Edge 116+).
 * While you present a tab / window / screen and switch to it, this small always-on-top window stays above every
 * app and shows: who is in the call (live video tiles), who has the mic off / hand up, the call timer, and the
 * controls (mic, camera, hand, chat, back to the meeting, stop sharing, leave).
 *
 * It is a real browser window rendered with a React portal, so it updates live from the same state as the room
 * (no copy of the data). Videos are MUTED here — the voices keep playing from the main room tab, so nothing is heard twice.
 * Browsers without the API (Firefox / Safari) simply don't get the button; the in-tab ScreenSharePip still works there.
 */
export const docPipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/** Opens / closes the floating window. `open()` must be called from a click (the browser requires a user gesture). */
export function useDocPip() {
  const [win, setWin] = useState(null);
  const winRef = useRef(null);
  const busy = useRef(false);

  const close = useCallback(() => {
    const w = winRef.current;
    winRef.current = null;
    setWin(null);
    try { w?.close(); } catch { /* already closed */ }
  }, []);

  const open = useCallback(async () => {
    if (!docPipSupported() || winRef.current || busy.current) return false;
    busy.current = true;
    try {
      const w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 280 });
      w.document.documentElement.dir = document.documentElement.dir || 'ltr';
      w.document.documentElement.lang = document.documentElement.lang || 'en';
      w.addEventListener('pagehide', () => { if (winRef.current === w) { winRef.current = null; setWin(null); } });
      winRef.current = w;
      setWin(w);
      return true;
    } catch {
      return false; // no user gesture / blocked by the browser: stay on the in-tab preview
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => () => { try { winRef.current?.close(); } catch { /* ignore */ } }, []);

  // Like Meet: when you switch to another tab/app during the call, Chrome asks the page to enter Picture-in-Picture by itself
  // (no click needed — it's allowed for pages using camera / mic). Unsupported browsers just throw here; that's fine.
  useEffect(() => {
    if (!docPipSupported() || !('mediaSession' in navigator)) return undefined;
    try { navigator.mediaSession.setActionHandler('enterpictureinpicture', () => { open(); }); } catch { /* not supported */ }
    return () => { try { navigator.mediaSession.setActionHandler('enterpictureinpicture', null); } catch { /* ignore */ } };
  }, [open]);

  return { supported: docPipSupported(), win, isOpen: !!win, open, close };
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#12141b;color:#fff;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none}
.fp{display:flex;flex-direction:column;height:100%;min-height:0}
.fp__top{display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:12px;font-weight:600;background:#1b1e29;border-bottom:1px solid rgba(255,255,255,.08);flex:none}
.fp__dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:fpp 1.6s ease-out infinite;flex:none}
@keyframes fpp{70%{box-shadow:0 0 0 7px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
.fp__ttl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__meta{display:inline-flex;align-items:center;gap:5px;color:#aab0c0;font-weight:600;flex:none}
.fp__grid{flex:1;min-height:0;display:grid;gap:6px;padding:8px;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));grid-auto-rows:1fr;align-content:stretch}
.fp__tile{position:relative;border-radius:10px;overflow:hidden;background:#242836;min-height:0;display:flex;align-items:center;justify-content:center;border:2px solid transparent}
.fp__tile.is-speaking{border-color:#34d399}
.fp__tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fp__tile video.is-me{transform:scaleX(-1)}
.fp__av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;z-index:1}
.fp__name{position:absolute;inset-inline:6px;bottom:5px;z-index:2;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.7)}
.fp__name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__chip{position:absolute;top:5px;inset-inline-end:5px;z-index:2;display:flex;gap:4px}
.fp__chip i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);font-size:12px}
.fp__chip i.off{background:#dc2626}
.fp__q{position:absolute;top:7px;inset-inline-start:7px;z-index:2;width:8px;height:8px;border-radius:50%;background:#34d399}
.fp__q.poor{background:#f59e0b}
.fp__more{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#aab0c0}
.fp__bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:8px;background:#1b1e29;border-top:1px solid rgba(255,255,255,.08);flex:none}
.fp__b{position:relative;width:38px;height:38px;border-radius:50%;border:0;cursor:pointer;background:#2c3142;color:#fff;display:inline-flex;align-items:center;justify-content:center;transition:filter .12s,transform .12s}
.fp__b:hover{filter:brightness(1.2)}.fp__b:active{transform:scale(.94)}
.fp__b.is-off{background:#dc2626}.fp__b.is-on{background:#4f46e5}
.fp__b.stop{width:auto;padding:0 14px;border-radius:999px;background:#ef4444;font:inherit;font-weight:700;font-size:12px;gap:5px}
.fp__b.leave{background:#ef4444}
.fp__badge{position:absolute;top:-3px;inset-inline-end:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:#ef4444;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
@media (max-width:260px){.fp__top .fp__meta.hide-xs,.fp__b.stop span{display:none}.fp__b{width:34px;height:34px}.fp__grid{grid-template-columns:repeat(auto-fit,minmax(80px,1fr))}}
@media (max-height:190px){.fp__top{display:none}.fp__grid{padding:5px}.fp__b{width:32px;height:32px}.fp__bar{padding:5px;gap:6px}}
@media (max-height:120px){.fp__grid{display:none}}
`;

/** One participant tile. The <video> is only attached while the camera / screen is really showing (saves decoding). */
const MiniTile = memo(function MiniTile({ p, you }) {
  const ref = useRef(null);
  const showVideo = !!p.remoteStream && (p.isLocal ? p.cameraEnabled !== false : (!!p.screenSharing || p.cameraEnabled !== false));
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.srcObject = showVideo ? p.remoteStream : null;
    if (showVideo) el.play?.().catch(() => {});
    return () => { el.srcObject = null; };
  }, [showVideo, p.remoteStream]);
  const initial = (p.displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const poor = p.connectionState === 'disconnected' || p.connectionQuality === 'poor' || p.connectionQuality === 'reconnecting';
  return (
    <div className="fp__tile">
      {showVideo
        ? <video ref={ref} muted autoPlay playsInline className={p.isLocal && !p.screenSharing ? 'is-me' : ''} />
        : <span className="fp__av">{initial}</span>}
      {!p.isLocal && <b className={`fp__q${poor ? ' poor' : ''}`} title={poor ? 'Weak connection' : 'Good connection'} />}
      <span className="fp__chip">
        {p.handRaised && <i title="Hand raised">✋</i>}
        {p.screenSharing && <i title="Presenting"><Icon name="screen-share" size={12} /></i>}
        {p.micEnabled === false && <i className="off" title="Muted"><Icon name="mic-off" size={12} /></i>}
      </span>
      <span className="fp__name"><span>{p.displayName}{you ? ` (${you})` : ''}</span>{p.isHost ? ' ★' : ''}</span>
    </div>
  );
});

function Panel({ people, elapsed, t, state, actions }) {
  const MAX = 6;
  const shown = people.slice(0, people.length > MAX ? MAX - 1 : MAX);
  const extra = people.length - shown.length;
  const sharing = !!state.screenSharing;
  return (
    <div className="fp">
      <div className="fp__top">
        {sharing && <span className="fp__dot" />}
        <span className="fp__ttl">{sharing ? t('You are presenting your screen') : t('Meeting')}</span>
        <span className="fp__meta"><Icon name="users" size={13} /> {people.length}</span>
        <span className="fp__meta hide-xs" dir="ltr">{elapsed}</span>
      </div>

      <div className="fp__grid">
        {shown.map((p) => <MiniTile key={p.key} p={p} you={p.isLocal ? t('You') : null} />)}
        {extra > 0 && <div className="fp__tile fp__more">+{extra}</div>}
      </div>

      <div className="fp__bar">
        <button type="button" className={`fp__b${state.micEnabled ? '' : ' is-off'}`} onClick={actions.toggleMic} title={state.micEnabled ? t('Mute') : t('Unmute')}>
          <Icon name={state.micEnabled ? 'mic' : 'mic-off'} size={18} />
        </button>
        <button type="button" className={`fp__b${state.cameraEnabled ? '' : ' is-off'}`} onClick={actions.toggleCamera} title={state.cameraEnabled ? t('Camera') : t('Camera off')}>
          <Icon name={state.cameraEnabled ? 'video' : 'video-off'} size={18} />
        </button>
        <button type="button" className={`fp__b${state.handRaised ? ' is-on' : ''}`} onClick={actions.toggleHand} title={state.handRaised ? t('Lower Hand') : t('Raise Hand')}>
          <Icon name="hand" size={18} />
        </button>
        <button type="button" className="fp__b" onClick={actions.openChat} title={t('Chat')}>
          <Icon name="message-square" size={18} />
          {state.unread ? <span className="fp__badge">{state.unread}</span> : null}
        </button>
        <button type="button" className="fp__b" onClick={actions.back} title={t('Back to meeting')}>
          <Icon name="external-link" size={17} />
        </button>
        {sharing && (
          <button type="button" className="fp__b stop" onClick={actions.stopShare} title={t('Stop Sharing')}>
            <Icon name="stop" size={14} /><span>{t('Stop Sharing')}</span>
          </button>
        )}
        <button type="button" className="fp__b leave" onClick={actions.leave} title={t('Leave Meeting')}>
          <Icon name="logout" size={17} />
        </button>
      </div>
    </div>
  );
}

/** Renders the panel INTO the floating window `win` (a React portal into that window's document). */
function FloatingMeetPip({ win, people, elapsed, t, state, actions }) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    if (!win) { setHost(null); return undefined; }
    const doc = win.document;
    const style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);
    const root = doc.createElement('div');
    root.style.height = '100%';
    doc.body.appendChild(root);
    setHost(root);
    return () => { try { root.remove(); style.remove(); } catch { /* window gone */ } setHost(null); };
  }, [win]);
  if (!win || !host) return null;
  return createPortal(<Panel people={people} elapsed={elapsed} t={t} state={state} actions={actions} />, host);
}

export default memo(FloatingMeetPip);
