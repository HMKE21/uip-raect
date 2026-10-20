import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { drive } from '../lib/driveApi';
import { desktopApi, lockError } from './desktopApi';
import { APPS } from './apps';
import { winTitle } from './wm';
import { AppGlyph, FileGlyph, FolderGlyph } from './OsIcons';

export const extOf = (n) => { const s = String(n || ''); const i = s.lastIndexOf('.'); return i > 0 ? s.slice(i + 1).toLowerCase() : ''; };
const EXT_COLOR = { pdf: '#e5484d', doc: '#3b82f6', docx: '#3b82f6', txt: '#64748b', md: '#64748b', xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a', ppt: '#f97316', pptx: '#f97316', zip: '#d4a017', png: '#8b5cf6', jpg: '#8b5cf6', jpeg: '#8b5cf6', gif: '#8b5cf6', mp4: '#ec4899', mp3: '#14b8a6', js: '#eab308', py: '#3b82f6', html: '#e34f26', css: '#2965f1', json: '#64748b' };
export function NodeGlyph({ node, size }) {
  if (node.type === 'folder') return <FolderGlyph size={size} project={node.kind === 'project'} />;
  const e = extOf(node.name);
  return <FileGlyph size={size} label={e} color={EXT_COLOR[e] || '#64748b'} />;
}

export function Clock({ ar, big, dateToo, bar }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const h = setInterval(() => setNow(new Date()), big ? 1000 : 15000); return () => clearInterval(h); }, [big]);
  const lc = ar ? 'ar-EG' : 'en-US';
  const time = now.toLocaleTimeString(lc, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(lc, big ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'numeric', year: 'numeric' });
  if (bar) { // menu-bar style: "Tue Oct 20  1:01 AM"
    const d = now.toLocaleDateString(lc, { weekday: 'short', month: 'short', day: 'numeric' });
    return <div className="os-clock os-clock--bar"><span>{d}</span><b>{time}</b></div>;
  }
  return big
    ? <div className="os-clock os-clock--big"><b>{time}</b><span>{date}</span></div>
    : <div className="os-clock"><b>{time}</b>{dateToo && <span>{date}</span>}</div>;
}

/** Right-click menu. items: { label, icon, onClick, danger, disabled, hint } | 'sep' */
export function ContextMenu({ menu, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);
  useEffect(() => {
    const first = ref.current?.querySelector('button:not(:disabled)'); first?.focus();
    const k = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const b = [...ref.current.querySelectorAll('button:not(:disabled)')];
        const i = b.indexOf(document.activeElement);
        b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <ul ref={ref} className="os-ctx" style={pos} role="menu" onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
      {menu.items.map((m, i) => (m === 'sep'
        ? <li key={`s${i}`} className="os-ctx__sep" role="separator" />
        : (
          <li key={m.label} role="none">
            <button type="button" role="menuitem" disabled={m.disabled} className={m.danger ? 'is-danger' : ''} onClick={() => { onClose(); m.onClick?.(); }}>
              <span className="os-ctx__ic">{m.icon && <Icon name={m.icon} size={15} />}</span><span>{m.label}</span>{m.hint && <kbd>{m.hint}</kbd>}
            </button>
          </li>
        )))}
    </ul>
  );
}

/** Prompt / confirm dialog (promise-based from DesktopOS). */
export function OsDialog({ dlg, tt, onDone }) {
  const [v, setV] = useState(dlg.value || '');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.focus();
    const dot = v.lastIndexOf('.');
    el.setSelectionRange?.(0, dlg.selectAll || dot <= 0 ? v.length : dot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = () => { if (dlg.kind === 'prompt') { if (!v.trim()) return; onDone(v.trim()); } else onDone(true); };
  return (
    <div className="os-scrim" onPointerDown={() => onDone(null)}>
      <div className="os-dlg" role="dialog" aria-modal="true" onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(null); } if (e.key === 'Enter' && dlg.kind === 'confirm') ok(); }}>
        <h3>{dlg.title}</h3>
        {dlg.kind === 'prompt' ? (
          <label><span>{dlg.label}</span>
            <input ref={ref} value={v} maxLength={200} dir="auto" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} />
          </label>
        ) : <p>{dlg.text}</p>}
        <footer>
          <button type="button" className="os-btn" onClick={() => onDone(null)}>{tt('Cancel', 'إلغاء')}</button>
          <button type="button" autoFocus={dlg.kind === 'confirm'} className={`os-btn ${dlg.danger ? 'os-btn--danger' : 'os-btn--primary'}`} onClick={ok}>{dlg.action}</button>
        </footer>
      </div>
    </div>
  );
}

