const prefsKey = (uid) => `uip_desktop_prefs_v1_${uid ?? 'anon'}`; // per account: another student on the same browser never inherits it
export const DEFAULT_PREFS = { wallpaper: 'sequoia', customWallpaper: null, accent: '#0a84ff', iconSize: 'm', dockMag: true, openMax: true, brightness: 100, hiddenIcons: [], hiddenDock: [] };
/** macOS accent palette (blue, purple, pink, red, orange, yellow, green, graphite) + the old UIP indigo. */
export const ACCENTS = ['#0a84ff', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#8e8e93', '#6366f1'];

/** Someone who never changed the old defaults (Aurora + indigo) gets the new macOS look; any real choice is kept. */
export function migratePrefs(p) {
  if (p && p.wallpaper === 'aurora' && (!p.accent || p.accent === '#6366f1') && !p.customWallpaper) return { ...p, wallpaper: DEFAULT_PREFS.wallpaper, accent: DEFAULT_PREFS.accent };
  return p;
}
/** Icons the person can remove from the desktop / the Dock and bring back from Settings ▸ Personalization ▸ Icons. */
export const DESK_ICONS = [
  ['sys:explorer', 'This PC', 'جهازي', 'explorer'], ['sys:bin', 'Recycle Bin', 'سلة المحذوفات', 'bin'], ['sys:portal', 'UIP Portal', 'بوابة UIP', 'portal'],
  ['sys:settings', 'Settings', 'الإعدادات', 'settings'], ['sys:shortcuts', 'Shortcuts', 'الاختصارات', 'shortcuts'],
];
export const DOCK_ICONS = [
  ['launchpad', 'Launchpad', 'لوحة التطبيقات', 'launchpad'], ['explorer', 'This PC', 'جهازي', 'explorer'], ['settings', 'Settings', 'الإعدادات', 'settings'],
  ['shortcuts', 'Keyboard shortcuts', 'اختصارات الكيبورد', 'shortcuts'], ['lock', 'Lock screen', 'قفل الشاشة', 'lock'], ['portal', 'UIP Portal', 'بوابة UIP', 'portal'], ['bin', 'Recycle Bin', 'سلة المحذوفات', 'bin'],
];
export const NO_ICONS = []; // one shared empty list, so memo dependencies do not change on every render
export const hiddenList = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : NO_ICONS); // same array back (stable identity for useMemo)

export function loadPrefs(uid) {
  try { return migratePrefs({ ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(prefsKey(uid)) || '{}') || {}) }); } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p, uid) {
  try { localStorage.setItem(prefsKey(uid), JSON.stringify(p)); return true; } catch { return false; }
}

/** Where each desktop icon sits: { [iconKey]: { c: column, r: row } } — per user, in grid cells (not pixels). */
export const iconPosKey = (uid) => `uip_desktop_icons_v1_${uid ?? 'anon'}`;
export function loadIconPos(key) {
  try {
    const o = JSON.parse(localStorage.getItem(key) || '{}') || {};
    const out = {};
    Object.keys(o).forEach((k) => { const p = o[k]; if (p && Number.isInteger(p.c) && Number.isInteger(p.r) && p.c >= 0 && p.r >= 0) out[k] = { c: p.c, r: p.r }; });
    return out;
  } catch { return {}; }
}
export function saveIconPos(key, map) {
  try { localStorage.setItem(key, JSON.stringify(map)); return true; } catch { return false; }
}
