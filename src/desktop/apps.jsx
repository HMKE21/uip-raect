import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { ACCENTS } from './prefs';
import { WALLPAPERS, imageToWallpaper } from './wallpapers';
import { EXPLORER_SHORTCUTS, GROUPS, SHORTCUTS, fmtKeys } from './shortcuts';
import { AppGlyph } from './OsIcons';
import { desktopApi, lockError } from './desktopApi';
import { CloudPanel } from './CloudSettings';

const StudentMyPC = lazy(() => import('../pages/student/StudentMyPC'));

/** App registry. `pin` = pinned in the Dock (Alt+1…9 follow this order). */
export const APPS = {
  explorer: { en: 'This PC', ar: 'جهازي', size: { w: 1060, h: 650 }, singleton: true, pin: true },
  settings: { en: 'Settings', ar: 'الإعدادات', size: { w: 880, h: 590 }, singleton: true, pin: true },
  taskmgr: { en: 'Task Manager', ar: 'مدير المهام', size: { w: 680, h: 480 }, singleton: true, pin: false },
  shortcuts: { en: 'Keyboard shortcuts', ar: 'اختصارات الكيبورد', size: { w: 760, h: 600 }, singleton: true, pin: true },
  // one window per file (title = the file name): images / PDFs / media / ZIPs, and the code editor
  viewer: { en: 'Viewer', ar: 'العارض', size: { w: 1000, h: 660 }, singleton: false, pin: false },
  editor: { en: 'Code editor', ar: 'محرر الأكواد', size: { w: 1120, h: 700 }, singleton: false, pin: false },
};
export const PINNED = Object.keys(APPS).filter((k) => APPS[k].pin);

/** The existing My PC page, embedded: same drive API, same editors, now living inside a window. */
export const ExplorerApp = memo(function ExplorerApp({ onOpenWindow }) {
  return (
    <Suspense fallback={<div className="os-app-msg"><span className="mp-spin" /></div>}>
      <StudentMyPC embedded onOpenWindow={onOpenWindow} />
    </Suspense>
  );
});

const Section = ({ title, children }) => (
  <section className="os-set__sec"><h3>{title}</h3>{children}</section>
);