const RUN_ITEMS = [
  { cmd: 'explorer', en: 'This PC', ar: 'جهازي', glyph: 'explorer' },
  { cmd: 'settings', en: 'Settings', ar: 'الإعدادات', glyph: 'settings' },
  { cmd: 'personalize', en: 'Personalize', ar: 'التخصيص', glyph: 'personalize' },
  { cmd: 'taskmgr', en: 'Task Manager', ar: 'مدير المهام', glyph: 'taskmgr' },
  { cmd: 'bin', en: 'Recycle Bin', ar: 'سلة المحذوفات', glyph: 'bin' },
  { cmd: 'shortcuts', en: 'Keyboard shortcuts', ar: 'اختصارات الكيبورد', glyph: 'shortcuts' },
  { cmd: 'lock', en: 'Lock screen', ar: 'قفل الشاشة', glyph: 'lock' },
  { cmd: 'portal', en: 'Back to portal', ar: 'الرجوع للموقع', glyph: 'portal' },
];

export function RunDialog({ ar, tt, onRun, onClose }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const q = v.trim().toLowerCase();
  const items = useMemo(() => RUN_ITEMS.filter((i) => !q || `${i.cmd} ${i.en} ${i.ar}`.toLowerCase().includes(q)), [q]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.is-sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const run = (text) => { const r = onRun(text); if (r === false) setErr(tt('Nothing matches that.', 'مش لاقي الأمر ده.')); };
  const go = () => { if (items[sel]) run(items[sel].cmd); else run(v.trim()); };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); go(); }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
  };
  return (
    <div className="os-scrim os-scrim--run" onPointerDown={onClose}>
      <div className="os-dlg os-dlg--run" role="dialog" aria-modal="true" aria-label={tt('Spotlight', 'بحث سريع')} onPointerDown={(e) => e.stopPropagation()}>
        <div className="os-spot__field">
          <Icon name="search" size={20} />
          <input autoFocus value={v} placeholder={tt('Spotlight Search', 'بحث سريع')} dir="auto" spellCheck={false} autoComplete="off"
            onChange={(e) => { setV(e.target.value); setErr(''); }} onKeyDown={onKey} />
          <kbd>Esc</kbd>
        </div>
        {err && <p className="os-set__err">{err}</p>}
        {items.length > 0 ? (
          <ul className="os-spot__list" ref={listRef} role="listbox">
            {items.map((it, i) => (
              <li key={it.cmd}>
                <button type="button" role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''} onPointerEnter={() => setSel(i)} onClick={() => run(it.cmd)}>
                  <AppGlyph app={it.glyph} size={28} />
                  <span>{ar ? it.ar : it.en}</span>
                  <small>{ar ? it.en : it.ar}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="os-spot__none">{tt('No results', 'مفيش نتايج')}</p>}
      </div>
    </div>
  );
}

/** Launchpad: every app, search across apps + your files, user, lock / exit. */
export function StartMenu({ ar, tt, user, apps, desktopItems, onOpenApp, onOpenNode, onFound, onLock, onPortal, onClose }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const name = user?.full_name || user?.email || tt('Student', 'طالب');
  const list = useMemo(() => apps.filter((a) => `${a.en} ${a.ar} ${a.id}`.toLowerCase().includes(q.trim().toLowerCase())), [apps, q]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setFound([]); return undefined; }
    let dead = false;
    const h = setTimeout(async () => { try { const r = await drive.search(t); if (!dead) setFound((r.data || []).slice(0, 6)); } catch { if (!dead) setFound([]); } }, 260);
    return () => { dead = true; clearTimeout(h); };
  }, [q]);
  const submit = () => { if (list[0]) onOpenApp(list[0]); else if (found[0]) onFound(found[0]); };
  return (
    <div className="os-start" role="dialog" aria-label={tt('Launchpad', 'لوحة التطبيقات')} onPointerDown={(e) => { e.stopPropagation(); if (!e.target.closest('button, input, .os-start__search, .os-start__foot')) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="os-start__search"><Icon name="search" size={16} />
        <input autoFocus value={q} dir="auto" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder={tt('Search apps and your files…', 'ابحث في التطبيقات وملفاتك…')} />
      </div>
      <div className="os-start__body">
        <h4>{q ? tt('Apps', 'التطبيقات') : tt('Applications', 'التطبيقات')}</h4>
        <div className="os-start__grid">
          {list.map((a) => (
            <button key={a.id} type="button" onClick={() => onOpenApp(a)}><AppGlyph app={a.glyph} size={64} /><span dir="auto">{ar ? a.ar : a.en}</span></button>
          ))}
          {!list.length && <p className="os-start__empty">{tt('No matching apps.', 'مفيش تطبيقات مطابقة.')}</p>}
        </div>
        {q.trim().length >= 2 && (
          <>
            <h4>{tt('My PC files', 'ملفات جهازي')}</h4>
            <div className="os-start__files">
              {found.map((n) => (
                <button key={n.id} type="button" onClick={() => onFound(n)}><NodeGlyph node={n} size={26} /><span dir="auto">{n.name}</span><small dir="auto">{n.path}</small></button>
              ))}
              {!found.length && <p className="os-start__empty">{tt('Nothing found.', 'مفيش نتائج.')}</p>}
            </div>
          </>
        )}
        {!q && desktopItems.length > 0 && (
          <>
            <h4>{tt('On your desktop', 'على سطح المكتب')}</h4>
            <div className="os-start__files">
              {desktopItems.slice(0, 4).map((n) => <button key={n.id} type="button" onClick={() => onOpenNode(n)}><NodeGlyph node={n} size={26} /><span dir="auto">{n.name}</span></button>)}
            </div>
          </>
        )}
      </div>
      <footer className="os-start__foot">
        <span className="os-start__user"><i>{String(name).trim().charAt(0).toUpperCase()}</i><span dir="auto">{name}</span></span>
        <span>
          <button type="button" title={tt('Lock (Alt+L)', 'قفل (Alt+L)')} onClick={onLock}><Icon name="lock" size={17} /></button>
          <button type="button" title={tt('Back to the portal', 'الرجوع للبوابة')} onClick={onPortal}><Icon name="logout" size={17} /></button>
        </span>
      </footer>
    </div>
  );
}

export function TaskView({ list, ar, tt, onPick, onClose, onCloseWin }) {
  return (
    <div className="os-taskview" onPointerDown={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} tabIndex={-1} ref={(el) => el?.focus()}>
      {list.length === 0 && <p className="os-taskview__empty">{tt('No open windows.', 'مفيش نوافذ مفتوحة.')}</p>}
      <div className="os-taskview__grid">
        {list.map((w) => (
          <div key={w.id} className="os-tv-card" onPointerDown={(e) => e.stopPropagation()} onClick={() => onPick(w.id)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onPick(w.id); }}>
            <header><AppGlyph app={w.app} size={18} /><span dir="auto">{winTitle(w, APPS, ar)}</span>
              <button type="button" aria-label={tt('Close', 'إغلاق')} onClick={(e) => { e.stopPropagation(); onCloseWin(w.id); }}><Icon name="x" size={13} /></button>
            </header>
            <div className="os-tv-card__body"><AppGlyph app={w.app} size={64} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Lock screen. No lock password set -> click / any key unlocks (as before).
 * Lock password set (Settings > Lock screen) -> the password is checked on the server; "Forgot password?" sends a
 * 6-digit code to the account's e-mail and lets the student choose a new password with it.
 */
export function LockScreen({ ar, tt, user, lockEnabled, onUnlock, onPortal, hideDetails }) {
  const name = hideDetails ? tt('Locked', 'مقفول') : (user?.full_name || user?.email || '');
  const needPw = lockEnabled !== false; // unknown (offline, first load) is treated as locked: the server answers "no password" if there is none
  const [view, setView] = useState('pw'); // 'pw' | 'reset'
  const [pw, setPw] = useState(''); const [code, setCode] = useState(''); const [np, setNp] = useState(''); const [np2, setNp2] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  const [wait, setWait] = useState(0);
  const [show, setShow] = useState(false); const [caps, setCaps] = useState(false); const [shake, setShake] = useState(0);
  const first = useRef(null);
  useEffect(() => {
    if (needPw) return undefined;
    const k = (e) => { e.preventDefault(); onUnlock(); };
    const t = setTimeout(() => window.addEventListener('keydown', k, true), 150);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k, true); };
  }, [onUnlock, needPw]);
  useEffect(() => { if (needPw) first.current?.focus(); }, [needPw, view]);
  useEffect(() => { if (wait <= 0) return undefined; const h = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(h); }, [wait]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true); setErr('');
    try { await desktopApi.lockVerify(pw); onUnlock(); } catch (x) { setErr(lockError(x)); setPw(''); setShake((n) => n + 1); first.current?.focus(); } finally { setBusy(false); }
  };
  const sendCode = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await desktopApi.lockOtp();
      setInfo(tt(`We sent a 6-digit code to ${r?.email || 'your e-mail'}.`, `بعتنا رمز من 6 أرقام على ${r?.email || 'إيميلك'}.`));
      setWait(Number(r?.retry_after) || 60); setView('reset');
    } catch (x) { setErr(lockError(x)); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (np.length < 4) { setErr(tt('The password must be at least 4 characters.', 'الباسورد لازم يكون 4 حروف/أرقام على الأقل.')); return; }
    if (np !== np2) { setErr(tt('The two passwords do not match.', 'الباسوردين مش متطابقين.')); return; }
    setBusy(true); setErr('');
    try { await desktopApi.lockReset(code.trim(), np); onUnlock(); } catch (x) { setErr(lockError(x)); } finally { setBusy(false); }
  };

  const sub = !hideDetails && user?.email && user.email !== name ? user.email : '';
  const avatar = <div className="os-lock__user"><i>{hideDetails ? <Icon name="lock" size={15} /> : String(name || '?').trim().charAt(0).toUpperCase()}</i><b dir="auto">{name}</b>{sub && <small dir="ltr">{sub}</small>}</div>;
  const capsKey = (e) => setCaps(!!e.getModifierState?.('CapsLock'));
  const foot = (
    <div className="os-lock__foot">
      <span className="os-lock__badge"><Icon name="lock" size={13} />{tt('Locked', 'مقفول')}</span>
      {onPortal && <button type="button" className="os-lock__ghost" onClick={onPortal}>{tt('Back to portal', 'العودة للبوابة')}</button>}
    </div>
  );
  if (!needPw) {
    return (
      <div className="os-lock" onClick={onUnlock} role="button" tabIndex={0} aria-label={tt('Unlock', 'فتح القفل')}>
        <Clock ar={ar} big />
        {avatar}
        <p className="os-lock__hint"><Icon name="chevron-up" size={18} />{tt('Click or press any key to unlock', 'اضغط أي زر أو اضغط بالماوس للفتح')}</p>
      </div>
    );
  }
  return (
    <div className="os-lock os-lock--pw" role="dialog" aria-modal="true" aria-label={tt('Locked', 'مقفول')}>
      <Clock ar={ar} big />
      {avatar}
      {view === 'pw' ? (
        <form className="os-lock__form" onSubmit={submit}>
          <div className="os-lock__row">
            <div key={shake} className={`os-lock__field${shake ? ' is-shake' : ''}${err ? ' is-err' : ''}`}>
              <Icon name="lock" size={16} />
              <input ref={first} type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); if (err) setErr(''); }} onKeyDown={capsKey} onKeyUp={capsKey} onBlur={() => setCaps(false)} placeholder={tt('Enter password', 'اكتب الباسورد')} autoComplete="off" maxLength={72} aria-label={tt('Password', 'الباسورد')} aria-invalid={!!err} dir="auto" />
              <button type="button" className="os-lock__eye" onClick={() => setShow((v) => !v)} aria-label={show ? tt('Hide password', 'إخفاء الباسورد') : tt('Show password', 'إظهار الباسورد')} aria-pressed={show} tabIndex={-1}><Icon name={show ? 'eye-off' : 'eye'} size={16} /></button>
            </div>
            <button type="submit" className="os-lock__go" disabled={busy || !pw} aria-label={tt('Unlock', 'فتح القفل')}>{busy ? <span className="mp-spin" /> : <Icon name="arrow-right" size={18} />}</button>
          </div>
          {caps && <p className="os-lock__caps"><Icon name="alert-triangle" size={13} />{tt('Caps Lock is on', 'زر Caps Lock مفعّل')}</p>}
          {err && <p className="os-lock__err" role="alert">{err}</p>}
          <button type="button" className="os-lock__link" onClick={sendCode} disabled={busy}>{tt('Forgot password?', 'نسيت الباسورد؟')}</button>
        </form>
      ) : (
        <form className="os-lock__form" onSubmit={reset}>
          <p className="os-lock__note">{info}</p>
          <input ref={first} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={tt('6-digit code', 'الرمز (6 أرقام)')} aria-label={tt('6-digit code', 'الرمز (6 أرقام)')} />
          <input type="password" value={np} onChange={(e) => setNp(e.target.value)} placeholder={tt('New password', 'باسورد جديد')} autoComplete="new-password" maxLength={72} aria-label={tt('New password', 'باسورد جديد')} dir="auto" />
          <input type="password" value={np2} onChange={(e) => setNp2(e.target.value)} placeholder={tt('Repeat new password', 'كرر الباسورد الجديد')} autoComplete="new-password" maxLength={72} aria-label={tt('Repeat new password', 'كرر الباسورد الجديد')} dir="auto" />
          {err && <p className="os-lock__err" role="alert">{err}</p>}
          <button type="submit" className="os-lock__btn" disabled={busy || code.length < 6 || !np}>{busy ? <span className="mp-spin" /> : tt('Reset password & unlock', 'غيّر الباسورد وافتح')}</button>
          <div className="os-lock__links">
            <button type="button" className="os-lock__link" onClick={sendCode} disabled={busy || wait > 0}>{wait > 0 ? tt(`Resend code (${wait}s)`, `إعادة إرسال الرمز (${wait}ث)`) : tt('Resend code', 'إعادة إرسال الرمز')}</button>
            <button type="button" className="os-lock__link" onClick={() => { setView('pw'); setErr(''); setCode(''); setNp(''); setNp2(''); }}>{tt('Back', 'رجوع')}</button>
          </div>
        </form>
      )}
      {foot}
    </div>
  );
}

