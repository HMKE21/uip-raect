import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Personal chat backgrounds (the person's own photos) — shared by the people-to-people messenger and the AI assistant.
 *
 * Photos are kept in IndexedDB (a localStorage entry would hit the 5 MB limit after one picture), shrunk to at most 1920 px /
 * JPEG on the way in. They stay in the library until the person deletes them: choosing a built-in theme later does NOT remove
 * them. The selected background is stored by the callers as `img:<id>`.
 *
 * The library lives in this browser. If a saved `img:<id>` does not exist (another device, cleared site data) callers fall back
 * to their normal default background.
 */
const DB = 'uip_custom_wallpapers';
const STORE = 'images';
export const MAX_CUSTOM_WALLPAPERS = 12;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1920;

export const isCustomWall = (v) => typeof v === 'string' && v.startsWith('img:');
export const customWallId = (v) => (isCustomWall(v) ? v.slice(4) : null);

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, mode);
  const out = fn(tx.objectStore(STORE));
  tx.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
  tx.onerror = () => { db.close(); reject(tx.error); };
  tx.onabort = () => { db.close(); reject(tx.error); };
}));

async function listAll() {
  const rows = await run('readonly', (s) => s.getAll());
  return (rows || []).sort((a, b) => a.createdAt - b.createdAt);
}

/** Decode, shrink to MAX_SIDE and re-encode as JPEG (a 12 MP phone photo becomes a few hundred KB). */
async function shrink(file) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.size > MAX_INPUT_BYTES) throw new Error('too_big');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('decode')); i.src = url; });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('encode');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * const wp = useCustomWallpapers();
 * wp.items            [{ id, url }]   the library (object URLs, revoked automatically)
 * wp.urlFor('img:ab') -> url | null    for the currently selected background
 * wp.add(file)        -> id            throws Error('not_image' | 'too_big' | 'limit' | 'storage')
 * wp.remove(id)
 * wp.ready            false until the library was read once (so a saved selection isn't judged "missing" too early)
 */
export function useCustomWallpapers() {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const urls = useRef(new Map());

  const apply = useCallback((rows) => {
    const next = new Map();
    const list = rows.map((r) => {
      const url = urls.current.get(r.id) || URL.createObjectURL(r.blob);
      next.set(r.id, url);
      return { id: r.id, url };
    });
    urls.current.forEach((u, id) => { if (!next.has(id)) URL.revokeObjectURL(u); });
    urls.current = next;
    setItems(list);
  }, []);

  useEffect(() => {
    let alive = true;
    listAll().then((rows) => { if (alive) apply(rows); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [apply]);

  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current = new Map(); }, []);

  const add = useCallback(async (file) => {
    const rows = await listAll().catch(() => []);
    if (rows.length >= MAX_CUSTOM_WALLPAPERS) throw new Error('limit');
    const blob = await shrink(file);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try { await run('readwrite', (s) => s.put({ id, blob, createdAt: Date.now() })); } catch { throw new Error('storage'); }
    apply(await listAll());
    return id;
  }, [apply]);

  const remove = useCallback(async (id) => {
    try { await run('readwrite', (s) => s.delete(id)); } catch { /* nothing to delete */ }
    apply(await listAll().catch(() => []));
  }, [apply]);

  const urlFor = useCallback((value) => {
    const id = customWallId(value);
    return id ? (items.find((i) => i.id === id)?.url || null) : null;
  }, [items]);

  return { items, ready, add, remove, urlFor };
}
