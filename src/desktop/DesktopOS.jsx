import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePrivateParams } from '../lib/privateParams';
import Icon from '../components/Icon';
import { errorMessage } from '../api/client';
import { drive } from '../lib/driveApi';
import CloudTray from './CloudTray';
import { lockScroll } from '../lib/scrollLock';
import { roleHome } from '../config/roleHome';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../context/PageMetaContext';
import { useTheme } from '../context/ThemeContext';
import { APPS, ExplorerApp, PINNED, SettingsApp, ShortcutsApp, TaskManagerApp } from './apps';
import { AppGlyph, BinGlyph, PcGlyph, Tile, UipMark } from './OsIcons';
import { Dock, MenuBar } from './macShell';
import { iconPosKey, loadIconPos, loadPrefs, saveIconPos, savePrefs } from './prefs';
import { useSharedClip } from '../lib/driveClipboard';
import { globalActionFor, keyOf } from './shortcuts';
import { isSystemNode, useDesktopSync } from './sync';
import { readLockCache, readLockedFlag, writeLockedFlag, readUnlockedFlag, writeUnlockedFlag } from './desktopApi';
import { BatteryGlyph, CalendarFlyout, QuickSettings, WifiGlyph, useBattery, useOnline } from './flyouts';
import { Clock, ContextMenu, IdleWarning, NodeGlyph, OsDialog, RunDialog, StartMenu, TaskView } from './shell';
import LockScreen, { SleepScreen } from './LockScreen';
import { readSec, useDesktopSecurity } from './security';
import { wallpaperById, wallpaperCss } from './wallpapers';
import { chromeH, initialWm, winTitle, wmReducer } from './wm';
import { restoreWm, saveWm } from './wmPersist';
import { opensInEditor } from '../lib/driveFileKinds';
import WindowFrame from './Window';
import { useIsMobileOS } from './useIsMobileOS';

// Heavy parts load on demand: the file viewer + office editors only when a file is opened, the phone UI only on phones.
const ViewerWindow = lazy(() => import('./FileWindows').then((m) => ({ default: m.ViewerWindow })));
const EditorWindow = lazy(() => import('./FileWindows').then((m) => ({ default: m.EditorWindow })));
const NewFileDialog = lazy(() => import('../components/NewFileDialog'));
const MobileShell = lazy(() => import('./MobileShell'));
const WinFallback = <div className="os-app-msg"><span className="mp-spin" /></div>;
import SnapAssist from './SnapAssist';
import './desktop.css';
import './mac.css';