/** Sleep mode: the screen goes dark; any key, click or touch wakes it (the first moments are ignored so the click that started it does not wake it). */
export function SleepScreen({ ar, tt, dim, onWake }) {
  useEffect(() => {
    let armed = false;
    const t = setTimeout(() => { armed = true; }, 700);
    const wake = (e) => { if (!armed) return; if (e.type === 'pointermove' && !(e.movementX || e.movementY)) return; e.preventDefault?.(); onWake(); };
    const EV = ['keydown', 'pointerdown', 'touchstart', 'wheel', 'pointermove'];
    EV.forEach((n) => window.addEventListener(n, wake, true));
    return () => { clearTimeout(t); EV.forEach((n) => window.removeEventListener(n, wake, true)); };
  }, [onWake]);
  return (
    <div className={`os-sleep${dim ? ' is-dim' : ''}`} role="button" tabIndex={0} aria-label={tt('Wake up', 'إيقاظ')}>
      {dim && <div className="os-sleep__clock"><Clock ar={ar} big /></div>}
      <p className="os-sleep__hint"><Icon name="moon" size={14} />{tt('Sleeping — press any key or move the mouse', 'وضع السكون — اضغط أي زر أو حرّك الماوس')}</p>
    </div>
  );
}

/** Last minute before the automatic sign-out (Settings ▸ Security & devices ▸ Automatic sign-out). */
export function IdleWarning({ tt, left, onStay, onSignOut }) {
  return (
    <div className="os-scrim os-scrim--top">
      <div className="os-dlg os-idle" role="alertdialog" aria-modal="true" aria-label={tt('Signing out soon', 'هيتسجّل خروجك قريب')}>
        <h3><Icon name="clock" size={18} /> {tt('Still there?', 'لسه معانا؟')}</h3>
        <p>{tt(`You will be signed out for inactivity in ${left} s.`, `هيتسجّل خروجك بسبب الخمول بعد ${left} ثانية.`)}</p>
        <footer>
          <button type="button" className="os-btn" onClick={onSignOut}>{tt('Sign out now', 'خروج دلوقتي')}</button>
          <button type="button" autoFocus className="os-btn os-btn--primary" onClick={onStay}>{tt('Stay signed in', 'خلّيني مسجّل')}</button>
        </footer>
      </div>
    </div>
  );
}