/** Settings > Lock screen: optional password for the lock screen (stored hashed on the server). */
function LockSettings({ tt, lockEnabled, onLockChanged }) {
  const [mode, setMode] = useState(null); // null | 'set' | 'change' | 'remove'
  const [f, setF] = useState({ cur: '', pw: '', pw2: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const on = lockEnabled === true;
  const open = (m) => { setMode(m); setF({ cur: '', pw: '', pw2: '' }); setErr(''); setOk(''); };
  const key = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (mode !== 'remove') {
      if (f.pw.length < 4) { setErr(tt('The password must be at least 4 characters.', 'الباسورد لازم يكون 4 حروف/أرقام على الأقل.')); return; }
      if (f.pw !== f.pw2) { setErr(tt('The two passwords do not match.', 'الباسوردين مش متطابقين.')); return; }
    }
    setBusy(true); setErr('');
    try {
      if (mode === 'remove') { await desktopApi.lockDisable(f.cur); onLockChanged?.(false); setOk(tt('Lock password removed.', 'تم إلغاء باسورد القفل.')); }
      else {
        // "current" accepts either the current lock password or the account password
        await desktopApi.lockSet({ password: f.pw, account_password: f.cur, current_password: f.cur });
        onLockChanged?.(true); setOk(mode === 'set' ? tt('Lock password is on.', 'باسورد القفل اتفعّل.') : tt('Lock password changed.', 'تم تغيير باسورد القفل.'));
      }
      setMode(null);
    } catch (x) { setErr(lockError(x)); } finally { setBusy(false); }
  };
  return (
    <Section title={tt('Lock screen password', 'باسورد شاشة القفل')}>
      <p className="os-set__hint" style={{ marginTop: 0 }}>
        {on
          ? tt('The lock screen asks for your password. If you forget it, "Forgot password?" on the lock screen sends a code to your account e-mail.', 'شاشة القفل بتطلب الباسورد. لو نسيته، "نسيت الباسورد؟" في شاشة القفل بتبعت رمز على إيميل حسابك.')
          : tt('Optional. Without a password the lock screen opens with a click. With one, nobody can open your desktop without it — on any device.', 'اختياري. من غير باسورد شاشة القفل بتتفتح بضغطة. ومعاه محدش يقدر يفتح سطح مكتبك من غير الباسورد — على أي جهاز.')}
      </p>
      {ok && <p className="os-set__ok" role="status">{ok}</p>}
      {!mode && (
        <div className="os-set__btns">
          {!on && <button type="button" className="os-btn os-btn--primary" onClick={() => open('set')}>{tt('Set a lock password', 'تفعيل باسورد القفل')}</button>}
          {on && <button type="button" className="os-btn" onClick={() => open('change')}>{tt('Change password', 'تغيير الباسورد')}</button>}
          {on && <button type="button" className="os-btn os-btn--danger" onClick={() => open('remove')}>{tt('Remove password', 'إلغاء الباسورد')}</button>}
        </div>
      )}
      {mode && (
        <form className="os-set__form" onSubmit={submit}>
          <label>
            <span>{mode === 'set' ? tt('Your account password (leave empty if you sign in with Google)', 'باسورد حسابك (سيبه فاضي لو بتدخل بجوجل)') : tt('Current lock password (or your account password)', 'باسورد القفل الحالي (أو باسورد حسابك)')}</span>
            <input type="password" value={f.cur} onChange={key('cur')} autoComplete="current-password" maxLength={72} />
          </label>
          {mode !== 'remove' && (
            <>
              <label><span>{tt('New lock password', 'باسورد القفل الجديد')}</span><input type="password" value={f.pw} onChange={key('pw')} autoComplete="new-password" maxLength={72} /></label>
              <label><span>{tt('Repeat it', 'كرر الباسورد')}</span><input type="password" value={f.pw2} onChange={key('pw2')} autoComplete="new-password" maxLength={72} /></label>
            </>
          )}
          {err && <p className="os-set__err" role="alert">{err}</p>}
          <div className="os-set__btns">
            <button type="submit" className={`os-btn ${mode === 'remove' ? 'os-btn--danger' : 'os-btn--primary'}`} disabled={busy}>{busy ? '…' : mode === 'remove' ? tt('Remove', 'إلغاء الباسورد') : tt('Save', 'حفظ')}</button>
            <button type="button" className="os-btn" onClick={() => setMode(null)} disabled={busy}>{tt('Cancel', 'إلغاء')}</button>
          </div>
        </form>
      )}
    </Section>
  );
}

export function SettingsApp({ tab: tabProp, prefs, setPrefs, ar, tt, theme, toggleTheme, toggleLocale, usage, user, lockEnabled, onLockChanged }) {
  const [tab, setTab] = useState(tabProp || 'personalize');
  const [err, setErr] = useState('');
  const file = useRef(null);
  useEffect(() => { if (tabProp) setTab(tabProp); }, [tabProp]);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setPrefs({ wallpaper: 'custom', customWallpaper: await imageToWallpaper(f) }); setErr(''); } catch { setErr(tt('Could not read that image.', 'مقدرتش أقرأ الصورة دي.')); }
  };
  const tabs = [
    ['personalize', 'palette', tt('Personalization', 'التخصيص')],
    ['cloud', 'cloud', tt('Storage & backup', 'التخزين والنسخ')],
    ['lock', 'lock', tt('Lock screen', 'قفل الشاشة')],
    ['system', 'monitor', tt('System', 'النظام')],
    ['about', 'info', tt('About', 'حول')],
  ];
  return (
    <div className="os-set">
      <nav className="os-set__nav">
        {tabs.map(([k, ic, l]) => (
          <button key={k} type="button" className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={16} />{l}</button>
        ))}
      </nav>
      <div className="os-set__main">
        {tab === 'personalize' && (
          <>
            <Section title={tt('Desktop background', 'خلفية سطح المكتب')}>
              <div className="os-wp-grid">
                {WALLPAPERS.map((w) => (
                  <button key={w.id} type="button" className={`os-wp${prefs.wallpaper === w.id ? ' is-on' : ''}`} style={{ background: w.css }} onClick={() => setPrefs({ wallpaper: w.id })} title={ar ? w.ar : w.en} aria-label={ar ? w.ar : w.en}>
                    <span>{ar ? w.ar : w.en}</span>
                  </button>
                ))}
                {prefs.customWallpaper && (
                  <button type="button" className={`os-wp${prefs.wallpaper === 'custom' ? ' is-on' : ''}`} style={{ background: `center / cover url("${prefs.customWallpaper}")` }} onClick={() => setPrefs({ wallpaper: 'custom' })}><span>{tt('My picture', 'صورتي')}</span></button>
                )}
                <button type="button" className="os-wp os-wp--add" onClick={() => file.current?.click()}><Icon name="image" size={20} /><span>{tt('Browse photo…', 'اختيار صورة…')}</span></button>
              </div>
              <input ref={file} type="file" accept="image/*" hidden onChange={upload} />
              {err && <p className="os-set__err">{err}</p>}
            </Section>
            <Section title={tt('Accent color', 'لون التمييز')}>
              <div className="os-swatches">
                {ACCENTS.map((c) => <button key={c} type="button" className={prefs.accent === c ? 'is-on' : ''} style={{ background: c }} onClick={() => setPrefs({ accent: c })} aria-label={c} />)}
              </div>
            </Section>
            <Section title={tt('Dock', 'الـ Dock')}>
              <div className="os-seg">
                {[[true, tt('Magnification on', 'تكبير الأيقونات')], [false, tt('Off', 'إيقاف')]].map(([k, l]) => <button key={String(k)} type="button" className={(prefs.dockMag !== false) === k ? 'is-on' : ''} onClick={() => setPrefs({ dockMag: k })}>{l}</button>)}
              </div>
            </Section>
            <Section title={tt('Open files', 'فتح الملفات')}>
              <div className="os-seg">
                {[[true, tt('Full screen', 'ملء الصفحة')], [false, tt('In a window', 'في نافذة')]].map(([k, l]) => <button key={String(k)} type="button" className={(prefs.openMax !== false) === k ? 'is-on' : ''} onClick={() => setPrefs({ openMax: k })}>{l}</button>)}
              </div>
            </Section>
            <Section title={tt('Icon size', 'حجم الأيقونات')}>
              <div className="os-seg">
                {[['s', tt('Small', 'صغير')], ['m', tt('Medium', 'متوسط')], ['l', tt('Large', 'كبير')]].map(([k, l]) => <button key={k} type="button" className={prefs.iconSize === k ? 'is-on' : ''} onClick={() => setPrefs({ iconSize: k })}>{l}</button>)}
              </div>
            </Section>
          </>
        )}
        {tab === 'cloud' && <CloudPanel tt={tt} usage={usage} />}
        {tab === 'lock' && <LockSettings tt={tt} lockEnabled={lockEnabled} onLockChanged={onLockChanged} />}
        {tab === 'system' && (
          <>
            <Section title={tt('Appearance', 'المظهر')}>
              <div className="os-seg">
                {[['light', tt('Light', 'فاتح')], ['dark', tt('Dark', 'داكن')]].map(([k, l]) => <button key={k} type="button" className={theme === k ? 'is-on' : ''} onClick={() => { if (theme !== k) toggleTheme(); }}>{l}</button>)}
              </div>
            </Section>
            <Section title={tt('Language', 'اللغة')}>
              <div className="os-seg">
                {[['en', 'English'], ['ar', 'العربية']].map(([k, l]) => <button key={k} type="button" className={(ar ? 'ar' : 'en') === k ? 'is-on' : ''} onClick={() => { if ((ar ? 'ar' : 'en') !== k) toggleLocale(); }}>{l}</button>)}
              </div>
            </Section>
            <Section title={tt('Storage', 'التخزين')}>
              {usage ? (
                <>
                  <div className="os-bar"><i style={{ width: `${Math.min(100, usage.percent || 0)}%` }} /></div>
                  <p className="os-set__hint">{tt(`${usage.used_human} used of ${usage.quota_human} (${usage.percent}%)`, `${usage.used_human} مستخدمة من ${usage.quota_human} (${usage.percent}%)`)}</p>
                </>
              ) : <p className="os-set__hint">…</p>}
            </Section>
          </>
        )}
        {tab === 'about' && (
          <Section title="UIP Desktop">
            <dl className="os-about">
              <dt>{tt('Signed in as', 'المستخدم')}</dt><dd dir="auto">{user?.full_name || user?.email || '—'}</dd>
              <dt>{tt('Device name', 'اسم الجهاز')}</dt><dd>UIP-PC</dd>
              <dt>{tt('Edition', 'الإصدار')}</dt><dd>UIP Desktop 1.0 (web)</dd>
              <dt>{tt('Storage backend', 'مكان التخزين')}</dt><dd>{tt('Private drive on the UIP server', 'مساحتك الخاصة على سيرفر UIP')}</dd>
            </dl>
          </Section>
        )}
      </div>
    </div>
  );
}

