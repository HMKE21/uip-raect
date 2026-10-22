import { api } from '../api/client';
import { getDraft, pruneCache, putDraft } from './draftStore';
import { emitDriveSaved } from './driveEvents';

/**
 * "My PC" (جهازي) client — thin wrappers over /api/v1/drive/* (App\Http\Controllers\Api\DriveApiController).
 * Every file is private: bytes come through authenticated requests (api.blob = Bearer + refresh-on-401), never a public URL.
 */
const B = '/api/v1/drive';


const unwrap = (r) => (r && r.data !== undefined ? r.data : r);

/**
 * Server switch (GET /drive/config). When My PC lives on S3 / Cloudflare R2 the browser uploads and downloads STRAIGHT to the bucket
 * through short-lived signed URLs and Laravel only stores metadata (docs/DRIVE_CLOUD_STORAGE.md). Any network / CORS failure on the
 * bucket side falls back to the classic proxied path, so saving is never blocked by the direct route.
 */
let cfgP = null;
export function driveConfig(force = false) {
  if (!cfgP || force) {
    cfgP = api.get(`${B}/config`).then(unwrap).catch(() => {
      setTimeout(() => { cfgP = null; }, 60 * 1000); // ask again in a minute
      return { direct_upload: false, max_file_mb: 100, cloud: {} };
    });
  }
  return cfgP;
}
const directOn = async () => !!(await driveConfig()).direct_upload;

/** Errors that mean "the direct route is unusable here" (not "your save is wrong"): use the classic path instead. */
const canFallBack = (e) => !e?.status || e.status === 0 || e.status === 404 || e.status === 405 || e.status >= 500 || e?.direct === true;

async function sha1Hex(blob) {
  try {
    if (!globalThis.crypto?.subtle || blob.size > 64 * 1024 * 1024) return null;
    const d = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/** PUT the bytes to a signed URL with progress. Rejects with { direct: true } on any bucket-side problem. */
function putToBucket(put, blob, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', put.url);
    Object.entries(put.headers || {}).forEach(([k, v]) => { try { x.setRequestHeader(k, Array.isArray(v) ? v[0] : v); } catch { /* forbidden header */ } });
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(Object.assign(new Error(`Storage answered ${x.status}.`), { direct: true, status: x.status })));
    x.onerror = () => reject(Object.assign(new Error('Could not reach the storage.'), { direct: true }));
    x.onabort = () => reject(Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' }));
    if (signal) { if (signal.aborted) { x.abort(); return; } signal.addEventListener('abort', () => x.abort(), { once: true }); }
    x.send(blob);
  });
}

async function directUpload(parentId, file, rel, onProgress, signal) {
  const init = unwrap(await api.post(`${B}/upload/init`, {
    parent_id: parentId || null, name: file.name, size: file.size, mime: file.type || null, path: rel && rel.includes('/') ? rel : null,
  }));
  await putToBucket(init.put, file, onProgress, signal);
  const node = unwrap(await api.post(`${B}/upload/complete`, { token: init.token }));
  onProgress?.(100);
  return { success: true, data: { items: [node], failed: [] } };
}

async function directReplace(id, blob, name) {
  const init = unwrap(await api.post(`${B}/nodes/${id}/replace/init`, { size: blob.size, mime: blob.type || null }));
  await putToBucket(init.put, blob);
  const node = unwrap(await api.post(`${B}/nodes/${id}/replace/complete`, { token: init.token, name: name || null, sha1: await sha1Hex(blob) }));
  return { success: true, data: node };
}

