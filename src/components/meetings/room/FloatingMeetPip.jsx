import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../Icon';
import { avatarColor, useSpeaking } from './speaking';

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
      const w = await window.documentPictureInPicture.requestWindow({ width: 420, height: 360 });
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
:root{--bg:#1b1c20;--panel:#26282d;--panel2:#3a3d44;--tile:#2f3238;--line:rgba(255,255,255,.08);--txt:#f3f4f6;--mut:#a3aab6;--acc:#8ab4f8;--red:#ea4335;--green:#34d399}
html,body{margin:0;height:100%;background:var(--bg);color:var(--txt);font:13px/1.4 system-ui,-apple-system,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none}
button{font:inherit;color:inherit}
.fp{display:flex;flex-direction:column;height:100%;min-height:0}

/* header */
.fp__top{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;flex:none}
.fp__ttl{flex:1;min-width:0;font-size:14px;font-weight:700;letter-spacing:.1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__meta{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;background:var(--panel);color:var(--mut);font-size:12px;font-weight:600;flex:none;font-variant-numeric:tabular-nums}

/* "you are presenting" banner */
.fp__share{display:flex;align-items:center;gap:10px;margin:0 10px 8px;padding:8px 8px 8px 12px;padding-inline:12px 8px;border-radius:14px;background:linear-gradient(135deg,rgba(234,67,53,.20),rgba(234,67,53,.08));border:1px solid rgba(234,67,53,.40);flex:none}
.fp__dot{width:9px;height:9px;border-radius:50%;background:var(--red);flex:none;animation:fpp 1.6s ease-out infinite}
@keyframes fpp{70%{box-shadow:0 0 0 8px rgba(234,67,53,0)}100%{box-shadow:0 0 0 0 rgba(234,67,53,0)}}
.fp__sharetxt{flex:1;min-width:0;display:flex;flex-direction:column}
.fp__sharetxt b{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__sharetxt small{font-size:11px;color:#f3b4ae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__stop{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:0;border-radius:999px;background:var(--red);color:#fff;font-weight:700;font-size:12px;cursor:pointer;flex:none;transition:filter .12s,transform .12s}
.fp__stop:hover{filter:brightness(1.12)}.fp__stop:active{transform:scale(.96)}

/* stage + strip */
.fp__stage{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:0 10px}
.fp__main{flex:1;min-height:0;display:flex}
.fp__main .fp__tile{flex:1}
.fp__strip{display:flex;gap:8px;height:74px;flex:none;justify-content:center}
.fp__strip .fp__tile{flex:1 1 0;min-width:0;max-width:128px}

.fp__tile{position:relative;border-radius:14px;overflow:hidden;background:var(--tile);min-height:0;display:flex;align-items:center;justify-content:center}
.fp__tile::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:3;box-shadow:inset 0 0 0 0 var(--green);transition:box-shadow .15s}
.fp__tile.is-speaking::after{box-shadow:inset 0 0 0 2px var(--green),inset 0 0 18px rgba(52,211,153,.25)}
.fp__tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.fp__tile video.is-me{transform:scaleX(-1)}
.fp__tile video.is-screen{object-fit:contain}
.fp__av{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:28px;color:#fff;z-index:1;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.fp__strip .fp__tile{align-items:flex-start}
.fp__strip .fp__av{width:30px;height:30px;font-size:13px;margin-top:9px}

.fp__name{position:absolute;inset-inline-start:7px;bottom:7px;max-width:calc(100% - 14px);z-index:2;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:8px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);font-size:12px;font-weight:600}
.fp__name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp__name .off{color:#ff8a80;display:inline-flex}
.fp__strip .fp__name{inset-inline-start:4px;bottom:4px;height:18px;padding:0 6px;font-size:10px;border-radius:6px}
.fp__eq{display:inline-flex;align-items:flex-end;gap:2px;height:11px;flex:none}
.fp__eq i{width:2.5px;border-radius:2px;background:var(--green);animation:fpe .9s ease-in-out infinite}
.fp__eq i:nth-child(1){height:5px}.fp__eq i:nth-child(2){height:11px;animation-delay:.15s}.fp__eq i:nth-child(3){height:7px;animation-delay:.3s}
@keyframes fpe{50%{transform:scaleY(.4);transform-origin:bottom}}

.fp__chip{position:absolute;top:7px;inset-inline-end:7px;z-index:2;display:flex;gap:5px}
.fp__chip i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:22px;min-width:22px;padding:0 6px;border-radius:999px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);font-size:11px;font-weight:700}
.fp__chip i.hand{background:#fbbc04;color:#202124}
.fp__chip i.pres{background:var(--acc);color:#0b1b3a}
.fp__strip .fp__chip{top:4px;inset-inline-end:4px}
.fp__strip .fp__chip i{height:16px;min-width:16px;padding:0 3px;font-size:9px}
.fp__strip .fp__chip i span{display:none}
.fp__q{position:absolute;top:10px;inset-inline-start:10px;z-index:2;width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 2px rgba(0,0,0,.35)}
.fp__q.poor{background:#fbbc04}
.fp__strip .fp__q{top:6px;inset-inline-start:6px;width:6px;height:6px}
.fp__more{background:var(--panel);color:var(--mut);font-weight:700;font-size:16px}
.fp__strip .fp__more{align-items:center}
.fp__more::after{display:none}

/* controls */
.fp__bar{display:flex;align-items:center;justify-content:center;padding:10px;flex:none}
.fp__pill{display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;background:var(--panel);border:1px solid var(--line);box-shadow:0 6px 18px rgba(0,0,0,.35)}
.fp__b{position:relative;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;background:var(--panel2);color:var(--txt);display:inline-flex;align-items:center;justify-content:center;transition:filter .12s,transform .12s,background .12s;flex:none}
.fp__b:hover{filter:brightness(1.18)}.fp__b:active{transform:scale(.93)}
.fp__b:focus-visible,.fp__stop:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.fp__b.is-off{background:#d93025;color:#fff}
.fp__b.is-on{background:var(--acc);color:#0b1b3a}
.fp__b.leave{width:56px;border-radius:999px;background:var(--red);color:#fff}
.fp__sep{width:1px;height:22px;background:var(--line);flex:none}
.fp__badge{position:absolute;top:-3px;inset-inline-end:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:var(--red);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--panel)}

@media (max-width:340px){.fp__b{width:36px;height:36px}.fp__b.leave{width:46px}.fp__pill{gap:4px;padding:5px}.fp__stop span{display:none}.fp__stop{padding:0 10px}.fp__meta.hide-xs{display:none}.fp__sharetxt small{display:none}}
@media (max-height:310px){.fp__strip{display:none}.fp__sharetxt small{display:none}}
@media (max-height:215px){.fp__top,.fp__stage{display:none}.fp__share{margin-top:8px}}
@media (prefers-reduced-motion:reduce){.fp__dot,.fp__eq i{animation:none}}
`;

/** Silent listener: reports whether this person is talking (one per participant, so it survives a tile moving between the stage and the strip). */
const SpeakWatcher = memo(function SpeakWatcher({ k, stream, enabled, report }) {
  const speaking = useSpeaking(stream, enabled);
  useEffect(() => { report(k, speaking); return () => report(k, false); }, [k, speaking, report]);
  return null;
});

/** One participant tile. The <video> is only attached while the camera / screen is really showing (saves decoding). */
const MiniTile = memo(function MiniTile({ p, you, speaking, t, compact }) {
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
  const muted = p.micEnabled === false;
  const talking = !!speaking && !muted;
  const videoCls = [p.isLocal && !p.screenSharing ? 'is-me' : '', !p.isLocal && p.screenSharing ? 'is-screen' : ''].filter(Boolean).join(' ');
  return (
    <div className={`fp__tile${talking ? ' is-speaking' : ''}`}>
      {showVideo
        ? <video ref={ref} muted autoPlay playsInline className={videoCls} />
        : <span className="fp__av" style={{ background: avatarColor(p.displayName) }}>{initial}</span>}
      {!p.isLocal && <b className={`fp__q${poor ? ' poor' : ''}`} title={poor ? t('Weak connection') : ''} />}
      <span className="fp__chip">
        {p.handRaised && <i className="hand" title={t('Hand raised')}>✋</i>}
        {p.screenSharing && <i className="pres" title={t('Presenting')}><Icon name="screen-share" size={12} /><span>{t('Presenting')}</span></i>}
      </span>
      <span className="fp__name">
        {muted && <em className="off" title={t('Muted')}><Icon name="mic-off" size={12} /></em>}
        {talking && <span className="fp__eq" aria-hidden="true"><i /><i /><i /></span>}
        <span>{compact && you ? you : `${p.displayName}${you ? ` (${you})` : ''}${p.isHost ? ' ★' : ''}`}</span>
      </span>
    </div>
  );
});

function Panel({ people, elapsed, title, t, state, actions }) {
  const [speakingMap, setSpeakingMap] = useState({});
  const [lastSpeaker, setLastSpeaker] = useState(null);
  const report = useCallback((k, on) => {
    setSpeakingMap((m) => (!!m[k] === on ? m : { ...m, [k]: on }));
    if (on) setLastSpeaker(k);
  }, []);

  const sharing = !!state.screenSharing;
  const remotes = people.filter((p) => !p.isLocal);
  // Stage priority: someone presenting to you > whoever spoke last > first other person > you (when alone).
  const featured = remotes.find((p) => p.screenSharing)
    || remotes.find((p) => p.key === lastSpeaker)
    || remotes[0]
    || people[0]
    || null;
  const others = people.filter((p) => featured && p.key !== featured.key);
  const MAX = 4;
  const shown = others.length > MAX ? others.slice(0, MAX - 1) : others;
  const extra = others.length - shown.length;
  const tile = (p, compact) => <MiniTile key={p.key} p={p} you={p.isLocal ? t('You') : null} speaking={!!speakingMap[p.key]} t={t} compact={compact} />;

  return (
    <div className="fp" role="region" aria-label={title || t('Meeting')}>
      {people.map((p) => (
        <SpeakWatcher key={p.key} k={p.key} stream={p.remoteStream} enabled={p.micEnabled !== false} report={report} />
      ))}

      <div className="fp__top">
        <span className="fp__ttl" title={title || ''}>{title || t('Meeting')}</span>
        <span className="fp__meta hide-xs" dir="ltr"><Icon name="clock" size={13} /> {elapsed}</span>
        <span className="fp__meta" title={t('Participants')}><Icon name="users" size={13} /> {people.length}</span>
      </div>

      {sharing && (
        <div className="fp__share">
          <span className="fp__dot" />
          <span className="fp__sharetxt">
            <b>{t('You are presenting your screen')}</b>
            <small>{t('Everyone in the meeting can see your screen')}</small>
          </span>
          <button type="button" className="fp__stop" onClick={actions.stopShare} title={t('Stop Sharing')} aria-label={t('Stop Sharing')}>
            <Icon name="stop" size={13} /><span>{t('Stop Sharing')}</span>
          </button>
        </div>
      )}

      <div className="fp__stage">
        {featured && <div className="fp__main">{tile(featured, false)}</div>}
        {others.length > 0 && (
          <div className="fp__strip">
            {shown.map((p) => tile(p, true))}
            {extra > 0 && <div className="fp__tile fp__more" dir="ltr">+{extra}</div>}
          </div>
        )}
      </div>

      <div className="fp__bar">
        <div className="fp__pill" role="toolbar">
          <button type="button" className={`fp__b${state.micEnabled ? '' : ' is-off'}`} onClick={actions.toggleMic} aria-pressed={!state.micEnabled} title={state.micEnabled ? t('Mute') : t('Unmute')} aria-label={state.micEnabled ? t('Mute') : t('Unmute')}>
            <Icon name={state.micEnabled ? 'mic' : 'mic-off'} size={19} />
          </button>
          <button type="button" className={`fp__b${state.cameraEnabled ? '' : ' is-off'}`} onClick={actions.toggleCamera} aria-pressed={!state.cameraEnabled} title={state.cameraEnabled ? t('Camera') : t('Camera off')} aria-label={state.cameraEnabled ? t('Camera') : t('Camera off')}>
            <Icon name={state.cameraEnabled ? 'video' : 'video-off'} size={19} />
          </button>
          <button type="button" className={`fp__b${state.handRaised ? ' is-on' : ''}`} onClick={actions.toggleHand} aria-pressed={!!state.handRaised} title={state.handRaised ? t('Lower Hand') : t('Raise Hand')} aria-label={state.handRaised ? t('Lower Hand') : t('Raise Hand')}>
            <Icon name="hand" size={19} />
          </button>
          <button type="button" className="fp__b" onClick={actions.openChat} title={t('Chat')} aria-label={t('Chat')}>
            <Icon name="message-square" size={19} />
            {state.unread ? <span className="fp__badge">{state.unread > 9 ? '9+' : state.unread}</span> : null}
          </button>
          <button type="button" className="fp__b" onClick={actions.back} title={t('Back to meeting')} aria-label={t('Back to meeting')}>
            <Icon name="external-link" size={18} />
          </button>
          <span className="fp__sep" />
          <button type="button" className="fp__b leave" onClick={actions.leave} title={t('Leave Meeting')} aria-label={t('Leave Meeting')}>
            <Icon name="logout" size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders the panel INTO the floating window `win` (a React portal into that window's document). */
function FloatingMeetPip({ win, people, elapsed, title, t, state, actions }) {
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
  return createPortal(<Panel people={people} elapsed={elapsed} title={title} t={t} state={state} actions={actions} />, host);
}

export default memo(FloatingMeetPip);