const EMPTY_POS = {};
const CELL = { s: { w: 78, h: 88, g: 34 }, m: { w: 94, h: 104, g: 48 }, l: { w: 114, h: 126, g: 64 } };
const PAD_X = 10; const PAD_Y = 14; const GAP = 2; // must match the old grid padding / gap
const BOTTOM_PAD = 0; const ROW_SLACK = 36; // the last row may overhang a little (a cell has empty padding), so a nearly-fitting row is not wasted
const keyId = (c, r) => `${c},${r}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Cell for every icon: remembered cells first (clamped to the screen), the rest fill the first free cells, column by column. */
function layoutIcons(keys, saved, rows, cols) {
  const taken = new Set(); const out = {};
  keys.forEach((k) => {
    const p = saved[k];
    if (!p) return;
    const c = clamp(p.c, 0, cols - 1); const r = clamp(p.r, 0, rows - 1);
    if (!taken.has(keyId(c, r))) { out[k] = { c, r }; taken.add(keyId(c, r)); }
  });
  let c = 0; let r = 0;
  keys.forEach((k) => {
    if (out[k]) return;
    while (taken.has(keyId(c, r))) { r += 1; if (r >= rows) { r = 0; c += 1; } }
    out[k] = { c, r }; taken.add(keyId(c, r));
  });
  return out;
}
/** Nearest cell to (c, r) that is not in `taken`. */
function nearestFree(c, r, taken, rows, cols) {
  for (let d = 0; d <= rows + cols; d += 1) {
    let best = null; let bestScore = Infinity;
    for (let dc = -d; dc <= d; dc += 1) {
      for (let dr = -d; dr <= d; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const cc = c + dc; const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows || taken.has(keyId(cc, rr))) continue;
        const score = dc * dc + dr * dr;
        if (score < bestScore) { best = { c: cc, r: rr }; bestScore = score; }
      }
    }
    if (best) return best;
  }
  return { c: 0, r: 0 };
}
/** Where a dragged group lands if it is moved by (dc, dr) cells: it keeps its shape, stays on screen, and pushes nothing — occupied cells make an icon take the nearest free one. */
function planMove(group, layout, dc, dr, rows, cols) {
  const cells = group.map((k) => layout[k]).filter(Boolean);
  if (!cells.length) return {};
  const minC = Math.min(...cells.map((p) => p.c)); const maxC = Math.max(...cells.map((p) => p.c));
  const minR = Math.min(...cells.map((p) => p.r)); const maxR = Math.max(...cells.map((p) => p.r));
  const mc = clamp(dc, -minC, Math.max(-minC, cols - 1 - maxC)); const mr = clamp(dr, -minR, Math.max(-minR, rows - 1 - maxR));
  const inGroup = new Set(group);
  const taken = new Set(Object.keys(layout).filter((k) => !inGroup.has(k)).map((k) => keyId(layout[k].c, layout[k].r)));
  const out = {};
  group.forEach((k) => {
    const p = layout[k];
    if (!p) return;
    let t = { c: p.c + mc, r: p.r + mr };
    if (taken.has(keyId(t.c, t.r))) t = nearestFree(t.c, t.r, taken, rows, cols);
    taken.add(keyId(t.c, t.r)); out[k] = t;
  });
  return out;
}

const RUN_ALIASES = {
  explorer: 'explorer', 'this pc': 'explorer', thispc: 'explorer', pc: 'explorer', 'جهازي': 'explorer',
  settings: 'settings', control: 'settings', 'الإعدادات': 'settings',
  personalize: 'personalize', 'التخصيص': 'personalize',
  taskmgr: 'taskmgr', 'task manager': 'taskmgr', 'مدير المهام': 'taskmgr',
  bin: 'bin', recycle: 'bin', trash: 'bin', 'سلة المحذوفات': 'bin',
  shortcuts: 'shortcuts', help: 'shortcuts', 'الاختصارات': 'shortcuts',
  cloud: 'cloud', backup: 'cloud', storage: 'cloud', 'النسخ الاحتياطي': 'cloud', 'التخزين': 'cloud',
  lock: 'lock', 'قفل': 'lock', portal: 'portal', exit: 'portal', 'البوابة': 'portal',
  sleep: 'sleep', 'سكون': 'sleep', security: 'security', devices: 'security', 'الأمان': 'security', 'الأجهزة': 'security',
};

/** The student's real "Desktop" folder on My PC (created on first use) + recycle-bin state + usage. */
function useDesktopFolder() {
  const [st, setSt] = useState({ id: null, items: [], binFull: false, usage: null, error: '', ready: false });
  const idRef = useRef(null);
  const reload = useCallback(async () => {
    const attempt = async () => {
      if (!idRef.current) {
        const root = await drive.list(null);
        let f = (root.data.items || []).find((n) => n.type === 'folder' && n.name === 'Desktop');
        if (!f) f = (await drive.createFolder(null, 'Desktop')).data;
        idRef.current = f.id;
        return { listing: await drive.list(f.id), usage: root.data.usage };
      }
      const listing = await drive.list(idRef.current);
      return { listing, usage: listing.data.usage };
    };
    try {
      let out;
      try { out = await attempt(); } catch (e) { idRef.current = null; out = await attempt(); }
      let binFull = false;
      try { binFull = ((await drive.trashList()).data || []).length > 0; } catch { /* ignore */ }
      setSt({ id: idRef.current, items: out.listing.data.items || [], binFull, usage: out.usage, error: '', ready: true });
    } catch (err) {
      setSt((s) => ({ ...s, error: errorMessage(err), ready: true }));
    }
  }, []);
  useEffect(() => { reload(); const h = setInterval(reload, 45000); return () => clearInterval(h); }, [reload]);
  // optimistic: drop items from the list right away (e.g. after "Move to…"); the next reload brings back anything that failed
  const hideLocal = useCallback((ids) => { const gone = new Set(ids); setSt((x) => ({ ...x, items: x.items.filter((n) => !gone.has(n.id)) })); }, []);
  return [st, reload, hideLocal];
}

const cellStyle = (p, cell) => ({ insetInlineEnd: PAD_X + p.c * (cell.w + GAP), top: PAD_Y + p.r * (cell.h + GAP), width: cell.w, height: cell.h });

export default function DesktopOS() {
  const { locale, setLocale, toggleLocale } = useLanguage();
  const ar = locale === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const tt = useCallback((en, a) => (ar ? a : en), [ar]);
  const { theme, mode, setMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [, setParams] = usePrivateParams();
  usePageMeta(ar ? 'جهازي' : 'My PC', '');

  const uidRef = useRef(user?.id); uidRef.current = user?.id;
  const [prefs, setPrefsState] = useState(() => loadPrefs(user?.id));
  const setPrefs = useCallback((patch) => setPrefsState((p) => { const n = { ...p, ...patch }; savePrefs(n, uidRef.current); return n; }), []);
  const [wm, rawDispatch] = useReducer(wmReducer, user?.id, (uid) => restoreWm(uid, APPS) || initialWm);
  // remember the open windows so a refresh / crash / closed tab brings them back (editors restore their unsaved edits themselves)
  useEffect(() => { const t = setTimeout(() => saveWm(uidRef.current, wm), 400); return () => clearTimeout(t); }, [wm]);
  // a window may veto its own close (unsaved edits in the code editor / image editor): guards register here
  const guards = useRef(new Map());
  const dispatch = useCallback((a) => {
    if (a.type === 'close' && !a.force) {
      const g = guards.current.get(a.id)?.(); // false = stay · Promise<boolean> = the "Save changes?" dialog decides
      if (g === false) return;
      if (g && typeof g.then === 'function') { g.then((ok) => { if (ok !== false) rawDispatch({ ...a, force: true }); }); return; }
    }
    rawDispatch(a);
  }, []);
  const guardFns = useRef(new Map()); // one stable registrar per window id (effects depend on its identity)
  const guardFor = useCallback((id) => {
    if (!guardFns.current.has(id)) guardFns.current.set(id, (fn) => { if (fn) guards.current.set(id, fn); else guards.current.delete(id); });
    return guardFns.current.get(id);
  }, []);
  const [desk, reloadDesk, hideLocal] = useDesktopFolder();
  const mobile = useIsMobileOS(); // phone-sized screen -> <MobileShell> (a purpose-built phone UI) instead of the windowed desktop
  const [overlay, setOverlay] = useState(null); // 'start' | 'run' | 'taskview' | 'qs' | 'cal'
  const battery = useBattery();
  const online = useOnline();
  const [fs, setFs] = useState(() => !!document.fullscreenElement);
  // A maximized window now fills everything below the menu bar; the Dock auto-hides and slides up when the pointer touches the bottom edge.
  const [dockPeek, setDockPeek] = useState(false);
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  // A new device / tab starts LOCKED when a lock password is set (or not yet known); a reload in the same tab keeps its state.
  const bootLock = useRef(false);
  const [locked, setLockedRaw] = useState(() => {
    const uid = user?.id; const cached = readLockCache(uid);
    if (cached === false || readSec(uid).lockOnStart === false) { writeUnlockedFlag(uid, true); return false; } // no password, or the person chose not to start locked
    if (readUnlockedFlag(uid)) return readLockedFlag(uid);
    bootLock.current = true; return true;
  });
  const lockOnRef = useRef(null);
  const setLocked = useCallback((v) => { bootLock.current = false; setLockedRaw(v); writeLockedFlag(uidRef.current, !!v && lockOnRef.current === true); writeUnlockedFlag(uidRef.current, !v); }, []);
  const [booting, setBooting] = useState(true);
  const [menu, setMenu] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [assist, setAssist] = useState(null); // Snap Assist: { zones, skip }
  const [toast, setToast] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [dropping, setDropping] = useState(false);
  const [clip, setClip] = useSharedClip(); // copy / cut clipboard (shared with the Explorer window)
  const [box, setBox] = useState(null); // rubber-band selection rectangle, in desktop coordinates
  const [drag, setDrag] = useState(null); // { keys, dx, dy, over } while icons are being dragged
  const [deskSize, setDeskSize] = useState({ w: 0, h: 0 });
  const iconEls = useRef({});
  const suppressClick = useRef(false);
  const deskRef = useRef(null);
  const dlgResolve = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => lockScroll(), []);
  useEffect(() => { document.documentElement.classList.add('os-active'); return () => document.documentElement.classList.remove('os-active'); }, []);
  useEffect(() => { const h = setTimeout(() => setBooting(false), 950); return () => clearTimeout(h); }, []);

  const flash = useCallback((msg, tone = 'ok') => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 5000 : 2400);
  }, []);

  // ---- dialogs (promise based) -------------------------------------------------------------------------
  const ask = useCallback((cfg) => new Promise((resolve) => { dlgResolve.current = resolve; setDlg(cfg); }), []);
  const finishDlg = useCallback((v) => { setDlg(null); dlgResolve.current?.(v); dlgResolve.current = null; }, []);

  // ---- windows -----------------------------------------------------------------------------------------
  const openApp = useCallback((app, props, extra = {}) => {
    const def = APPS[app];
    dispatch({ type: 'open', app, singleton: def.singleton, size: def.size, props, ...extra, maximized: extra.maximized ?? window.innerWidth < 720, area: { aw: window.innerWidth, ah: window.innerHeight - chromeH() } });
    setOverlay(null);
  }, [dispatch]);
  const openExplorer = useCallback((params = {}) => { setParams(params); openApp('explorer'); }, [openApp, setParams]);
  // Save Center toasts ("Set up cloud backup") open Settings ▸ Storage & backup in this desktop
  useEffect(() => {
    const h = (e) => { if (e.detail) e.detail.handled = true; openApp('settings', { tab: 'cloud' }); };
    window.addEventListener('uip-open-cloud-settings', h);
    return () => window.removeEventListener('uip-open-cloud-settings', h);
  }, [openApp]);

  const sleepRef = useRef(null);
  const runCommand = useCallback((id) => {
    switch (id) {
      case 'explorer': openExplorer({}); break;
      case 'bin': openExplorer({ view: 'trash' }); break;
      case 'settings': openApp('settings'); break;
      case 'cloud': openApp('settings', { tab: 'cloud' }); break;
      case 'personalize': openApp('settings', { tab: 'personalize' }); break;
      case 'taskmgr': openApp('taskmgr'); break;
      case 'shortcuts': openApp('shortcuts'); break;
      case 'run': setOverlay('run'); break;
      case 'lock': setOverlay(null); setLocked(true); break;
      case 'sleep': setOverlay(null); sleepRef.current?.(); break;
      case 'security': openApp('settings', { tab: 'security' }); break;
      case 'portal': navigate(roleHome(user?.role)); break;
      default: break;
    }
  }, [navigate, openApp, openExplorer, setLocked, user?.role]);

  // images / PDFs / media / ZIPs open in a Viewer window, text & code in a Code-editor window (one window per file)
  const openFileWin = useCallback((p) => {
    if (p.kind === 'viewer') {
      const f = p.files.find((x) => x.id === p.startId);
      openApp('viewer', { files: p.files, startId: p.startId }, { title: f?.original_name, key: `v:${p.startId}`, maximized: prefs.openMax !== false });
    } else {
      openApp('editor', { editor: p.editor }, { title: p.editor.node.name, key: `e:${p.editor.node.id}`, maximized: prefs.openMax !== false });
    }
  }, [openApp, prefs.openMax]);
  const openNode = useCallback((n) => {
    if (n.type === 'folder') { openExplorer({ folder: String(n.id) }); return; }
    if (opensInEditor(n.name)) { openFileWin({ kind: 'editor', editor: { kind: 'text', node: n } }); return; }
    const toFile = (x) => ({ id: x.id, original_name: x.name, url: `drive:${x.id}`, size_bytes: x.size_bytes, size_human: x.size_human, version: 1, driveId: x.id });
    const sibs = desk.items.filter((x) => x.type === 'file' && !isSystemNode(x) && !opensInEditor(x.name));
    openFileWin({ kind: 'viewer', startId: n.id, files: (sibs.some((x) => x.id === n.id) ? sibs : [n]).map(toFile) });
  }, [desk.items, openExplorer, openFileWin]);

  // a viewer / editor window saved something in My PC -> refresh the desktop icons
  useEffect(() => { const h = () => reloadDesk(); window.addEventListener('uip-drive-changed', h); return () => window.removeEventListener('uip-drive-changed', h); }, [reloadDesk]);

  // F5 / right-click > Refresh: re-read the Desktop folder, the Recycle Bin state AND every open Explorer window (they listen to the same event),
  // instead of silently re-fetching one list. The event makes the desktop reload itself, so reloadDesk is not called twice.
  const refreshAll = useCallback(() => {
    window.dispatchEvent(new Event('uip-drive-changed'));
    flash(tt('Refreshed.', 'تم التحديث.'));
  }, [flash, tt]);

  // right-click > New > Word / Excel / PowerPoint / PDF …: <NewFileDialog> saves the file on the Desktop; once the icons reload, open it in its editor window
  const pendingOpen = useRef(null);
  const newDoc = useCallback((type) => { setOverlay(null); setDlg({ kind: 'newfile', type }); }, []);
  useEffect(() => {
    if (pendingOpen.current == null) return;
    const n = desk.items.find((x) => x.id === pendingOpen.current);
    if (!n) return;
    pendingOpen.current = null;
    openNode(n);
  }, [desk.items, openNode]);

  // after the Explorer window loses focus / closes, pick up any changes it made to the Desktop folder
  const explorerWin = wm.list.find((w) => w.app === 'explorer');
  const explorerLive = !!explorerWin && !explorerWin.min && wm.active === explorerWin.id;
  const wasLive = useRef(false);
  useEffect(() => { if (wasLive.current && !explorerLive) reloadDesk(); wasLive.current = explorerLive; }, [explorerLive, reloadDesk]);

  // keep keyboard focus on the active window (and give it back when an overlay closes)
  useEffect(() => {
    if (overlay || locked || dlg) return;
    const el = wm.active ? document.getElementById(`os-${wm.active}`) : null;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    else if (!wm.active && document.activeElement === document.body) deskRef.current?.focus({ preventScroll: true });
  }, [wm.active, overlay, locked, dlg]);

  // ---- taskbar model -----------------------------------------------------------------------------------
  // pinned apps (one button each) + every other open window (one button per window, e.g. each opened file)
  const taskItems = useMemo(() => [
    ...PINNED.map((app) => ({ key: app, app })),
    ...wm.list.filter((w) => !PINNED.includes(w.app)).map((w) => ({ key: w.id, app: w.app, winId: w.id })),
  ], [wm.list]);
  const winOf = useCallback((it) => (it.winId ? wm.list.find((x) => x.id === it.winId) : wm.list.find((x) => x.app === it.app)), [wm.list]);
  const taskClick = useCallback((it) => {
    const w = winOf(it);
    if (!w) { it.app === 'explorer' ? openExplorer({}) : openApp(it.app); return; }
    if (w.min || wm.active !== w.id) dispatch({ type: 'focus', id: w.id });
    else dispatch({ type: 'minimize', id: w.id });
    setOverlay(null);
  }, [winOf, wm.active, openApp, openExplorer, dispatch]);

  // ---- desktop icons -----------------------------------------------------------------------------------
  const sysIcons = useMemo(() => [
    { key: 'sys:explorer', sys: true, label: tt('This PC', 'جهازي'), glyph: 'explorer', run: () => openExplorer({}) },
    { key: 'sys:bin', sys: true, label: tt('Recycle Bin', 'سلة المحذوفات'), glyph: 'bin', run: () => openExplorer({ view: 'trash' }) },
    { key: 'sys:portal', sys: true, label: tt('UIP Portal', 'بوابة UIP'), glyph: 'portal', run: () => runCommand('portal') },
    { key: 'sys:settings', sys: true, label: tt('Settings', 'الإعدادات'), glyph: 'settings', run: () => runCommand('settings') },
    { key: 'sys:shortcuts', sys: true, label: tt('Shortcuts', 'الاختصارات'), glyph: 'shortcuts', run: () => runCommand('shortcuts') },
  ], [tt, openExplorer, runCommand]);
  const deskItems = useMemo(() => desk.items.filter((n) => !isSystemNode(n)), [desk.items]); // hide the hidden settings files
  const icons = useMemo(() => [...sysIcons, ...deskItems.map((n) => ({ key: `n:${n.id}`, node: n, label: n.name, run: () => openNode(n) }))], [sysIcons, deskItems, openNode]);
  const selNodes = icons.filter((i) => sel.has(i.key) && i.node).map((i) => i.node);

  // ---- icon grid + remembered positions ----------------------------------------------------------------
  const cell = CELL[prefs.iconSize] || CELL.m;
  const posKey = iconPosKey(user?.id);
  const [store, setStore] = useState(() => ({ key: posKey, map: loadIconPos(posKey) }));
  useEffect(() => { if (store.key !== posKey) setStore({ key: posKey, map: loadIconPos(posKey) }); }, [posKey, store.key]);
  const saved = store.key === posKey ? store.map : EMPTY_POS;
  const commitPos = useCallback((map) => { setStore({ key: posKey, map }); saveIconPos(posKey, map); }, [posKey]);
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return undefined;
    const measure = () => setDeskSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [mobile]);
  const rows = Math.max(1, Math.floor((deskSize.h - PAD_Y - BOTTOM_PAD + GAP + ROW_SLACK) / (cell.h + GAP)));
  const cols = Math.max(1, Math.floor((deskSize.w - 2 * PAD_X + GAP) / (cell.w + GAP)));
  const layout = useMemo(() => layoutIcons(icons.map((i) => i.key), saved, rows, cols), [icons, saved, rows, cols]);
  // settings (+ lock password status) follow the student to every device — stored on the server, see ./sync.js
  const { synced, lockEnabled, setLockEnabled } = useDesktopSync({
    uid: user?.id,
    state: useMemo(() => ({ prefs, icons: saved, mode, locale }), [prefs, saved, mode, locale]),
    apply: useCallback((n) => {
      setPrefsState(n.prefs); savePrefs(n.prefs, user?.id);
      commitPos(n.icons);
      if (n.mode && n.mode !== mode) setMode(n.mode);
      if (n.locale && n.locale !== locale) setLocale(n.locale);
    }, [commitPos, mode, locale, setMode, setLocale, user?.id]),
  });
  lockOnRef.current = lockEnabled;
  // Security & devices: auto-lock, sleep, lock-on-leave, remote lock, sign-out countdown (see ./security.js)
  const onSecLock = useCallback((reason) => {
    setOverlay(null); setLocked(true);
    if (reason === 'remote') flash(tt('This device was locked from another device.', 'الجهاز ده اتقفل من جهاز تاني.'), 'ok');
  }, [setLocked, flash, tt]);
  const { sec, applySec, asleep, sleep, wake, idleLeft, stay } = useDesktopSecurity({ uid: user?.id, locked, onLock: onSecLock });
  sleepRef.current = sleep;
  const secRef = useRef(sec); secRef.current = sec;
  const onWake = useCallback(() => { wake(); if (secRef.current.lockAfterSleep && lockOnRef.current === true) setLocked(true); }, [wake, setLocked]);
  useEffect(() => {
    const startLocked = sec.lockOnStart !== false;
    if ((lockEnabled === false || !startLocked) && bootLock.current) { bootLock.current = false; setLockedRaw(false); writeUnlockedFlag(uidRef.current, true); } // no password set / chose not to start locked: nothing to ask on a new device
    else if (lockEnabled === true && startLocked && !readUnlockedFlag(uidRef.current)) setLockedRaw(true); // password was set on another device
  }, [lockEnabled, sec.lockOnStart]);
  // remember where every icon sits (new ones get the first free cell, deleted ones are forgotten)
  useEffect(() => {
    if (!synced || !desk.ready || desk.error || store.key !== posKey || !deskSize.h) return;
    const keys = icons.map((i) => i.key);
    if (!keys.some((k) => !saved[k]) && !Object.keys(saved).some((k) => !keys.includes(k))) return;
    const next = {};
    keys.forEach((k) => { next[k] = saved[k] || layout[k]; });
    commitPos(next);
  }, [synced, desk.ready, desk.error, store.key, posKey, deskSize.h, icons, saved, layout, commitPos]);
  const live = useRef({}); // latest values for the pointer handlers below
  const selRef = useRef(sel);
  selRef.current = sel;
  live.current = { layout, rows, cols, cell, ar, icons, commitPos };

  const newFolder = useCallback(async () => {
    const v = await ask({ kind: 'prompt', title: tt('New folder', 'مجلد جديد'), label: tt('Folder name', 'اسم المجلد'), value: tt('New folder', 'مجلد جديد'), selectAll: true, action: tt('Create', 'إنشاء') });
    if (!v || !desk.id) return;
    try { await drive.createFolder(desk.id, v); reloadDesk(); } catch (e) { flash(errorMessage(e), 'error'); }
  }, [ask, desk.id, flash, reloadDesk, tt]);
  const newFile = useCallback(async () => {
    const v = await ask({ kind: 'prompt', title: tt('New text file', 'ملف نصي جديد'), label: tt('File name', 'اسم الملف'), value: 'untitled.txt', action: tt('Create', 'إنشاء') });
    if (!v || !desk.id) return;
    try { await drive.createFile(desk.id, v); reloadDesk(); } catch (e) { flash(errorMessage(e), 'error'); }
  }, [ask, desk.id, flash, reloadDesk, tt]);
  const renameNode = useCallback(async (n) => {
    const v = await ask({ kind: 'prompt', title: tt('Rename', 'إعادة تسمية'), label: tt('New name', 'الاسم الجديد'), value: n.name, selectAll: n.type === 'folder', action: tt('Rename', 'تسمية') });
    if (!v || v === n.name) return;
    try { await drive.rename(n.id, v); reloadDesk(); } catch (e) { flash(errorMessage(e), 'error'); }
  }, [ask, flash, reloadDesk, tt]);
  const trashNodes = useCallback(async (nodes) => {
    if (!nodes.length) return;
    try { await drive.trash(nodes.map((n) => n.id)); setSel(new Set()); flash(tt('Moved to the Recycle Bin.', 'تم النقل إلى سلة المحذوفات.')); reloadDesk(); } catch (e) { flash(errorMessage(e), 'error'); }
  }, [flash, reloadDesk, tt]);

  // ---- copy / cut / paste -------------------------------------------------------------------------------
  const copyNodes = useCallback((nodes, mode) => {
    if (!nodes.length) return;
    setClip({ ids: nodes.map((n) => n.id), mode });
    flash(mode === 'cut' ? tt('Cut — paste where you want.', 'تم القص — الصق في المكان المطلوب.') : tt('Copied to clipboard.', 'تم النسخ للحافظة.'));
  }, [flash, setClip, tt]);
  const pasteInto = useCallback(async (targetId) => {
    const cur = clip;
    if (!cur?.ids?.length || !targetId) return;
    const here = new Set(desk.items.map((n) => n.id));
    if (cur.mode === 'cut' && targetId === desk.id && cur.ids.every((id) => here.has(id))) { setClip(null); return; } // already on the desktop
    try {
      if (cur.mode === 'cut') { await drive.move(cur.ids, targetId); setClip(null); } else { await drive.copy(cur.ids, targetId); }
      flash(cur.mode === 'cut' ? tt('Moved.', 'تم النقل.') : tt('Pasted.', 'تم اللصق.'));
    } catch (e) { flash(errorMessage(e), 'error'); }
    reloadDesk();
  }, [clip, desk.id, desk.items, flash, reloadDesk, setClip, tt]);

  // ---- dragging icons (move on the desktop, or drop on a folder / the Recycle Bin) -----------------------
  const onIconPointerDown = (e, ic) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    deskRef.current?.focus({ preventScroll: true });
    const additive = e.ctrlKey || e.metaKey;
    if (!additive && !selRef.current.has(ic.key)) setSel(new Set([ic.key]));
    const group = selRef.current.has(ic.key) ? [...selRef.current] : additive ? [...selRef.current, ic.key] : [ic.key];
    const sx = e.clientX; const sy = e.clientY;
    let started = false; let dx = 0; let dy = 0; let over = null;
    const overOf = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-ikey]');
      const k = el?.getAttribute('data-ikey');
      if (!k || group.includes(k)) return null;
      const t = live.current.icons.find((i) => i.key === k);
      return t && (t.key === 'sys:bin' || t.node?.type === 'folder') ? k : null;
    };
    const move = (ev) => {
      dx = ev.clientX - sx; dy = ev.clientY - sy;
      if (!started) {
        if (Math.hypot(dx, dy) < 5) return;
        started = true;
        setMenu(null);
        document.body.classList.add('os-dragging');
        setSel(new Set(group));
      }
      over = overOf(ev);
      setDrag({ keys: group, dx, dy, over });
    };
    const end = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('os-dragging');
      if (!started) return;
      suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0);
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      const L = live.current;
      const nodes = group.map((k) => L.icons.find((i) => i.key === k)?.node).filter(Boolean);
      const target = over ? L.icons.find((i) => i.key === over) : null;
      if (target?.key === 'sys:bin') { if (nodes.length) trashNodes(nodes); return; }
      if (target?.node && nodes.length) {
        drive.move(nodes.map((n) => n.id), target.node.id)
          .then(() => { flash(tt(`Moved into “${target.node.name}”.`, `تم النقل إلى «${target.node.name}».`)); setSel(new Set()); reloadDesk(); })
          .catch((err) => flash(errorMessage(err), 'error'));
        return;
      }
      const stride = { w: L.cell.w + GAP, h: L.cell.h + GAP };
      const moved = planMove(group, L.layout, Math.round(dx / stride.w) * (L.ar ? -1 : 1), Math.round(dy / stride.h), L.rows, L.cols);
      L.commitPos({ ...L.layout, ...moved });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // ---- rubber-band selection ------------------------------------------------------------------------------
  const onDeskPointerDown = (e) => {
    if (e.target !== e.currentTarget || e.button !== 0 || !e.isPrimary) return;
    deskRef.current?.focus({ preventScroll: true });
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selRef.current) : new Set();
    if (!additive) setSel(new Set());
    const rect = deskRef.current.getBoundingClientRect();
    const sx = clamp(e.clientX, rect.left, rect.right); const sy = clamp(e.clientY, rect.top, rect.bottom);
    let started = false; let last = base;
    const move = (ev) => {
      const x = clamp(ev.clientX, rect.left, rect.right); const y = clamp(ev.clientY, rect.top, rect.bottom);
      if (!started) { if (Math.hypot(x - sx, y - sy) < 4) return; started = true; document.body.classList.add('os-dragging'); }
      const l = Math.min(sx, x); const t = Math.min(sy, y); const r = Math.max(sx, x); const b = Math.max(sy, y);
      setBox({ left: l - rect.left, top: t - rect.top, width: r - l, height: b - t });
      const next = new Set(base);
      Object.entries(iconEls.current).forEach(([k, el]) => {
        const q = el.getBoundingClientRect();
        if (q.left < r && q.right > l && q.top < b && q.bottom > t) next.add(k);
      });
      if (next.size !== last.size || [...next].some((k) => !last.has(k))) { last = next; setSel(next); }
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('os-dragging');
      setBox(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const deskMenu = (e) => {
    e.preventDefault();
    setOverlay(null);
    setMenu({
      x: e.clientX, y: e.clientY, items: [
        { label: tt('Refresh', 'تحديث'), icon: 'refresh', hint: 'F5', onClick: refreshAll },
        { label: tt('Auto-arrange icons', 'ترتيب الأيقونات تلقائيًا'), icon: 'layers', onClick: () => commitPos({}) },
        'sep',
        { label: tt('Paste', 'لصق'), icon: 'file-plus', hint: 'Ctrl+V', onClick: () => pasteInto(desk.id), disabled: !desk.id || !clip },
        'sep',
        { label: tt('New folder', 'مجلد جديد'), icon: 'folder-plus', hint: 'Ctrl+Shift+N', onClick: newFolder, disabled: !desk.id },
        { label: tt('New text file', 'ملف نصي جديد'), icon: 'file-plus', onClick: newFile, disabled: !desk.id },
        { label: tt('New Word document', 'مستند Word جديد'), icon: 'file-plus', onClick: () => newDoc('docx'), disabled: !desk.id },
        { label: tt('New Excel workbook', 'جدول Excel جديد'), icon: 'file-plus', onClick: () => newDoc('xlsx'), disabled: !desk.id },
        { label: tt('New PowerPoint presentation', 'عرض PowerPoint جديد'), icon: 'file-plus', onClick: () => newDoc('pptx'), disabled: !desk.id },
        { label: tt('New PDF / other file…', 'ملف PDF / نوع آخر…'), icon: 'file-plus', onClick: () => newDoc('pdf'), disabled: !desk.id },
        'sep',
        { label: tt('Open This PC', 'فتح جهازي'), icon: 'monitor', hint: 'Alt+E', onClick: () => runCommand('explorer') },
        { label: tt('Personalize', 'تخصيص'), icon: 'palette', hint: 'Alt+P', onClick: () => runCommand('personalize') },
        { label: tt('Keyboard shortcuts', 'اختصارات الكيبورد'), icon: 'key', hint: 'F1', onClick: () => runCommand('shortcuts') },
      ],
    });
  };
  const iconMenu = (e, ic) => {
    e.preventDefault(); e.stopPropagation();
    setOverlay(null);
    if (!sel.has(ic.key)) setSel(new Set([ic.key]));
    const items = [{ label: tt('Open', 'فتح'), icon: 'eye', hint: 'Enter', onClick: ic.run }];
    if (!ic.sys) {
      const many = selNodes.length > 1 && sel.has(ic.key) ? selNodes : [ic.node];
      items.push('sep',
        { label: tt('Copy', 'نسخ'), icon: 'copy', hint: 'Ctrl+C', onClick: () => copyNodes(many, 'copy') },
        { label: tt('Cut', 'قص'), icon: 'ed-crop', hint: 'Ctrl+X', onClick: () => copyNodes(many, 'cut') });
      if (ic.node.type === 'folder' && clip) items.push({ label: tt('Paste into folder', 'لصق داخل المجلد'), icon: 'file-plus', onClick: () => pasteInto(ic.node.id) });
      items.push('sep', { label: tt('Rename', 'إعادة تسمية'), icon: 'edit', hint: 'F2', disabled: many.length > 1, onClick: () => renameNode(ic.node) },
        { label: tt('Delete', 'حذف'), icon: 'trash', hint: 'Del', danger: true, onClick: () => trashNodes(many) });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const clickIcon = (e, ic) => {
    e.stopPropagation();
    if (suppressClick.current) return; // the click that ends a drag
    deskRef.current?.focus({ preventScroll: true });
    setSel((s) => {
      if (e.ctrlKey || e.metaKey) { const n = new Set(s); n.has(ic.key) ? n.delete(ic.key) : n.add(ic.key); return n; }
      return new Set([ic.key]);
    });
  };

  const onDeskKey = (e) => {
    if (e.target !== deskRef.current && !e.target.closest?.('.os-icon')) return;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    const keys = icons.map((i) => i.key);
    const cur = icons.filter((i) => sel.has(i.key));
    const pk = keyOf(e); // physical key, so it works on the Arabic layout too
    if (mod && e.shiftKey && pk === 'N') { e.preventDefault(); newFolder(); }
    else if (mod && pk === 'A') { e.preventDefault(); setSel(new Set(keys)); }
    else if (mod && pk === 'C' && selNodes.length) { e.preventDefault(); copyNodes(selNodes, 'copy'); }
    else if (mod && pk === 'X' && selNodes.length) { e.preventDefault(); copyNodes(selNodes, 'cut'); }
    else if (mod && pk === 'V' && clip && desk.id) { e.preventDefault(); pasteInto(desk.id); }
    else if (k === 'Enter' && cur.length) { e.preventDefault(); cur.forEach((i) => i.run()); }
    else if (k === 'F2' && cur.length === 1 && cur[0].node) { e.preventDefault(); renameNode(cur[0].node); }
    else if (k === 'Delete' && selNodes.length) { e.preventDefault(); trashNodes(selNodes); }
    else if (k === 'F5') { e.preventDefault(); refreshAll(); }
    else if (k === 'Escape') setSel(new Set());
    else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const here = cur.length ? layout[cur[cur.length - 1].key] : null;
      if (!here) { setSel(new Set(keys.slice(0, 1))); return; }
      const side = ar ? -1 : 1;
      const [vc, vr] = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [side, 0], ArrowLeft: [-side, 0] }[k];
      let best = null; let bestScore = Infinity;
      icons.forEach((i) => {
        const p = layout[i.key];
        const along = (p.c - here.c) * vc + (p.r - here.r) * vr; // distance in the arrow's direction
        const across = Math.abs((p.c - here.c) * vr) + Math.abs((p.r - here.r) * vc);
        if (along <= 0) return;
        const score = along + across * 3;
        if (score < bestScore) { best = i.key; bestScore = score; }
      });
      if (best) setSel(new Set([best]));
    }
  };

  const onDrop = async (e) => {
    e.preventDefault(); setDropping(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !desk.id) return;
    flash(tt(`Uploading ${files.length} file(s)…`, `جارٍ رفع ${files.length} ملف…`));
    let bad = 0;
    for (const f of files) { try { await drive.upload(desk.id, f, null); } catch { bad += 1; } } // eslint-disable-line no-await-in-loop
    flash(bad ? tt(`${bad} file(s) could not be uploaded (folders are not supported on the desktop).`, `${bad} ملف مترفعش (المجلدات مش مدعومة على سطح المكتب).`) : tt('Files added to the desktop.', 'تمت إضافة الملفات لسطح المكتب.'), bad ? 'error' : 'ok');
    reloadDesk();
  };

  // ---- keyboard shortcuts ------------------------------------------------------------------------------
  const S = useRef({});
  S.current = { wm, overlay, locked, asleep, dlg, taskItems, taskClick, runCommand, refreshAll };
  useEffect(() => {
    const onKey = (e) => {
      const s = S.current;
      if (e.defaultPrevented || s.locked || s.asleep || s.dlg) return;
      // F5 / Ctrl+R: "refresh" belongs to the desktop. Without this, any focus outside the icons (a window, the dock, the menu bar)
      // let the browser reload the whole page, losing the session state. Editors keep their unsaved-edit drafts, but we do not gamble on it.
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && keyOf(e) === 'R')) {
        e.preventDefault();
        s.refreshAll();
        return;
      }
      const id = globalActionFor(e);
      // the code workbench / viewer keep their own keys; only the window-level Alt combos pass through
      if (e.target?.closest?.('.zb, .st-fv, .mp-editor') && !/^(close|next|prev|desktop|taskview|pin\d)$/.test(id || '')) return;
      if (!id) {
        if (e.key === 'Escape' && s.overlay) { e.preventDefault(); setOverlay(null); }
        return;
      }
      e.preventDefault();
      const act = s.wm.list.find((w) => w.id === s.wm.active);
      const onAct = (fn) => { if (act) fn(act); };
      switch (id) {
        case 'start': setOverlay((o) => (o === 'start' ? null : 'start')); break;
        case 'run': setOverlay((o) => (o === 'run' ? null : 'run')); break;
        case 'taskview': setOverlay((o) => (o === 'taskview' ? null : 'taskview')); break;
        case 'lock': case 'sleep': case 'settings': case 'personalize': case 'explorer': case 'bin': case 'taskmgr': s.runCommand(id); break;
        case 'help': s.runCommand('shortcuts'); break;
        case 'next': dispatch({ type: 'cycle', dir: 1 }); break;
        case 'prev': dispatch({ type: 'cycle', dir: -1 }); break;
        case 'close': onAct((w) => dispatch({ type: 'close', id: w.id })); break;
        case 'desktop': dispatch({ type: 'showDesktop' }); setOverlay(null); break;
        case 'restoreAll': dispatch({ type: 'restoreAll' }); break;
        case 'snapL': onAct((w) => dispatch({ type: 'snap', id: w.id, side: 'left' })); break;
        case 'snapR': onAct((w) => dispatch({ type: 'snap', id: w.id, side: 'right' })); break;
        case 'maximize': onAct((w) => dispatch({ type: 'snap', id: w.id, side: 'max' })); break;
        case 'down': onAct((w) => (w.max ? dispatch({ type: 'toggleMax', id: w.id }) : w.snap ? dispatch({ type: 'patch', id: w.id, patch: { snap: null } }) : dispatch({ type: 'minimize', id: w.id }))); break;
        default: {
          const m = /^pin(\d)$/.exec(id);
          if (m && s.taskItems[Number(m[1]) - 1]) s.taskClick(s.taskItems[Number(m[1]) - 1]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runText = (t) => { const id = RUN_ALIASES[t.toLowerCase()]; if (!id) return false; setOverlay(null); runCommand(id); return true; };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); };

  const startApps = useMemo(() => [
    { id: 'explorer', en: 'This PC', ar: 'جهازي', glyph: 'explorer' },
    { id: 'bin', en: 'Recycle Bin', ar: 'سلة المحذوفات', glyph: 'bin' },
    { id: 'settings', en: 'Settings', ar: 'الإعدادات', glyph: 'settings' },
    { id: 'personalize', en: 'Personalize', ar: 'التخصيص', glyph: 'personalize' },
    { id: 'taskmgr', en: 'Task Manager', ar: 'مدير المهام', glyph: 'taskmgr' },
    { id: 'shortcuts', en: 'Keyboard shortcuts', ar: 'اختصارات الكيبورد', glyph: 'shortcuts' },
    { id: 'run', en: 'Run', ar: 'تشغيل', glyph: 'run' },
    { id: 'lock', en: 'Lock', ar: 'قفل', glyph: 'lock' },
    { id: 'portal', en: 'UIP Portal', ar: 'بوابة UIP', glyph: 'portal' },
  ], []);

  const wp = prefs.wallpaper === 'custom' ? { dark: true } : wallpaperById(prefs.wallpaper);
  // A window body is rebuilt only when ITS inputs change. Without this every desktop re-render (toast, icon selection, a focus change, the battery…)
  // re-rendered every open window — the viewer, the code editor, Settings — which is what made the desktop feel heavy.
  const bodyCache = useRef(new Map());
  const cached = (w, deps, make) => {
    const c = bodyCache.current.get(w.id);
    if (c && c.deps.length === deps.length && c.deps.every((d, i) => Object.is(d, deps[i]))) return c.el;
    const el = make();
    bodyCache.current.set(w.id, { deps, el });
    return el;
  };
  useEffect(() => { const live = new Set(wm.list.map((w) => w.id)); bodyCache.current.forEach((_, id) => { if (!live.has(id)) bodyCache.current.delete(id); }); }, [wm.list]);
  const bodyOf = (w) => {
    switch (w.app) {
      case 'explorer': return <ExplorerApp onOpenWindow={openFileWin} />;
      case 'viewer': return cached(w, [w.props, locale, openFileWin], () => <Suspense fallback={WinFallback}><ViewerWindow files={w.props.files} startId={w.props.startId} locale={locale} registerGuard={guardFor(w.id)} onClose={() => dispatch({ type: 'close', id: w.id, force: true })}
        onEditText={(f) => openFileWin({ kind: 'editor', editor: { kind: 'text', node: { id: f.driveId ?? f.id, name: f.original_name } } })} /></Suspense>);
      case 'editor': return cached(w, [w.props, locale], () => <Suspense fallback={WinFallback}><EditorWindow editor={w.props.editor} locale={locale} registerGuard={guardFor(w.id)} /></Suspense>);
      case 'settings': return <SettingsApp tab={w.props.tab} prefs={prefs} setPrefs={setPrefs} ar={ar} tt={tt} theme={theme} toggleTheme={toggleTheme} toggleLocale={toggleLocale} usage={desk.usage} user={user} lockEnabled={lockEnabled} onLockChanged={setLockEnabled}
        sec={sec} onSec={applySec} onLockNow={() => runCommand('lock')} onSleepNow={() => runCommand('sleep')} onSelfLogout={logout} />;
      case 'taskmgr': return <TaskManagerApp list={wm.list} ar={ar} tt={tt} usage={desk.usage} onEnd={(id) => dispatch({ type: 'close', id })} onFocus={(id) => dispatch({ type: 'focus', id })} />;
      case 'shortcuts': return <ShortcutsApp ar={ar} tt={tt} />;
      default: return null;
    }
  };

  const brightness = Math.min(100, Math.max(40, Number(prefs.brightness) || 100));
  const activeWin = wm.list.find((w) => w.id === wm.active && !w.min) || null;
  const appName = activeWin ? (ar ? APPS[activeWin.app].ar : APPS[activeWin.app].en) : tt('This PC', 'جهازي');
  const menus = [
    { id: 'sys', logo: true, items: [
      { label: tt('About UIP Desktop', 'عن سطح مكتب UIP'), onClick: () => runCommand('settings') },
      'sep',
      { label: tt('System Settings…', 'إعدادات النظام…'), onClick: () => runCommand('settings') },
      { label: tt('Personalize…', 'التخصيص…'), onClick: () => runCommand('personalize') },
      { label: tt('Task Manager', 'مدير المهام'), onClick: () => runCommand('taskmgr') },
      'sep',
      { label: tt('Lock Screen', 'قفل الشاشة'), hint: 'Alt+L', onClick: () => runCommand('lock') },
      { label: tt('Sleep', 'وضع السكون'), hint: 'Alt+Shift+S', onClick: () => runCommand('sleep') },
      { label: tt('Security & devices…', 'الأمان والأجهزة…'), onClick: () => runCommand('security') },
      { label: tt('Back to the portal…', 'الرجوع للبوابة…'), onClick: () => runCommand('portal') },
    ] },
    { id: 'app', bold: true, label: appName, items: [
      { label: tt('Settings…', 'الإعدادات…'), onClick: () => runCommand('settings') },
      'sep',
      { label: tt('Minimize', 'تصغير'), disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'minimize', id: activeWin.id }) },
      { label: tt('Close window', 'إغلاق النافذة'), hint: 'Alt+W', disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'close', id: activeWin.id }) },
    ] },
    { id: 'file', label: tt('File', 'ملف'), hideSmall: true, items: [
      { label: tt('New Window', 'نافذة جديدة'), onClick: () => runCommand('explorer') },
      { label: tt('Recycle Bin', 'سلة المحذوفات'), onClick: () => runCommand('bin') },
      'sep',
      { label: tt('Close window', 'إغلاق النافذة'), hint: 'Alt+W', disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'close', id: activeWin.id }) },
    ] },
    { id: 'view', label: tt('View', 'عرض'), hideSmall: true, items: [
      { label: fs ? tt('Exit Full Screen', 'إنهاء ملء الشاشة') : tt('Enter Full Screen', 'ملء الشاشة'), onClick: fullscreen },
      { label: tt('Mission Control', 'عرض المهام'), hint: 'Alt+V', onClick: () => setOverlay('taskview') },
      { label: tt('Show Desktop', 'إظهار سطح المكتب'), hint: 'Alt+D', onClick: () => dispatch({ type: 'showDesktop' }) },
      'sep',
      { label: tt('Dark appearance', 'المظهر الداكن'), check: theme === 'dark', onClick: toggleTheme },
    ] },
    { id: 'window', label: tt('Window', 'نافذة'), hideSmall: true, items: [
      { label: tt('Zoom', 'تكبير'), disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'toggleMax', id: activeWin.id }) },
      { label: tt('Tile Left', 'تثبيت لليسار'), hint: 'Alt+←', disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'snap', id: activeWin.id, side: 'left' }) },
      { label: tt('Tile Right', 'تثبيت لليمين'), hint: 'Alt+→', disabled: !activeWin, onClick: () => activeWin && dispatch({ type: 'snap', id: activeWin.id, side: 'right' }) },
      'sep',
      { label: tt('Bring All to Front', 'إظهار الكل'), onClick: () => dispatch({ type: 'restoreAll' }) },
      ...wm.list.map((w) => ({ label: winTitle(w, APPS, ar), check: w.id === wm.active, onClick: () => dispatch({ type: 'focus', id: w.id }) })),
    ] },
    { id: 'help', label: tt('Help', 'مساعدة'), hideSmall: true, items: [
      { label: tt('Keyboard shortcuts', 'اختصارات الكيبورد'), onClick: () => runCommand('shortcuts') },
      { label: tt('Spotlight…', 'بحث سريع…'), hint: 'Alt+R', onClick: () => setOverlay('run') },
    ] },
  ];
  const tray = (
    <div className="os-tray">
      <button type="button" className="os-tray__lang" title={tt('Language', 'اللغة')} onClick={toggleLocale}><b>{ar ? 'ع' : 'EN'}</b></button>
      <button type="button" className={`os-tray__sys${overlay === 'qs' ? ' is-on' : ''}`} title={tt('Control Center', 'مركز التحكم')} aria-haspopup="dialog" aria-expanded={overlay === 'qs'} onClick={() => setOverlay((o) => (o === 'qs' ? null : 'qs'))}>
        <WifiGlyph on={online} size={18} />
        {battery && <BatteryGlyph level={battery.level} charging={battery.charging} size={23} />}
      </button>
      <CloudTray tt={tt} onOpen={() => openApp('settings', { tab: 'cloud' })} />
      <button type="button" className="os-tray__srch" title={tt('Spotlight (Alt+R)', 'بحث سريع (Alt+R)')} onClick={() => setOverlay((o) => (o === 'run' ? null : 'run'))}><Icon name="search" size={17} /></button>
      <button type="button" className={`os-tray__clock${overlay === 'cal' ? ' is-on' : ''}`} title={tt('Calendar', 'التقويم')} aria-haspopup="dialog" aria-expanded={overlay === 'cal'} onClick={() => setOverlay((o) => (o === 'cal' ? null : 'cal'))}><Clock ar={ar} bar /></button>
    </div>
  );
  // Dock = pinned apps + every other open window (one icon per opened file), then the Recycle Bin
  const dockItems = taskItems.map((it, i) => {
    const w = winOf(it);
    const label = w ? winTitle(w, APPS, ar) : (ar ? APPS[it.app].ar : APPS[it.app].en);
    return {
      key: it.key, app: it.app, label, running: !!w, active: !!w && wm.active === w.id && !w.min, onClick: () => taskClick(it),
      onMiddle: () => w && dispatch({ type: 'close', id: w.id }),
      onContext: (e) => {
        e.preventDefault(); e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY - 110, items: [{ label, icon: 'eye', onClick: () => taskClick(it) }, ...(w ? [{ label: tt('Close window', 'إغلاق النافذة'), icon: 'x', hint: 'Alt+W', onClick: () => dispatch({ type: 'close', id: w.id }) }] : [])] });
      },
      i,
    };
  });

  const wmax = wm.list.some((w) => w.id === wm.active && w.max && !w.min);
  useEffect(() => {
    if (!wmax || !dockPeek) return undefined;
    const h = (e) => { if (e.clientY < window.innerHeight - 120) setDockPeek(false); };
    window.addEventListener('pointermove', h);
    return () => window.removeEventListener('pointermove', h);
  }, [wmax, dockPeek]);
  useEffect(() => { if (!wmax) setDockPeek(false); }, [wmax]);
  // The desktop owns the whole screen: hide the portal layout (sidebar / topbar / bottom bar) underneath so nothing of it shows below or around the PC.
  useEffect(() => {
    document.body.classList.add('os-active');
    return () => document.body.classList.remove('os-active');
  }, []);

  return createPortal(
    <div
      className={`os os--${theme === 'dark' ? 'dark' : 'light'}${wp.dark === false ? ' os--lightwp' : ''}${mobile ? ' os--mobile' : ''}${wmax ? ' os--wmax' : ''}${wmax && dockPeek ? ' os--dockpeek' : ''}`} dir={dir}
      style={{ '--os-accent': prefs.accent, '--cell-w': `${cell.w}px`, '--cell-h': `${cell.h}px`, '--glyph': `${cell.g}px` }}
      onPointerDownCapture={(e) => {
        if (!e.target.closest('.os-ctx')) setMenu(null);
        if (overlay === 'start' && !e.target.closest('.os-start, .os-startbtn')) setOverlay(null);
        if (overlay === 'qs' && !e.target.closest('.os-fly, .os-tray__sys')) setOverlay(null);
        if (overlay === 'cal' && !e.target.closest('.os-fly, .os-tray__clock')) setOverlay(null);
      }}
    >
      {mobile ? (
        <Suspense fallback={null}>
        <MobileShell
          ar={ar} tt={tt} user={user} desk={desk} deskItems={deskItems} wm={wm} dispatch={dispatch} bodyOf={bodyOf}
          openNode={openNode} openExplorer={openExplorer} runCommand={runCommand} flash={flash} reloadDesk={reloadDesk} hideLocal={hideLocal} refreshAll={refreshAll}
          clip={clip} copyNodes={copyNodes} pasteInto={pasteInto} trashNodes={trashNodes} renameNode={renameNode} newFolder={newFolder} newFile={newFile} newDoc={newDoc}
          battery={battery} online={online} theme={theme} toggleTheme={toggleTheme} toggleLocale={toggleLocale}
          brightness={brightness} setBrightness={(v) => setPrefs({ brightness: v })} fullscreen={fullscreen} fs={fs}
          wallpaper={wallpaperCss(prefs)} lightWp={wp.dark === false}
        />
        </Suspense>
      ) : (
      <>
      <div className="os-wall" style={{ background: wallpaperCss(prefs) }} />
      <div
        ref={deskRef} className={`os-desk${dropping ? ' is-drop' : ''}`} tabIndex={0} onKeyDown={onDeskKey}
        onPointerDown={onDeskPointerDown} onContextMenu={deskMenu}
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDropping(true); } }} onDragLeave={() => setDropping(false)} onDrop={onDrop}
      >
        {drag && Object.entries(planMove(drag.keys, layout, Math.round(drag.dx / (cell.w + GAP)) * (ar ? 1 : -1), Math.round(drag.dy / (cell.h + GAP)), rows, cols)).map(([k, p]) => (
          !drag.over && <i key={`slot:${k}`} className="os-slot" style={{ ...cellStyle(p, cell) }} />
        ))}
        {icons.map((ic) => {
          const p = layout[ic.key];
          const moving = drag?.keys.includes(ic.key);
          const cutting = clip?.mode === 'cut' && ic.node && clip.ids.includes(ic.node.id);
          return (
            <button
              key={ic.key} type="button" data-ikey={ic.key} ref={(el) => { if (el) iconEls.current[ic.key] = el; else delete iconEls.current[ic.key]; }}
              className={`os-icon${sel.has(ic.key) ? ' is-sel' : ''}${moving ? ' is-dragging' : ''}${drag?.over === ic.key ? ' is-over' : ''}${cutting ? ' is-cut' : ''}`} title={ic.label}
              style={{ ...cellStyle(p, cell), ...(moving ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : null) }}
              onPointerDown={(e) => onIconPointerDown(e, ic)}
              onClick={(e) => clickIcon(e, ic)} onDoubleClick={(e) => { e.stopPropagation(); ic.run(); }} onContextMenu={(e) => iconMenu(e, ic)}
            >
              <span className="os-icon__g">
                {ic.node ? <NodeGlyph node={ic.node} size={cell.g} /> : ic.glyph === 'explorer' ? <PcGlyph size={cell.g} /> : ic.glyph === 'bin' ? <BinGlyph size={cell.g} full={desk.binFull} /> : <Tile kind={ic.glyph} size={cell.g} />}
              </span>
              <span className="os-icon__l" dir="auto">{ic.label}</span>
            </button>
          );
        })}
        {box && <div className="os-marquee" style={box} />}
      </div>
      {desk.error && <button type="button" className="os-warn" onClick={reloadDesk}>{tt('Could not load the desktop folder — tap to retry.', 'مقدرتش أحمّل مجلد سطح المكتب — اضغط للمحاولة.')} <small dir="auto">{desk.error}</small></button>}

      <div className="os-wins">
        {wm.list.map((w) => (
          <WindowFrame key={w.id} win={w} title={winTitle(w, APPS, ar)} active={wm.active === w.id} dir={dir} tt={tt} dispatch={dispatch} unified={w.app === 'explorer'} onAssist={setAssist} icon={<AppGlyph app={w.app} size={16} />}>
            {bodyOf(w)}
          </WindowFrame>
        ))}
        <SnapAssist assist={assist} list={wm.list} titleOf={(w) => winTitle(w, APPS, ar)} iconOf={(w) => <AppGlyph app={w.app} size={20} />} tt={tt} dispatch={dispatch} setAssist={setAssist} />
      </div>

      {overlay === 'taskview' && <TaskView list={wm.list} ar={ar} tt={tt} onClose={() => setOverlay(null)} onPick={(id) => { dispatch({ type: 'focus', id }); setOverlay(null); }} onCloseWin={(id) => dispatch({ type: 'close', id })} />}
      {overlay === 'start' && (
        <StartMenu
          ar={ar} tt={tt} user={user} apps={startApps} desktopItems={deskItems} onClose={() => setOverlay(null)}
          onOpenApp={(a) => { setOverlay(null); runCommand(a.id); }} onOpenNode={(n) => { setOverlay(null); openNode(n); }}
          onFound={(n) => { setOverlay(null); if (n.type === 'folder') openExplorer({ folder: String(n.id) }); else openNode(n); }}
          onLock={() => runCommand('lock')} onPortal={() => runCommand('portal')}
        />
      )}
      {overlay === 'run' && <RunDialog ar={ar} tt={tt} onRun={runText} onClose={() => setOverlay(null)} />}

      {overlay === 'qs' && (
        <QuickSettings
          tt={tt} ar={ar} theme={theme} online={online} battery={battery} brightness={brightness} setBrightness={(v) => setPrefs({ brightness: v })} fullscreen={fs} user={user}
          onTheme={toggleTheme} onLocale={toggleLocale} onFullscreen={fullscreen} onLock={() => runCommand('lock')} onSettings={() => runCommand('settings')}
        />
      )}
      {overlay === 'cal' && <CalendarFlyout tt={tt} ar={ar} />}

      <MenuBar ar={ar} tt={tt} menus={menus} tray={tray} />
      {wmax && !dockPeek && <div className="os-dockhot" onPointerEnter={() => setDockPeek(true)} aria-hidden="true" />}
      <Dock
        items={dockItems} tt={tt} mag={prefs.dockMag !== false} launchOn={overlay === 'start'} onLaunch={() => setOverlay((o) => (o === 'start' ? null : 'start'))}
        onBin={() => runCommand('bin')} binFull={desk.binFull} binLabel={tt('Recycle Bin', 'سلة المحذوفات')}
      />

      </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {dlg && dlg.kind !== 'newfile' && <OsDialog key={dlg.title} dlg={dlg} tt={tt} onDone={finishDlg} />}
      {dlg?.kind === 'newfile' && desk.id && (
        <Suspense fallback={null}><NewFileDialog
          locale={locale} parentId={desk.id} initialType={dlg.type} onClose={() => setDlg(null)}
          onCreated={(node) => { pendingOpen.current = node.id; flash(tt('File created on the desktop.', 'تم إنشاء الملف على سطح المكتب.')); reloadDesk(); }}
        /></Suspense>
      )}
      {toast && <div className={`os-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">{toast.msg}</div>}
      {locked && <LockScreen ar={ar} tt={tt} user={user} lockEnabled={lockEnabled} hideDetails={sec.hideLockDetails} onUnlock={() => setLocked(false)} onPortal={() => runCommand('portal')} />}
      {idleLeft !== null && !asleep && <IdleWarning tt={tt} left={idleLeft} onStay={stay} onSignOut={logout} />}
      {asleep && <SleepScreen ar={ar} tt={tt} dim={sec.sleepDimOnly} onWake={onWake} />}
      {brightness < 100 && <div className="os-dim" style={{ opacity: ((100 - brightness) / 100) * 0.7 }} aria-hidden="true" />}
      <div className={`os-boot${booting ? '' : ' is-done'}`} aria-hidden="true">
        <span className="os-boot__logo"><UipMark size={64} /></span>
        <span className="os-boot__name"><b>UIP</b><em>NUB</em></span>
        <span className="os-boot__tag">{tt('Your workspace is getting ready', 'مساحة عملك بتتجهّز')}</span>
        <span className="os-boot__bar"><i /></span>
      </div>
    </div>,
    document.body,
  );
}
