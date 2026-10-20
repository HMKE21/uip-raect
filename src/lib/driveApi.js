import { api } from '../api/client';

/**
 * "My PC" (جهازي) client — thin wrappers over /api/v1/drive/* (App\Http\Controllers\Api\DriveApiController).
 * Every file is private: bytes come through authenticated requests (api.blob = Bearer + refresh-on-401), never a public URL.
 */
const B = '/api/v1/drive';

export const drive = {
  list: (parentId) => api.get(B, parentId ? { parent_id: parentId } : undefined),
  tree: () => api.get(`${B}/tree`),
  search: (q) => api.get(`${B}/search`, { q }),
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
  /** Save a file's new bytes (image / PDF / ZIP editors, or a text file from the code editor). */
  replace: (id, blob, name) => {
    const fd = new FormData();
    fd.append('file', new File([blob], name || 'file', { type: blob.type || 'application/octet-stream' }));
    if (name) fd.append('name', name);
    return api.postForm(`${B}/nodes/${id}/replace`, fd);
  },
  /** Save the code editor's ZIP back into its folder (changed → replaced, new → added, removed → recycle bin). */
  sync: (id, blob) => {
    const fd = new FormData();
    fd.append('file', new File([blob], 'folder.zip', { type: 'application/zip' }));
    return api.postForm(`${B}/nodes/${id}/sync`, fd);
  },
  /** One file per request (clear progress, parallel-safe). rel = "dir/sub/file.txt" when uploading a folder. */
  upload: (parentId, file, rel, onProgress, signal) => {
    const fd = new FormData();
    if (parentId) fd.append('parent_id', String(parentId));
    fd.append('files[]', file, file.name);
    if (rel && rel.includes('/')) fd.append('paths[]', rel);
    return api.postFormProgress(`${B}/upload`, fd, onProgress, signal);
  },
  sandboxTokenPath: (folderId) => `${B}/nodes/${folderId}/sandbox-token`,
};

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

/** A file's bytes (private → authenticated fetch). */
export async function fetchDriveBlob(id, { onProgress } = {}) {
  const res = await api.blob(`${B}/nodes/${id}/content`);
  return readWithProgress(res, onProgress);
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
