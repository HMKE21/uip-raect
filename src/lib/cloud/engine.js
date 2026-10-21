import { useSyncExternalStore } from 'react';
import { isNative } from '../../native';
import { drive, driveConfig, fetchDriveBlob } from '../driveApi';
import { DRIVE_SAVED } from '../driveEvents';
import { CloudAuthError, CloudQuotaError, CloudRetryError } from './errors';
import { google } from './google';
import { microsoft } from './microsoft';

/**
 * Cloud backup engine (Google Drive / OneDrive). One provider per student per device.
 *
 *  - "My PC" on the UIP server stays the FINAL copy (sharing, exams, the sandbox and the AI all read it).
 *  - This engine keeps a BACKUP copy on the student's own cloud drive, in a folder "UIP My PC", with the same folder tree.
 *  - It runs in the browser (tokens never reach the server; they live in sessionStorage) and is incremental: a file is uploaded
 *    again only when its signature (name / folder / sha1 / size / updated_at) changed. Deleted files are NOT removed from the
 *    cloud (a backup keeps them).
 *  - Triggers: a save in My PC (debounced), every 10 minutes while the tab is visible, coming back online, "Back up now".
 */
const PROVIDERS = { google, microsoft };
const SKIP_NAMES = new Set(['.uip-account.json']); // the settings-sync file is not student work
const EVERY_MS = 10 * 60 * 1000;
const PARALLEL = 2;

const dbKey = (uid) => `uip_cloud_v1:${uid}`;
const tokKey = (uid) => `uip_cloud_tok:${uid}`;
const readJson = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
const writeJson = (store, key, v) => { try { if (v == null) store.removeItem(key); else store.setItem(key, JSON.stringify(v)); } catch { /* storage full / blocked */ } };

const S = {
  uid: null, cfg: null, ready: false,
  provider: '', auto: true, account: '', server: false, lastOk: 0, lastError: '', retried: false, forceTok: false,
  status: 'idle', progress: { done: 0, total: 0 },
  db: { rootId: null, folders: {}, files: {} }, // persisted remote ids + per-file signatures
};
let snap = null;
const subs = new Set();
const emit = () => { snap = null; subs.forEach((f) => f()); };
const persist = () => writeJson(localStorage, dbKey(S.uid), { provider: S.provider, auto: S.auto, account: S.account, server: S.server, lastOk: S.lastOk, db: S.db });
const snapshot = () => {
  if (!snap) snap = { ready: S.ready, provider: S.provider, auto: S.auto, account: S.account, lastOk: S.lastOk, lastError: S.lastError, status: S.status, progress: S.progress, cfg: S.cfg };
  return snap;
};

let timer = 0; let again = false; let running = false; let inited = false;

function setStatus(status, extra) { S.status = status; Object.assign(S, extra || {}); emit(); }

async function getToken() {
  const P = PROVIDERS[S.provider];
  const sess = readJson(sessionStorage, tokKey(S.uid));
  if (!S.forceTok && sess?.tok && sess.tok.expiresAt > Date.now()) return sess.tok;
  const force = S.forceTok; S.forceTok = false;
  const r = await P.refresh(S.cfg[S.provider], S.provider === 'google' ? S.account : sess?.refreshToken, { server: S.server, force });
  const tok = r.tok || r;
  writeJson(sessionStorage, tokKey(S.uid), { tok, refreshToken: r.refreshToken || sess?.refreshToken || null });
  return tok;
}

