import { api, errorMessage } from '../api/client';

/**
 * Desktop ("My PC") settings + lock-screen password — thin wrappers over /api/v1/desktop/*
 * (App\Http\Controllers\Api\DesktopSettingsApiController). Everything lives on the server, so it follows the
 * student to every device (phone, laptop…).
 */
const B = '/api/v1/desktop';
const unwrap = (r) => (r && r.data !== undefined ? r.data : r);

export const desktopApi = {
  settings: async () => unwrap(await api.get(`${B}/settings`)),
  saveSettings: async (body) => unwrap(await api.put(`${B}/settings`, body)),
  wallpaper: async () => unwrap(await api.get(`${B}/wallpaper`)),
  saveWallpaper: async (dataUrl) => unwrap(await api.put(`${B}/wallpaper`, { dataUrl })),
  lockSet: async (body) => unwrap(await api.post(`${B}/lock/set`, body)),
  lockVerify: async (password) => unwrap(await api.post(`${B}/lock/verify`, { password })),
  lockDisable: async (password) => unwrap(await api.post(`${B}/lock/disable`, { password })),
  lockOtp: async () => unwrap(await api.post(`${B}/lock/otp`, {})),
  lockReset: async (code, password) => unwrap(await api.post(`${B}/lock/reset`, { code, password })),
};

/** The server's own (already localized) message — the generic field-error join of errorMessage() would print codes like "invalid". */
export const lockError = (e) => (e && e.message && e.status ? e.message : errorMessage(e));

const lockKey = (uid) => `uip_desktop_lock_v1_${uid ?? 'anon'}`;
/** Last known "is a lock password set?" (so a reload while locked does not flash the wrong screen). */
export function readLockCache(uid) { try { const v = localStorage.getItem(lockKey(uid)); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } }
export function writeLockCache(uid, on) { try { localStorage.setItem(lockKey(uid), on ? '1' : '0'); } catch { /* private mode */ } }

const lockedKey = (uid) => `uip_desktop_locked_v1_${uid ?? 'anon'}`;
/** The screen stays locked across a page reload (per tab session) when a lock password is set. */
const unlockedKey = (uid) => `uip_desktop_unlocked_v1_${uid ?? 'anon'}`;
/** True once the lock password was entered (or none was needed) in THIS browser tab session: a new device/tab starts locked. */
export function readUnlockedFlag(uid) { try { return sessionStorage.getItem(unlockedKey(uid)) === '1'; } catch { return false; } }
export function writeUnlockedFlag(uid, on) { try { if (on) sessionStorage.setItem(unlockedKey(uid), '1'); else sessionStorage.removeItem(unlockedKey(uid)); } catch { /* private mode */ } }
export function readLockedFlag(uid) { try { return sessionStorage.getItem(lockedKey(uid)) === '1'; } catch { return false; } }
export function writeLockedFlag(uid, on) { try { if (on) sessionStorage.setItem(lockedKey(uid), '1'); else sessionStorage.removeItem(lockedKey(uid)); } catch { /* private mode */ } }