export const drive = {
  list: (parentId) => api.get(B, parentId ? { parent_id: parentId } : undefined),
  tree: () => api.get(`${B}/tree`),
  search: (q) => api.get(`${B}/search`, { q }),
  /** Search inside the text of files: { items: [{ …node, path, matches: [{ line, text, start, len }], match_count }], pending } */
  searchContent: (q) => api.get(`${B}/search-content`, { q }),
  usage: () => api.get(`${B}/usage`),
  trashList: () => api.get(`${B}/trash`),
  createFolder: (parentId, name) => api.post(`${B}/folders`, { parent_id: parentId || null, name }),
  /** mkdir -p "a/b/c" under parentId */
  ensurePath: (parentId, path) => api.post(`${B}/folders`, { parent_id: parentId || null, path }),
  createFile: (parentId, name, content = '') => api.post(`${B}/files`, { parent_id: parentId || null, name, content }),
  createProject: (parentId, name, template) => api.post(`${B}/projects`, { parent_id: parentId || null, name, template }),
  rename: (id, name) => api.patch(`${B}/nodes/${id}`, { name }),
  move: (ids, targetId) => api.post(`${B}/move`, { ids, target_id: targetId || null }),
  copy: (ids, targetId) => api.post(`${B}/copy`, { ids, target_id: targetId || null }),
  zip: (ids, parentId, name) => api.post(`${B}/zip`, { ids, parent_id: parentId || null, name }),
  unzip: (id, parentId) => api.post(`${B}/nodes/${id}/unzip`, { parent_id: parentId || null }),
  trash: (ids) => api.post(`${B}/trash`, { ids }),
  restore: (ids) => api.post(`${B}/restore`, { ids }),
  purge: (ids) => api.post(`${B}/purge`, { ids }),
  emptyTrash: () => api.del(`${B}/trash`),
  /** Save a file's new bytes (image / PDF / ZIP editors, or a text file from the code editor). opts.silent = no "Saved" toast / backup trigger. */
  replace: async (id, blob, name, opts) => {
    let res = null;
    if (await directOn()) {
      try { res = await directReplace(id, blob, name); } catch (e) { if (!canFallBack(e)) throw e; }
    }
    if (!res) {
      const fd = new FormData();
      fd.append('file', new File([blob], name || 'file', { type: blob.type || 'application/octet-stream' }));
      if (name) fd.append('name', name);
      res = await api.postForm(`${B}/nodes/${id}/replace`, fd);
    }
    if (!opts?.silent) emitDriveSaved({ id, name: unwrap(res)?.name || name || '', kind: 'replace', size: blob.size });
    return res;
  },
  /** Save the code editor's ZIP back into its folder (changed → replaced, new → added, removed → recycle bin). */
  sync: (id, blob) => {
    const fd = new FormData();
    fd.append('file', new File([blob], 'folder.zip', { type: 'application/zip' }));
    return api.postForm(`${B}/nodes/${id}/sync`, fd).then((r) => { emitDriveSaved({ id, name: '', kind: 'sync', size: blob.size }); return r; });
  },
  /** One file per request (clear progress, parallel-safe). rel = "dir/sub/file.txt" when uploading a folder. */
  upload: async (parentId, file, rel, onProgress, signal) => {
    let res = null;
    if (await directOn()) {
      try { res = await directUpload(parentId, file, rel, onProgress, signal); } catch (e) { if (e?.name === 'AbortError' || !canFallBack(e)) throw e; }
    }
    if (!res) {
      const fd = new FormData();
      if (parentId) fd.append('parent_id', String(parentId));
      fd.append('files[]', file, file.name);
      if (rel && rel.includes('/')) fd.append('paths[]', rel);
      res = await api.postFormProgress(`${B}/upload`, fd, onProgress, signal);
    }
    emitDriveSaved({ id: unwrap(res)?.items?.[0]?.id, name: file.name, kind: 'upload', size: file.size });
    return res;
  },
  /** Share links (GET/POST /drive/nodes/{id}/shares, PATCH/DELETE /drive/shares/{id}). expiry: '1d' | '7d' | '30d' | 'never'. */
  shares: (id) => api.get(`${B}/nodes/${id}/shares`).then(unwrap),
  mySharedLinks: () => api.get(`${B}/shares`).then(unwrap),
  createShare: (id, { expiry, canDownload }) => api.post(`${B}/nodes/${id}/shares`, { expiry, can_download: !!canDownload }).then(unwrap),
  updateShare: (shareId, patch) => api.patch(`${B}/shares/${shareId}`, patch).then(unwrap),
  revokeShare: (shareId) => api.del(`${B}/shares/${shareId}`),
  /** Version history of a file: the old copies kept before every save (newest first) — GET /nodes/{id}/versions → { node, items, limit }. */
  versions: (id) => api.get(`${B}/nodes/${id}/versions`).then(unwrap),
  /** Bytes of one old version (private, authenticated). */
  versionBlob: async (id, versionId) => (await api.blob(`${B}/nodes/${id}/versions/${versionId}/content`)).blob(),
  /** Put the file back to an old version (the current content is kept as a new version, so it can be undone). */
  restoreVersion: (id, versionId) => api.post(`${B}/nodes/${id}/versions/${versionId}/restore`, {}).then(unwrap),
  deleteVersion: (id, versionId) => api.del(`${B}/nodes/${id}/versions/${versionId}`),
  /** Whole-tree listing (metadata only) for the cloud backup engine. */
  manifest: () => api.get(`${B}/manifest`).then(unwrap),
  sandboxTokenPath: (folderId) => `${B}/nodes/${folderId}/sandbox-token`,
};