async function run({ manual = false } = {}) {
  if (!S.uid || !S.provider || (!S.auto && !manual)) return;
  if (running) { again = true; return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return; }
  running = true; again = false;
  const P = PROVIDERS[S.provider];
  let fatal = null; let done = 0; let failed = 0; let firstErr = '';
  try {
    setStatus('running', { progress: { done: 0, total: 0 }, lastError: '' });
    const tok = await getToken();
    const items = (await drive.manifest()).items || [];
    const byId = new Map(items.map((n) => [n.id, n]));
    const sigOf = (n) => `${n.name}|${n.parent_id ?? ''}|${n.sha1 || ''}|${n.size_bytes}|${n.updated_at || ''}`;
    const todo = items.filter((n) => n.type === 'file' && !SKIP_NAMES.has(n.name) && S.db.files[n.id]?.sig !== sigOf(n));
    S.progress = { done: 0, total: todo.length }; emit();

    const rootRemote = todo.length ? await P.ensureRoot(tok, S.db) : null;
    const remoteFolder = async (parentId) => {
      if (parentId == null) return rootRemote;
      const chain = [];
      for (let cur = byId.get(parentId); cur; cur = cur.parent_id != null ? byId.get(cur.parent_id) : null) chain.unshift(cur);
      let at = rootRemote;
      for (const f of chain) { at = await P.ensureFolder(tok, S.db, f.id, f.name, at); } // eslint-disable-line no-await-in-loop
      return at;
    };

    let next = 0;
    const worker = async () => {
      while (next < todo.length && !fatal) {
        const n = todo[next]; next += 1;
        try {
          const blob = await fetchDriveBlob(n.id);
          const parentRemote = await remoteFolder(n.parent_id);
          const prev = S.db.files[n.id];
          const sameFolder = prev && prev.parent === parentRemote;
          const remoteId = await P.put(tok, { remoteId: sameFolder ? prev.remoteId : null, name: n.name, parentRemoteId: parentRemote, blob });
          S.db.files[n.id] = { sig: sigOf(n), remoteId, parent: parentRemote };
          done += 1;
        } catch (e) {
          if (e instanceof CloudAuthError || e instanceof CloudQuotaError) { fatal = e; } else {
            failed += 1;
            if (!firstErr) firstErr = e?.message || '';
            if (e?.status === 404) { S.db.rootId = null; S.db.folders = {}; } // the cloud folder was deleted: rebuild it next time
          }
        }
        S.progress = { done: done + failed, total: todo.length }; emit();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    persist();
    if (fatal) throw fatal;
    if (failed) setStatus('error', { lastError: firstErr || 'Some files could not be copied. They will be tried again.' });
    else { S.lastOk = Date.now(); S.retried = false; persist(); setStatus('idle', { lastError: '' }); }
  } catch (e) {
    if (e instanceof CloudAuthError && e.code === 'expired' && S.server && !S.retried) {
      S.retried = true; S.forceTok = true; again = true; // Google refused our cached token: ask the server for a brand-new one and go again
      writeJson(sessionStorage, tokKey(S.uid), null);
    } else if (e instanceof CloudAuthError) { S.retried = false; setStatus('needs-auth', { lastError: e.message }); }
    else if (e instanceof CloudQuotaError) setStatus('error', { lastError: e.message });
    else if (e instanceof CloudRetryError && e.status === 0) setStatus('offline');
    else setStatus('error', { lastError: e?.message || 'Backup failed.' });
  } finally {
    running = false;
    if (again) schedule(2000);
  }
}

function schedule(ms = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => run(), ms);
}

function installListeners() {
  if (inited) return;
  inited = true;
  window.addEventListener(DRIVE_SAVED, (e) => { if (!e.detail?.silent) schedule(4000); });
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - S.lastOk > EVERY_MS) schedule(1500); });
  setInterval(() => { if (document.visibilityState === 'visible') run(); }, EVERY_MS);
}

export const cloud = {
  providers: PROVIDERS,

  /** Call once per signed-in student. Loads the server config + this student's saved link. */
  async init(uid) {
    if (!uid) return;
    if (S.uid === uid && S.ready) return;
    S.uid = uid; S.ready = false; emit();
    const saved = readJson(localStorage, dbKey(uid));
    if (saved) { S.provider = saved.provider || ''; S.auto = saved.auto !== false; S.account = saved.account || ''; S.server = !!saved.server; S.lastOk = saved.lastOk || 0; S.db = saved.db || S.db; }
    const cfg = await driveConfig();
    S.cfg = cfg?.cloud || {};
    S.ready = true;
    if (S.provider && !PROVIDERS[S.provider]) { S.provider = ''; }
    installListeners();
    if (S.provider) { S.status = readJson(sessionStorage, tokKey(uid)) ? 'idle' : 'idle'; schedule(3500); }
    emit();
  },
  stop() { clearTimeout(timer); S.uid = null; S.ready = false; S.provider = ''; S.status = 'idle'; emit(); },

  available(id) { return !isNative && !!PROVIDERS[id] && PROVIDERS[id].enabled(S.cfg?.[id]); }, // the Android app can't open the OAuth pop-ups yet

  /** From a click. */
  async connect(id) {
    const P = PROVIDERS[id];
    if (!P || !this.available(id)) throw new Error('This cloud is not set up on the server yet.');
    const r = await P.connect(S.cfg[id], id === 'google' ? S.account : undefined);
    const changed = S.provider !== id;
    S.provider = id; S.server = !!r.server; S.retried = false; S.forceTok = false; S.auto = true; S.account = r.account || ''; S.lastError = '';
    if (changed) S.db = { rootId: null, folders: {}, files: {} };
    writeJson(sessionStorage, tokKey(S.uid), { tok: r.tok, refreshToken: r.refreshToken || null });
    persist(); setStatus('idle');
    schedule(300);
  },
  disconnect() {
    if (S.provider === 'google' && S.server) PROVIDERS.google.disconnectServer();
    S.server = false; S.provider = ''; S.account = ''; S.lastError = ''; S.db = { rootId: null, folders: {}, files: {} }; S.status = 'idle';
    writeJson(sessionStorage, tokKey(S.uid), null); persist(); emit();
  },
  setAuto(on) { S.auto = !!on; persist(); emit(); if (on) schedule(500); },
  runNow() { clearTimeout(timer); return run({ manual: true }); },
};

export function useCloud() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, snapshot, snapshot);
}
