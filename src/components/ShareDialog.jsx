import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { StModal, timeAgo } from './student/stUi';
import { errorMessage } from '../api/client';
import { drive } from '../lib/driveApi';
import { publicOrigin } from '../config/siteUrl';

export const EXPIRIES = [
  { key: '1d', en: '1 day', ar: 'يوم' },
  { key: '7d', en: '1 week', ar: 'أسبوع' },
  { key: '30d', en: '1 month', ar: 'شهر' },
  { key: 'custom', en: 'Custom…', ar: 'مدة مخصصة…' },
  { key: 'never', en: 'No expiry', ar: 'بدون انتهاء' },
];
export const UNITS = [
  { key: 'm', en: 'minutes', ar: 'دقائق', mins: 1 },
  { key: 'h', en: 'hours', ar: 'ساعات', mins: 60 },
  { key: 'd', en: 'days', ar: 'أيام', mins: 1440 },
];
const MAX_MINUTES = 365 * 24 * 60;

/** '5' + 'm' -> '5m'; null when it is not a whole number between 1 minute and 365 days */
export function customKey(n, unit) {
  const v = Number(n);
  const u = UNITS.find((x) => x.key === unit);
  if (!u || !Number.isInteger(v) || v < 1 || v * u.mins > MAX_MINUTES) return null;
  return `${v}${unit}`;
}

/** number + unit inputs for a custom duration */
export function CustomDuration({ ar, n, unit, onN, onUnit, disabled }) {
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

/** 12 readable random characters (no 0/O/1/l look-alikes). */
export function genPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join('');
}

export const shareUrl = (token) => `${publicOrigin()}/s/${token}`;

