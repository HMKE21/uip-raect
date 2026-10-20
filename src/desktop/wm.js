/** Window manager state: a plain reducer so every shortcut / button / Dock action goes through one place. */
/** Screen furniture: the menu bar on top and the floating Dock at the bottom. Windows live in between. */
export const MENUBAR_H = 28;
export const dockH = () => (typeof window !== 'undefined' && window.innerWidth < 560 ? 70 : 84);
export const chromeH = () => MENUBAR_H + dockH();
export const MIN_W = 380;
export const MIN_H = 260;
/** The title a window shows: its own (a file name) or the app's. */
export const winTitle = (w, apps, ar) => (w.title && w.title !== w.app ? w.title : (ar ? apps[w.app].ar : apps[w.app].en));

export const initialWm = { list: [], z: 10, active: null, seq: 1, peek: null };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const topVisible = (list, except) => [...list].filter((w) => !w.min && w.id !== except).sort((a, b) => b.z - a.z)[0]?.id ?? null;

function focus(s, id, patch) {
  if (!s.list.some((w) => w.id === id)) return s;
  const z = s.z + 1;
  return { ...s, z, active: id, peek: null, list: s.list.map((w) => (w.id === id ? { ...w, ...patch, min: false, z } : w)) };
}

export function wmReducer(s, a) {
  switch (a.type) {
    case 'open': {
      const ex = a.key ? s.list.find((w) => w.key === a.key) : a.singleton ? s.list.find((w) => w.app === a.app) : null;
      if (ex) return focus(s, ex.id, a.props ? { props: { ...ex.props, ...a.props } } : undefined);
      const { aw, ah } = a.area;
      const size = a.size || { w: 920, h: 600 };
      const w = Math.min(size.w, aw - 16);
      const h = Math.min(size.h, ah - 16);
      const step = (s.seq % 7) * 30;
      const x = clamp(Math.round((aw - w) / 2) + step - 90, 8, Math.max(8, aw - w - 8));
      const y = clamp(Math.round((ah - h) / 3) + step - 60, 8, Math.max(8, ah - h - 8));
      const id = `w${s.seq}`;
      const z = s.z + 1;
      const win = { id, app: a.app, key: a.key || null, title: a.title || a.app, x, y, w, h, max: !!a.maximized, snap: null, min: false, z, props: a.props || {}, since: Date.now() };
      return { ...s, seq: s.seq + 1, z, active: id, peek: null, list: [...s.list, win] };
    }
    case 'focus': return focus(s, a.id);
    case 'close': {
      const list = s.list.filter((w) => w.id !== a.id);
      return { ...s, list, active: s.active === a.id ? topVisible(list) : s.active };
    }
    case 'minimize': {
      const list = s.list.map((w) => (w.id === a.id ? { ...w, min: true } : w));
      return { ...s, list, active: s.active === a.id ? topVisible(list, a.id) : s.active };
    }
    case 'toggleMax': return { ...s, list: s.list.map((w) => (w.id === a.id ? { ...w, max: !w.max, snap: null } : w)) };
    case 'snap': return { ...s, list: s.list.map((w) => (w.id === a.id ? { ...w, snap: a.side === 'max' ? null : a.side, max: a.side === 'max' } : w)) };
    case 'rect': return { ...s, list: s.list.map((w) => (w.id === a.id ? { ...w, ...a.rect, max: false, snap: null } : w)) };
    case 'patch': return { ...s, list: s.list.map((w) => (w.id === a.id ? { ...w, ...a.patch } : w)) };
    case 'showDesktop': {
      const visible = s.list.filter((w) => !w.min).map((w) => w.id);
      if (visible.length) return { ...s, peek: visible, active: null, list: s.list.map((w) => ({ ...w, min: true })) };
      if (s.peek?.length) {
        const keep = new Set(s.peek);
        const list = s.list.map((w) => (keep.has(w.id) ? { ...w, min: false } : w));
        return { ...s, peek: null, list, active: topVisible(list) };
      }
      return s;
    }
    case 'restoreAll': {
      const list = s.list.map((w) => ({ ...w, min: false }));
      return { ...s, list, peek: null, active: s.active || topVisible(list) };
    }
    case 'cycle': {
      if (!s.list.length) return s;
      const i = s.list.findIndex((w) => w.id === s.active);
      const next = s.list[(i + a.dir + s.list.length) % s.list.length];
      return focus(s, next.id);
    }
    default: return s;
  }
}
