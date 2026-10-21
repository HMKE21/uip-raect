import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { StModal, timeAgo } from './student/stUi';
import { errorMessage } from '../api/client';
import { drive } from '../lib/driveApi';
import { publicOrigin } from '../config/siteUrl';

const EXPIRIES = [
  { key: '1d', en: '1 day', ar: 'يوم' },
  { key: '7d', en: '1 week', ar: 'أسبوع' },
  { key: '30d', en: '1 month', ar: 'شهر' },
  { key: 'never', en: 'No expiry', ar: 'بدون انتهاء' },
];

export const shareUrl = (token) => `${publicOrigin()}/s/${token}`;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** "Share" dialog for a My PC file / folder: create, copy, edit and turn off public links. */
export default function ShareDialog({ node, ar, locale, onClose, onToast }) {
  const tt = useCallback((en, a) => (ar ? a : en), [ar]);
  const [links, setLinks] = useState(null);
  const [expiry, setExpiry] = useState('7d');
  const [canDownload, setCanDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setLinks((await drive.shares(node.id))?.items || []); } catch (e) { setError(errorMessage(e)); setLinks([]); }
  }, [node.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, okMsg) => {
    setBusy(true); setError('');
    try { await fn(); if (okMsg) onToast?.(okMsg); await load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const copy = async (token) => {
    const ok = await copyText(shareUrl(token));
    onToast?.(ok ? tt('Link copied.', 'تم نسخ الرابط.') : tt('Could not copy — select the link and copy it.', 'تعذّر النسخ — حدد الرابط وانسخه يدويًا.'), ok ? undefined : 'error');
  };

  const expiryText = (l) => {
    if (!l.expires_at) return tt('No expiry', 'بدون انتهاء');
    if (l.expired) return tt('Expired', 'منتهي');
    const d = new Date(String(l.expires_at).replace(' ', 'T'));
    return tt('Expires ', 'ينتهي ') + (Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  };

  return (
    <StModal
      wide title={tt('Share', 'مشاركة') + ` — ${node.name}`} onClose={onClose}
      actions={<button type="button" className="btn btn-primary" onClick={onClose}>{tt('Done', 'تم')}</button>}
    >
      <div className="mp-share">
        <p className="mp-share__hint">
          {tt('Anyone with the link can open this ', 'أي شخص معه الرابط يقدر يفتح ')}{node.type === 'folder' ? tt('folder', 'المجلد') : tt('file', 'الملف')}
          {tt(' — no sign-in needed. Turn the link off any time.', ' — من غير تسجيل دخول. وتقدر توقف الرابط في أي وقت.')}
        </p>

        <div className="mp-share__new">
          <label className="mp-field"><span>{tt('Link expires after', 'مدة صلاحية الرابط')}</span>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={busy}>
              {EXPIRIES.map((x) => <option key={x.key} value={x.key}>{ar ? x.ar : x.en}</option>)}
            </select></label>
          <label className="mp-field"><span>{tt('Permission', 'الصلاحية')}</span>
            <select value={canDownload ? 'dl' : 'view'} onChange={(e) => setCanDownload(e.target.value === 'dl')} disabled={busy}>
              <option value="dl">{tt('View and download', 'عرض وتنزيل')}</option>
              <option value="view">{tt('View only', 'عرض فقط')}</option>
            </select></label>
          <button
            type="button" className="btn btn-primary" disabled={busy}
            onClick={() => act(async () => {
              const l = await drive.createShare(node.id, { expiry, canDownload });
              if (l?.token) await copyText(shareUrl(l.token));
            }, tt('Link created and copied.', 'تم إنشاء الرابط ونسخه.'))}
          ><Icon name="link" size={15} /><span>{tt('Create link', 'إنشاء رابط')}</span></button>
        </div>

        {error && <div className="mp-share__err" role="alert">{error}</div>}

        <div className="mp-share__list">
          {links === null && <div className="mp-share__empty">{tt('Loading…', 'جارِ التحميل…')}</div>}
          {links && links.length === 0 && <div className="mp-share__empty">{tt('No active links yet.', 'مفيش روابط شغّالة لسه.')}</div>}
          {links && links.map((l) => (
            <div key={l.id} className={`mp-share__row${l.expired ? ' is-expired' : ''}`}>
              <div className="mp-share__url">
                <input readOnly dir="ltr" value={shareUrl(l.token)} onFocus={(e) => e.target.select()} aria-label={tt('Share link', 'رابط المشاركة')} />
                <button type="button" className="btn btn-ghost" onClick={() => copy(l.token)} disabled={l.expired}><Icon name="copy" size={14} /><span>{tt('Copy', 'نسخ')}</span></button>
              </div>
              <div className="mp-share__meta">
                <span><Icon name="clock" size={12} /> {expiryText(l)}</span>
                <span><Icon name="eye" size={12} /> {l.views}</span>
                <span><Icon name="download" size={12} /> {l.downloads}</span>
                {l.last_used_at && <span>{tt('Last opened ', 'آخر فتح ')}{timeAgo(l.last_used_at, locale)}</span>}
              </div>
              <div className="mp-share__ctl">
                <select
                  value={l.can_download ? 'dl' : 'view'} disabled={busy} aria-label={tt('Permission', 'الصلاحية')}
                  onChange={(e) => act(() => drive.updateShare(l.id, { can_download: e.target.value === 'dl' }))}
                >
                  <option value="dl">{tt('View and download', 'عرض وتنزيل')}</option>
                  <option value="view">{tt('View only', 'عرض فقط')}</option>
                </select>
                <select
                  value="" disabled={busy} aria-label={tt('Change expiry', 'تغيير المدة')}
                  onChange={(e) => e.target.value && act(() => drive.updateShare(l.id, { expiry: e.target.value }), tt('Expiry updated.', 'تم تحديث المدة.'))}
                >
                  <option value="">{tt('Change expiry…', 'تغيير المدة…')}</option>
                  {EXPIRIES.map((x) => <option key={x.key} value={x.key}>{tt('From now: ', 'من الآن: ')}{ar ? x.ar : x.en}</option>)}
                </select>
                <button type="button" className="btn btn-ghost mp-share__off" disabled={busy} onClick={() => act(() => drive.revokeShare(l.id), tt('Link turned off.', 'تم إيقاف الرابط.'))}>
                  <Icon name="x" size={14} /><span>{tt('Turn off', 'إيقاف')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </StModal>
  );
}
