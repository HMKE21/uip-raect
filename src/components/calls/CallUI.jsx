import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { initials, avatarUrl } from '../messaging/format';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/callCtx';
import { fmtCallDuration } from '../../lib/calls/callText';

/**
 * The call screens, rendered once by <CallProvider> into document.body:
 *   - incoming card (rings on every page)
 *   - full call screen: starting / calling / connecting / active, with mute + hang up + minimise
 *   - floating pill when minimised
 *   - end-of-call toast (declined, no answer, mic blocked, …)
 */

function CallAvatar({ peer, size }) {
  const [failed, setFailed] = useState(false);
  const url = !failed ? avatarUrl(peer && peer.avatar) : null;
  return (
    <span className={`call-avatar call-avatar--${size || 'lg'}`}>
      {url ? <img src={url} alt="" onError={() => setFailed(true)} /> : initials(peer && peer.name)}
    </span>
  );
}

function useElapsed(startedAt) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
}

function QualityBars({ quality, ar }) {
  const n = quality === 'poor' ? 1 : quality === 'fair' ? 2 : 3;
  const label = quality === 'poor' ? (ar ? 'اتصال ضعيف' : 'Poor connection') : quality === 'fair' ? (ar ? 'اتصال متوسط' : 'Fair connection') : (ar ? 'اتصال جيد' : 'Good connection');
  return (
    <span className={`call-quality call-quality--${quality}`} title={label} aria-label={label} role="img">
      {[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

function noticeText(n, ar) {
  const name = n.name || (ar ? 'المستخدم' : 'The user');
  switch (n.kind) {
    case 'ended': return ar ? `انتهت المكالمة · ${fmtCallDuration(n.duration)}` : `Call ended · ${fmtCallDuration(n.duration)}`;
    case 'declined': return ar ? `${name} رفض المكالمة` : `${name} declined the call`;
    case 'noanswer': return ar ? `${name} لم يرد` : `${name} didn’t answer`;
    case 'busy': return ar ? `${name} مشغول في مكالمة أخرى` : `${name} is on another call`;
    case 'missed': return ar ? `مكالمة فائتة من ${name}` : `Missed call from ${name}`;
    case 'lost': return ar ? 'انقطع الاتصال' : 'Connection lost';
    case 'failed': return ar ? 'تعذّر إتمام المكالمة' : 'The call couldn’t be completed';
    case 'mic_denied': return ar ? 'الميكروفون محظور. اسمح بالوصول إليه من إعدادات المتصفح ثم حاول مرة أخرى.' : 'Microphone access is blocked. Allow it in your browser settings and try again.';
    case 'mic_missing': return ar ? 'لم يتم العثور على ميكروفون.' : 'No microphone was found.';
    case 'mic_error': return ar ? 'تعذّر تشغيل الميكروفون.' : 'Couldn’t start the microphone.';
    case 'unsupported': return ar ? 'المكالمات تحتاج اتصالًا آمنًا (HTTPS) ومتصفحًا يدعمها.' : 'Calls need a secure (HTTPS) connection and a browser that supports them.';
    case 'unavailable': return ar ? 'هذه المكالمة لم تعد متاحة.' : 'This call is no longer available.';
    default: return n.message || (ar ? 'تعذّر بدء المكالمة.' : 'Couldn’t start the call.');
  }
}

export default function CallUI() {
  const c = useCall();
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const t = (en, arText) => (ar ? arText : en);
  const secs = useElapsed(c.phase === 'active' ? c.startedAt : 0);
  const name = (c.peer && c.peer.name) || '';
  const inCall = ['starting', 'outgoing', 'connecting', 'active'].includes(c.phase);

  const statusText = (() => {
    if (c.phase === 'starting') return t('Starting…', 'جارٍ البدء…');
    if (c.phase === 'outgoing') return t('Calling…', 'جارٍ الاتصال…');
    if (c.phase === 'connecting') return t('Connecting…', 'جارٍ الاتصال بالصوت…');
    if (c.reconnecting) return t('Reconnecting…', 'جارٍ إعادة الاتصال…');
    return fmtCallDuration(secs);
  })();

  // Escape never hangs up (too easy to hit by accident); keyboard users use the buttons.
  const toast = c.notice ? (
    <div className={`call-toast${c.notice.kind === 'ended' ? '' : ' is-warn'}`} role="status" aria-live="polite">
      <Icon name={c.notice.kind === 'ended' ? 'phone' : 'info'} size={16} />
      <span>{noticeText(c.notice, ar)}</span>
      <button type="button" className="call-toast__x" onClick={c.dismissNotice} aria-label={t('Dismiss', 'إغلاق')}><Icon name="x" size={14} /></button>
    </div>
  ) : null;

  let body = null;

  if (c.phase === 'incoming') {
    body = (
      <div className="call-incoming" role="alertdialog" aria-label={t('Incoming call', 'مكالمة واردة')}>
        <CallAvatar peer={c.peer} size="md" />
        <div className="call-incoming__txt">
          <strong dir="auto">{name}</strong>
          <span>{c.accepting ? t('Connecting…', 'جارٍ الاتصال…') : t('Incoming voice call…', 'مكالمة صوتية واردة…')}</span>
        </div>
        <div className="call-incoming__btns">
          <button type="button" className="call-btn call-btn--end" onClick={c.decline} disabled={c.accepting} aria-label={t('Decline', 'رفض')} title={t('Decline', 'رفض')}>
            <Icon name="phone" size={22} />
          </button>
          <button type="button" className="call-btn call-btn--accept" onClick={c.accept} disabled={c.accepting} aria-label={t('Accept', 'رد')} title={t('Accept', 'رد')}>
            <Icon name="phone" size={22} />
          </button>
        </div>
      </div>
    );
  } else if (inCall && c.minimized) {
    body = (
      <div className="call-pill" role="group" aria-label={t('Call in progress', 'مكالمة جارية')}>
        <button type="button" className="call-pill__main" onClick={() => c.setMinimized(false)} title={t('Open call', 'فتح المكالمة')}>
          <CallAvatar peer={c.peer} size="xs" />
          <span className="call-pill__txt"><strong dir="auto">{name}</strong><span>{statusText}</span></span>
        </button>
        <button type="button" className={`call-btn call-btn--sm call-btn--mute${c.muted ? ' is-on' : ''}`} onClick={c.toggleMute} aria-pressed={c.muted} aria-label={c.muted ? t('Unmute', 'إلغاء الكتم') : t('Mute', 'كتم')}>
          <Icon name={c.muted ? 'mic-off' : 'mic'} size={16} />
        </button>
        <button type="button" className="call-btn call-btn--sm call-btn--end" onClick={c.hangup} aria-label={t('End call', 'إنهاء المكالمة')}>
          <Icon name="phone" size={16} />
        </button>
      </div>
    );
  } else if (inCall) {
    body = (
      <div className="call-screen" role="dialog" aria-modal="false" aria-label={t('Voice call', 'مكالمة صوتية')}>
        <button type="button" className="call-screen__min" onClick={() => c.setMinimized(true)} aria-label={t('Minimise', 'تصغير')} title={t('Minimise', 'تصغير')}>
          <Icon name="chevron-down" size={22} />
        </button>
        <div className="call-screen__center">
          <div className={`call-screen__avatar${c.phase === 'outgoing' || c.phase === 'connecting' ? ' is-ringing' : ''}${c.phase === 'active' && !c.reconnecting ? ' is-live' : ''}`}>
            <CallAvatar peer={c.peer} size="xl" />
          </div>
          <h2 dir="auto">{name}</h2>
          <p className="call-screen__status" aria-live="polite">
            {c.phase === 'active' && <QualityBars quality={c.reconnecting ? 'poor' : c.quality} ar={ar} />}
            <span className={c.phase === 'active' && !c.reconnecting ? 'is-timer' : ''}>{statusText}</span>
          </p>
          {c.peerMuted && c.phase === 'active' && (
            <p className="call-screen__peermuted"><Icon name="mic-off" size={14} /> {t(`${name || 'They'} muted their microphone`, `${name || 'الطرف الآخر'} كتم الميكروفون`)}</p>
          )}
        </div>
        <div className="call-screen__controls">
          <div className="call-ctl">
            <button type="button" className={`call-btn call-btn--mute${c.muted ? ' is-on' : ''}`} onClick={c.toggleMute} aria-pressed={c.muted} aria-label={c.muted ? t('Unmute', 'إلغاء الكتم') : t('Mute', 'كتم')} disabled={c.phase === 'starting'}>
              <Icon name={c.muted ? 'mic-off' : 'mic'} size={24} />
            </button>
            <span>{c.muted ? t('Unmute', 'إلغاء الكتم') : t('Mute', 'كتم')}</span>
          </div>
          <div className="call-ctl">
            <button type="button" className="call-btn call-btn--end call-btn--lg" onClick={c.hangup} aria-label={c.phase === 'outgoing' || c.phase === 'starting' ? t('Cancel call', 'إلغاء المكالمة') : t('End call', 'إنهاء المكالمة')}>
              <Icon name="phone" size={26} />
            </button>
            <span>{c.phase === 'outgoing' || c.phase === 'starting' ? t('Cancel', 'إلغاء') : t('End', 'إنهاء')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!body && !toast) return null;
  return createPortal(<div className="call-layer" dir={ar ? 'rtl' : 'ltr'}>{body}{toast}</div>, document.body);
}