const CACHE_MAX_BYTES = 40 * 1024 * 1024;
async function readWithProgress(res, onProgress) {
  const total = Number(res.headers.get('content-length')) || 0;
  const type = res.headers.get('content-type') || '';
  if (!res.body || !res.body.getReader || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(Math.min(99, Math.round((got / total) * 100)));
  }
  return new Blob(chunks, { type });
}

/** A file's bytes (private → authenticated request; with direct storage: a signed bucket URL, validated against the local copy first). */
export async function fetchDriveBlob(id, { onProgress } = {}) {
  const key = `blob:drive:${id}`;
  const cached = await getDraft(key); // { etag, blob } from an earlier open (IndexedDB)
  const have = cached?.kind === 'cache' && cached.blob && cached.etag ? cached : null;

  if (await directOn()) {
    try {
      const info = unwrap(await api.get(`${B}/nodes/${id}/download-url`));
      if (have && info.etag === have.etag) { onProgress?.(100); return have.blob; }
      let res;
      try { res = await fetch(info.url, { credentials: 'omit' }); } catch (fe) { throw Object.assign(fe, { direct: true }); }
      if (!res.ok) throw Object.assign(new Error(`Storage answered ${res.status}.`), { direct: true });
      const blob = await readWithProgress(res, onProgress);
      if (info.etag && blob.size <= CACHE_MAX_BYTES) { putDraft(key, { kind: 'cache', etag: info.etag, blob }); pruneCache(); }
      return blob;
    } catch (e) {
      if (have && e?.status === 0) { onProgress?.(100); return have.blob; } // offline (the API itself is unreachable): use the local copy
      if (!canFallBack(e)) throw e;
      // otherwise: the classic proxied download below
    }
  }

  let res;
  try {
    res = await api.blob(`${B}/nodes/${id}/content`, undefined, have ? { 'If-None-Match': have.etag } : undefined);
  } catch (e) {
    if (have && (e?.status === 304 || e?.status === 0)) { onProgress?.(100); return have.blob; } // unchanged — or offline: use the local copy
    throw e;
  }
  const blob = await readWithProgress(res, onProgress);
  const etag = res.headers.get('etag');
  if (etag && blob.size <= CACHE_MAX_BYTES) { putDraft(key, { kind: 'cache', etag, blob }); pruneCache(); }
  return blob;
}

/** A folder as a ZIP with its contents at the archive root (what the code editor opens). */
export async function fetchFolderZip(id, { onProgress } = {}) {
  const res = await api.blob(`${B}/nodes/${id}/archive`, { root: 1 });
  return readWithProgress(res, onProgress);
}

/** Download a file / folder (folders as ZIP) through the blob so the login token is sent. */
export async function fetchDownload(node, opts) {
  if (node.type === 'folder') {
    const res = await api.blob(`${B}/nodes/${node.id}/archive`);
    return { blob: await readWithProgress(res, opts?.onProgress), name: `${node.name}.zip` };
  }
  return { blob: await fetchDriveBlob(node.id, opts), name: node.name };
}

/** Public share page (no login): /api/v1/public/drive-share/{token}. */
const P = (token) => `/api/v1/public/drive-share/${encodeURIComponent(token)}`;
export const sharedApi = {
  view: (token, nodeId) => api.get(P(token), nodeId ? { node: nodeId } : undefined).then(unwrap),
  file: async (token, nodeId, { download = false } = {}) => {
    const res = await api.blob(`${P(token)}/file`, { ...(nodeId ? { node: nodeId } : {}), ...(download ? { download: 1 } : {}) });
    return res.blob();
  },
  zip: async (token, nodeId) => {
    const res = await api.blob(`${P(token)}/zip`, nodeId ? { node: nodeId } : undefined);
    return res.blob();
  },
};