const age = (ms, ar) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return ar ? `${s} ث` : `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? (ar ? `${m} د` : `${m}m`) : (ar ? `${Math.floor(m / 60)} س ${m % 60} د` : `${Math.floor(m / 60)}h ${m % 60}m`);
};

export function TaskManagerApp({ list, ar, tt, usage, onEnd, onFocus }) {
  const [, tick] = useState(0);
  useEffect(() => { const h = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(h); }, []);
  const [sel, setSel] = useState(null);
  const heap = typeof performance !== 'undefined' && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const rows = list.filter((w) => w.app !== 'taskmgr');
  return (
    <div className="os-tm">
      <div className="os-tm__stats">
        <div><b>{rows.length}</b><span>{tt('Apps running', 'تطبيقات شغّالة')}</span></div>
        <div><b>{heap != null ? `${heap} MB` : '—'}</b><span>{tt('Browser memory (JS)', 'ذاكرة المتصفح (JS)')}</span></div>
        <div><b>{usage ? `${usage.percent}%` : '—'}</b><span>{tt('Disk used', 'المساحة المستخدمة')}</span></div>
      </div>
      <div className="os-tm__table" role="table">
        <div className="os-tm__row os-tm__row--head" role="row"><span>{tt('Name', 'الاسم')}</span><span>{tt('Status', 'الحالة')}</span><span>{tt('Running for', 'مدة التشغيل')}</span></div>
        {rows.length === 0 && <p className="os-app-msg">{tt('No apps are running.', 'مفيش تطبيقات شغّالة.')}</p>}
        {rows.map((w) => (
          <div key={w.id} role="row" className={`os-tm__row${sel === w.id ? ' is-on' : ''}`} onClick={() => setSel(w.id)} onDoubleClick={() => onFocus(w.id)}>
            <span><AppGlyph app={w.app} size={20} /> <em dir="auto">{w.title}</em></span>
            <span>{w.min ? tt('Minimized', 'مصغّر') : tt('Running', 'يعمل')}</span>
            <span>{age(Date.now() - w.since, ar)}</span>
          </div>
        ))}
      </div>
      <footer className="os-tm__foot">
        <button type="button" className="os-btn" disabled={!sel} onClick={() => { onFocus(sel); }}>{tt('Switch to', 'التبديل إليه')}</button>
        <button type="button" className="os-btn os-btn--danger" disabled={!sel || !rows.some((w) => w.id === sel)} onClick={() => { onEnd(sel); setSel(null); }}>{tt('End task', 'إنهاء المهمة')}</button>
      </footer>
    </div>
  );
}

const Keys = ({ k }) => (
  <span className="os-keys">{k.map((c) => <span key={c}>{fmtKeys(c).split(/\+(?=.)/).map((p) => <kbd key={p}>{p}</kbd>)}</span>)}</span>
);

export function ShortcutsApp({ ar, tt }) {
  const [q, setQ] = useState('');
  const match = (s) => !q.trim() || `${s.en} ${s.ar} ${s.keys.join(' ')} ${s.win || ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const nums = SHORTCUTS.filter((s) => /^pin\d$/.test(s.id));
  const base = SHORTCUTS.filter((s) => !/^pin\d$/.test(s.id));
  return (
    <div className="os-sc">
      <div className="os-sc__top">
        <Icon name="search" size={15} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Search shortcuts…', 'ابحث في الاختصارات…')} dir="auto" />
      </div>
      <p className="os-sc__note">{tt('The browser reserves Win+key, Alt+Tab and Alt+F4, so each of them has an Alt-based twin here.', 'المتصفح بيحجز مفاتيح Win و Alt+Tab و Alt+F4، فكل واحد ليه بديل بـ Alt هنا.')}</p>
      <div className="os-sc__list">
        {GROUPS.map((g) => {
          let rows = g.id === 'explorer' ? EXPLORER_SHORTCUTS.filter(match) : base.filter((s) => s.group === g.id && match(s));
          if (g.id === 'taskbar') rows = nums.filter(match).length ? [{ keys: ['Alt+1 … Alt+9'], en: 'Open / switch to Dock app 1–9', ar: 'فتح / تبديل لتطبيق 1–9 في شريط المهام' }] : [];
          if (!rows.length) return null;
          return (
            <section key={g.id}>
              <h4>{ar ? g.ar : g.en}</h4>
              {rows.map((s) => (
                <div key={s.keys.join() + s.en} className="os-sc__row">
                  <span>{ar ? s.ar : s.en}</span>
                  <span className="os-sc__keys">
                    {g.id === 'taskbar' || g.id === 'explorer' ? <Keys k={s.keys} /> : <Keys k={s.keys} />}
                    {s.win && <small title={tt('Native macOS shortcut', 'اختصار ماك الأصلي')}>≈ {s.win}</small>}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
