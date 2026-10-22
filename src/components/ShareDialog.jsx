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
  { key: 'custom', en: 'Custom…', ar: 'مدة مخصصة…' },
  { key: 'never', en: 'No expiry', ar: 'بدون انتهاء' },
];
const UNITS = [
  { key: 'm', en: 'minutes', ar: 'دقائق', mins: 1 },
  { key: 'h', en: 'hours', ar: 'ساعات', mins: 60 },
  { key: 'd', en: 'days', ar: 'أيام', mins: 1440 },
];
const MAX_MINUTES = 365 * 24 * 60;

/** '5' + 'm' -> '5m'; null when it is not a whole number between 1 minute and 365 days */
function customKey(n, unit) {
  const v = Number(n);
  const u = UNITS.find((x) => x.key === unit);
  if (!u || !Number.isInteger(v) || v < 1 || v * u.mins > MAX_MINUTES) return null;
  return `${v}${unit}`;
}

/** number + unit inputs for a custom duration */
function CustomDuration({ ar, n, unit, onN, onUnit, disabled }) {
  const bad = customKey(n, unit) === null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input
        type="number" min="1" step="1" inputMode="numeric" dir="ltr" value={n} disabled={disabled}
        onChange={(e) => onN(e.target.value)} aria-invalid={bad} style={{ width: 80 }}
        aria-label={ar ? 'المدة' : 'Duration'}
      />
      <select value={unit} disabled={disabled} onChange={(e) => onUnit(e.target.value)} aria-label={ar ? 'الوحدة' : 'Unit'}>
        {UNITS.map((x) => <option key={x.key} value={x.key}>{ar ? x.ar : x.en}</option>)}
      </select>
    </span>
  );
}

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
  const [customN, setCustomN] = useState('5');
  const [customU, setCustomU] = useState('m');
  const [editId, setEditId] = useState(null); // link whose expiry is being set to a custom duration
  const [editN, setEditN] = useState('5');
  const [editU, setEditU] = useState('m');
  const newExpiry = expiry === 'custom' ? customKey(customN, customU) : expiry;
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
    if (Number.isNaN(d.getTime())) return tt('Expires ', 'ينتهي ');
    const lng = locale === 'ar' ? 'ar-EG' : undefined;
    // a short link shows the exact time ("5 minutes" is useless without it); a long one only the date
    const soon = d.getTime() - Date.now() < 3 * 24 * 3600 * 1000;
    return tt('Expires ', 'ينتهي ') + (soon
      ? d.toLocaleString(lng, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(lng, { day: 'numeric', month: 'short', year: 'numeric' }));
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
            </select>
            {expiry === 'custom' && <CustomDuration ar={ar} n={customN} unit={customU} onN={setCustomN} onUnit={setCustomU} disabled={busy} />}
          </label>
          <label className="mp-field"><span>{tt('Permission', 'الصلاحية')}</span>
            <select value={canDownload ? 'dl' : 'view'} onChange={(e) => setCanDownload(e.target.value === 'dl')} disabled={busy}>
              <option value="dl">{tt('View and download', 'عرض وتنزيل')}</option>
              <option value="view">{tt('View only', 'عرض فقط')}</option>
            </select></label>
          <button
            type="button" className="btn btn-primary" disabled={busy || !newExpiry}
            title={newExpiry ? undefined : tt('Enter a whole number: 1 minute to 365 days', 'اكتب رقم صحيح: من دقيقة لـ 365 يوم')}
            onClick={() => act(async () => {
              const l = await drive.createShare(node.id, { expiry: newExpiry, canDownload });
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
                  onChange={(e) => {
                    if (e.target.value === 'custom') { setEditId(l.id); return; }
                    setEditId(null);
                    if (e.target.value) act(() => drive.updateShare(l.id, { expiry: e.target.value }), tt('Expiry updated.', 'تم تحديث المدة.'));
                  }}
                >
                  <option value="">{tt('Change expiry…', 'تغيير المدة…')}</option>
                  {EXPIRIES.map((x) => <option key={x.key} value={x.key}>{tt('From now: ', 'من الآن: ')}{ar ? x.ar : x.en}</option>)}
                </select>
                {editId === l.id && (
                  <>
                    <CustomDuration ar={ar} n={editN} unit={editU} onN={setEditN} onUnit={setEditU} disabled={busy} />
                    <button
                      type="button" className="btn btn-primary" disabled={busy || !customKey(editN, editU)}
                      onClick={() => act(async () => { await drive.updateShare(l.id, { expiry: customKey(editN, editU) }); setEditId(null); }, tt('Expiry updated.', 'تم تحديث المدة.'))}
                    >{tt('Apply', 'تطبيق')}</button>
                  </>
                )}
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