export async function copyText(text) {
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
export default function ShareDialog({ node, ar, locale, onClose, onToast, onManage }) {
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
  const [requireInfo, setRequireInfo] = useState(false); // the visitor must type name + email + mobile first
  const [usePw, setUsePw] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const pwBad = usePw && (pw.length < 4 || pw.length > 64);
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

  const PERMS = [
    { key: 'dl', icon: 'download', en: 'View & download', ar: 'عرض وتنزيل' },
    { key: 'view', icon: 'eye', en: 'View only', ar: 'عرض فقط' },
  ];
  const isFolder = node.type === 'folder';

  return (
    <StModal
      wide title={tt('Share', 'مشاركة')} onClose={onClose}
      actions={(
        <>
          {onManage && <button type="button" className="btn btn-ghost" onClick={onManage}><Icon name="link" size={15} /><span>{tt('All my shared links', 'كل روابطي المشاركة')}</span></button>}
          <button type="button" className="btn btn-primary" onClick={onClose}>{tt('Done', 'تم')}</button>
        </>
      )}
    >
      <div className="mp-share">
        <div className="mp-share__file">
          <span className="mp-share__file-ico"><Icon name={isFolder ? 'folder' : 'file'} size={20} /></span>
          <div>
            <strong title={node.name}>{node.name}</strong>
            <small>{tt('Anyone with the link can open it — no sign-in. Turn it off any time.', 'أي شخص معه الرابط يقدر يفتحه — من غير تسجيل دخول. وتقدر توقفه في أي وقت.')}</small>
          </div>
        </div>

        <section className="mp-share__new">
          <div className="mp-share__group">
            <span className="mp-share__lbl">{tt('Link expires after', 'مدة صلاحية الرابط')}</span>
            <div className="mp-seg mp-seg--wrap" role="radiogroup" aria-label={tt('Link expires after', 'مدة صلاحية الرابط')}>
              {EXPIRIES.map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={expiry === x.key} className={expiry === x.key ? 'is-on' : ''} disabled={busy} onClick={() => setExpiry(x.key)}>{ar ? x.ar : x.en}</button>
              ))}
            </div>
            {expiry === 'custom' && <CustomDuration ar={ar} n={customN} unit={customU} onN={setCustomN} onUnit={setCustomU} disabled={busy} />}
          </div>
          <div className="mp-share__group">
            <span className="mp-share__lbl">{tt('Permission', 'الصلاحية')}</span>
            <div className="mp-seg" role="radiogroup" aria-label={tt('Permission', 'الصلاحية')}>
              {PERMS.map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={(canDownload ? 'dl' : 'view') === x.key} className={(canDownload ? 'dl' : 'view') === x.key ? 'is-on' : ''} disabled={busy} onClick={() => setCanDownload(x.key === 'dl')}>
                  <Icon name={x.icon} size={14} />{ar ? x.ar : x.en}
                </button>
              ))}
            </div>
          </div>
          <div className="mp-share__group mp-share__group--full">
            <span className="mp-share__lbl">{tt('Before opening the link', 'قبل ما يفتح الرابط')}</span>
            <label className="mp-gate-opt">
              <input type="checkbox" checked={requireInfo} disabled={busy} onChange={(e) => setRequireInfo(e.target.checked)} />
              <span className="mp-gate-opt__txt">
                <b><Icon name="users" size={14} /> {tt('Ask for the visitor’s details', 'اطلب بيانات الزائر')}</b>
                <small>{tt('Name, email and mobile number are required — you will see them in “My shared links”.', 'الاسم والإيميل ورقم الموبايل إجباريين — وهتشوفهم في "روابطي المشاركة".')}</small>
              </span>
            </label>
            <label className="mp-gate-opt">
              <input type="checkbox" checked={usePw} disabled={busy} onChange={(e) => { setUsePw(e.target.checked); if (!e.target.checked) setPw(''); }} />
              <span className="mp-gate-opt__txt">
                <b><Icon name="lock" size={14} /> {tt('Protect with a password', 'حماية بباسورد')}</b>
                <small>{tt('Even someone who has the link must enter the password.', 'حتى اللي معاه الرابط لازم يكتب الباسورد.')}</small>
              </span>
            </label>
            {usePw && (
              <div className="mp-pw">
                <input
                  type={showPw ? 'text' : 'password'} dir="ltr" autoComplete="new-password" value={pw} disabled={busy} maxLength={64}
                  placeholder={tt('Password (4–64 characters)', 'الباسورد (من 4 لـ 64 حرف)')} aria-invalid={pwBad}
                  onChange={(e) => setPw(e.target.value)}
                />
                <button type="button" className="mp-pw__btn" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? tt('Hide', 'إخفاء') : tt('Show', 'إظهار')}><Icon name={showPw ? 'eye-off' : 'eye'} size={15} /></button>
                <button type="button" className="mp-pw__btn" disabled={busy} onClick={() => { setPw(genPassword()); setShowPw(true); }}><Icon name="refresh" size={14} /><span>{tt('Generate', 'توليد')}</span></button>
              </div>
            )}
          </div>
          <button
            type="button" className="btn btn-primary mp-share__create" disabled={busy || !newExpiry || pwBad || (usePw && !pw)}
            title={newExpiry ? undefined : tt('Enter a whole number: 1 minute to 365 days', 'اكتب رقم صحيح: من دقيقة لـ 365 يوم')}
            onClick={() => act(async () => {
              const l = await drive.createShare(node.id, { expiry: newExpiry, canDownload, requireInfo, password: usePw ? pw : '' });
              if (l?.token) await copyText(shareUrl(l.token));
              setPw(''); setUsePw(false); setShowPw(false);
            }, usePw ? tt('Link created and copied — remember the password, it can’t be shown again.', 'تم إنشاء الرابط ونسخه — افتكر الباسورد، مش هيتعرض تاني.') : tt('Link created and copied.', 'تم إنشاء الرابط ونسخه.'))}
          ><Icon name="link" size={16} /><span>{tt('Create & copy link', 'إنشاء الرابط ونسخه')}</span></button>
        </section>

        {error && <div className="mp-share__err" role="alert">{error}</div>}

        <div className="mp-share__head">
          <span>{tt('Your links', 'روابطك')}</span>
          {links && links.length > 0 && <b>{links.length}</b>}
        </div>

        <div className="mp-share__list">
          {links === null && <div className="mp-share__empty">{tt('Loading…', 'جارِ التحميل…')}</div>}
          {links && links.length === 0 && <div className="mp-share__empty"><Icon name="link" size={20} /><span>{tt('No links yet — create one above.', 'مفيش روابط لسه — اعمل واحد من فوق.')}</span></div>}
          {links && links.map((l) => (
            <article key={l.id} className={`mp-share__row${l.expired ? ' is-expired' : ''}`}>
              <div className="mp-share__top">
                <span className={`mp-badge ${l.paused ? 'is-warn' : l.expired ? 'is-off' : 'is-on'}`}>{l.paused ? tt('Paused', 'موقوف مؤقتًا') : l.expired ? tt('Expired', 'منتهي') : tt('Active', 'شغّال')}</span>
                <span className="mp-badge mp-badge--soft"><Icon name={l.can_download ? 'download' : 'eye'} size={11} />{l.can_download ? tt('Download allowed', 'التنزيل مسموح') : tt('View only', 'عرض فقط')}</span>
                {l.has_password && <span className="mp-badge mp-badge--soft"><Icon name="lock" size={11} />{tt('Password', 'باسورد')}</span>}
                {l.require_visitor_info && <span className="mp-badge mp-badge--soft"><Icon name="users" size={11} />{tt('Visitor details', 'بيانات الزائر')}</span>}
                <button type="button" className="mp-share__off" disabled={busy} onClick={() => act(() => drive.revokeShare(l.id), tt('Link turned off.', 'تم إيقاف الرابط.'))}>
                  <Icon name="x" size={13} /><span>{tt('Turn off', 'إيقاف')}</span>
                </button>
              </div>
              <div className="mp-share__url">
                <input readOnly dir="ltr" value={shareUrl(l.token)} onFocus={(e) => e.target.select()} aria-label={tt('Share link', 'رابط المشاركة')} />
                <button type="button" className="mp-share__copy" onClick={() => copy(l.token)} disabled={l.expired}><Icon name="copy" size={14} /><span>{tt('Copy', 'نسخ')}</span></button>
              </div>
              <div className="mp-share__meta">
                <span><Icon name="clock" size={12} /> {expiryText(l)}</span>
                <span title={tt('Views', 'المشاهدات')}><Icon name="eye" size={12} /> {l.views}</span>
                <span title={tt('Downloads', 'التنزيلات')}><Icon name="download" size={12} /> {l.downloads}</span>
                {l.last_used_at && <span>{tt('Last opened ', 'آخر فتح ')}{timeAgo(l.last_used_at, locale)}</span>}
              </div>
              <div className="mp-share__ctl">
                <div className="mp-seg mp-seg--sm" role="radiogroup" aria-label={tt('Permission', 'الصلاحية')}>
                  {PERMS.map((x) => (
                    <button key={x.key} type="button" role="radio" aria-checked={(l.can_download ? 'dl' : 'view') === x.key} className={(l.can_download ? 'dl' : 'view') === x.key ? 'is-on' : ''} disabled={busy}
                      onClick={() => { if ((l.can_download ? 'dl' : 'view') !== x.key) act(() => drive.updateShare(l.id, { can_download: x.key === 'dl' })); }}>
                      {ar ? x.ar : x.en}
                    </button>
                  ))}
                </div>
                <select
                  className="mp-share__sel" value="" disabled={busy} aria-label={tt('Change expiry', 'تغيير المدة')}
                  onChange={(e) => {
                    if (e.target.value === 'custom') { setEditId(l.id); return; }
                    setEditId(null);
                    if (e.target.value) act(() => drive.updateShare(l.id, { expiry: e.target.value }), tt('Expiry updated.', 'تم تحديث المدة.'));
                  }}
                >
                  <option value="">{tt('Change expiry…', 'تغيير المدة…')}</option>
                  {EXPIRIES.map((x) => <option key={x.key} value={x.key}>{tt('From now: ', 'من الآن: ')}{ar ? x.ar : x.en}</option>)}
                </select>
              </div>
              {editId === l.id && (
                <div className="mp-share__edit">
                  <CustomDuration ar={ar} n={editN} unit={editU} onN={setEditN} onUnit={setEditU} disabled={busy} />
                  <button
                    type="button" className="btn btn-primary" disabled={busy || !customKey(editN, editU)}
                    onClick={() => act(async () => { await drive.updateShare(l.id, { expiry: customKey(editN, editU) }); setEditId(null); }, tt('Expiry updated.', 'تم تحديث المدة.'))}
                  >{tt('Apply', 'تطبيق')}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </StModal>
  );
}
