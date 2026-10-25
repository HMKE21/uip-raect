import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { myPcPath } from '../config/myPc';
import { useIsMobileOS } from '../desktop/useIsMobileOS';
import { belongsInDesktop } from './catalog';

/**
 * Virtual mode ("UIP OS"): the student chooses to work on the WHOLE platform from inside the My PC desktop — every portal page
 * (courses, exams, grades, messages…) opens as a window of that desktop.
 *
 * The choice lives on the server (GET/PUT /api/v1/desktop/virtual-mode → desktop_settings.virtual_mode) so it follows the student
 * to every device; localStorage is only the instant cache, so the first paint after a reload already goes to the right place.
 *
 *   available  the role may use it AND the feature + My PC are open for the account
 *   enabled    the student's choice — never true while it is not available (nobody gets pushed into a closed desktop)
 *
 * Phones keep the normal portal (it already has a purpose-built phone UI): the redirect below is skipped there.
 */
export const VIRTUAL_ROLES = ['student'];
const ENDPOINT = '/api/v1/desktop/virtual-mode';
const unwrap = (r) => (r && r.data !== undefined ? r.data : r);
const cacheKey = (uid) => `uip_virtual_mode_v1_${uid ?? 'anon'}`;

export const readVirtualCache = (uid) => { try { const v = localStorage.getItem(cacheKey(uid)); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } };
const writeVirtualCache = (uid, on) => { try { localStorage.setItem(cacheKey(uid), on ? '1' : '0'); } catch { /* private mode */ } };

export const virtualApi = {
  get: async () => unwrap(await api.get(ENDPOINT)),
  set: async (enabled) => unwrap(await api.put(ENDPOINT, { enabled: !!enabled })),
};

// A portal URL that was redirected into the desktop (a notification link, a bookmark, "Back" after an exam…): the desktop opens it as a window once.
let pendingOpen = null;
export const requestVirtualOpen = (path) => { pendingOpen = path || null; };
export const takeVirtualOpen = () => { const p = pendingOpen; pendingOpen = null; return p; };

const Ctx = createContext({ supported: false, ready: true, available: false, enabled: false, busy: false, setEnabled: async () => false, refresh: async () => {} });

export function VirtualModeProvider({ children }) {
  const { user } = useAuth();
  const { search } = useLocation();
  const uid = user?.id;
  const supported = !!user && VIRTUAL_ROLES.includes(user.role);
  const [st, setSt] = useState({ uid: null, available: false, enabled: false });
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const uidRef = useRef(uid); uidRef.current = uid;

  const apply = useCallback((d) => {
    const enabled = !!(d?.available && d?.enabled);
    writeVirtualCache(uidRef.current, enabled);
    if (alive.current) setSt({ uid: uidRef.current, available: !!d?.available, enabled });
  }, []);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try { apply(await virtualApi.get()); } catch { /* offline / server hiccup: keep what the cache says — a network error never locks anybody in or out */ }
  }, [supported, apply]);

  useEffect(() => { refresh(); }, [refresh, uid]);
  // another device changed the choice → follow it when this tab comes back to the front
  useEffect(() => {
    if (!supported) return undefined;
    const h = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [supported, refresh]);

  const setEnabled = useCallback(async (on) => {
    setBusy(true);
    try { apply(await virtualApi.set(on)); return true; } finally { if (alive.current) setBusy(false); }
  }, [apply]);

  // support escape hatch: any URL with ?vm=off drops the mode (a student stuck in a broken desktop can always get out)
  const handled = useRef(false);
  useEffect(() => {
    if (!supported || handled.current) return;
    if (new URLSearchParams(search).get('vm') === 'off') { handled.current = true; setEnabled(false).catch(() => {}); }
  }, [supported, search, setEnabled]);

  const fresh = st.uid === uid && uid != null; // the answer belongs to THIS account (not the one who signed out before)
  const cached = useMemo(() => (supported ? readVirtualCache(uid) : null), [supported, uid, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const enabled = supported && (fresh ? st.enabled : cached === true);
  const value = useMemo(() => ({ supported, ready: fresh || !supported, available: supported && fresh && st.available, enabled, busy, setEnabled, refresh }), [supported, fresh, st.available, enabled, busy, setEnabled, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVirtualMode() {
  return useContext(Ctx);
}

/**
 * Mounted by DashboardLayout: while the mode is on, a student's portal page (a bookmark, a notification link, a redirect after login,
 * "back to exams" after an exam…) is shown as a window of the desktop instead. Exams, meeting rooms and print pages stay full pages.
 */
export function VirtualGuard({ children }) {
  const vm = useVirtualMode();
  const mobile = useIsMobileOS();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const go = vm.enabled && !mobile && belongsInDesktop(pathname) && !/^\/student\/my-pc(\/|$)/.test(pathname);
  if (go) requestVirtualOpen(`${pathname}${search}`); // idempotent: the desktop picks it up once it mounts
  if (go) return <Navigate to={myPcPath(user?.role)} replace />;
  return children;
}
