import { CloudAuthError, cloudFetch, withRetry } from './errors';

/**
 * Google Drive backup provider. Scope = drive.file (only files THIS app creates — no Google security review needed).
 * Token comes from Google Identity Services (token client): the first connect needs a click, renewals try silently.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_NAME = 'UIP My PC';
const SMALL = 4 * 1024 * 1024;

let gsiP = null;
function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gsiP) {
    gsiP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = resolve; s.onerror = () => { gsiP = null; reject(new CloudAuthError('Could not load Google sign-in.', 'load')); };
      document.head.appendChild(s);
    });
  }
  return gsiP;
}

async function requestToken(clientId, { prompt, hint }) {
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE, prompt, ...(hint ? { hint } : {}),
      callback: (r) => (r?.access_token ? resolve({ accessToken: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000 }) : reject(new CloudAuthError(r?.error_description || 'Google sign-in was cancelled.', r?.error || 'denied'))),
      error_callback: (e) => reject(new CloudAuthError(e?.type === 'popup_closed' ? 'The sign-in window was closed.' : 'Google sign-in could not open.', e?.type || 'popup')),
    });
    client.requestAccessToken();
  });
}

const authed = (tok, extra) => ({ ...(extra || {}), Authorization: `Bearer ${tok.accessToken}` });
const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOrCreateFolder(tok, name, parentId) {
  const cond = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${q(name)}' and '${parentId || 'root'}' in parents`;
  const r = await cloudFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(cond)}&fields=files(id)&pageSize=1&spaces=drive`, { headers: authed(tok) });
  const j = await r.json();
  if (j.files?.[0]) return j.files[0].id;
  const c = await cloudFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: authed(tok, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return (await c.json()).id;
}

async function uploadBytes(tok, { fileId, name, parentId, blob }) {
  const meta = fileId ? { name } : { name, parents: [parentId] };
  const mime = blob.type || 'application/octet-stream';
  if (blob.size <= SMALL) {
    const boundary = `uip${Math.random().toString(36).slice(2)}`;
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
    const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const r = await cloudFetch(url, { method: fileId ? 'PATCH' : 'POST', headers: authed(tok, { 'Content-Type': `multipart/related; boundary=${boundary}` }), body });
    return (await r.json()).id;
  }
  const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id';
  const init = await cloudFetch(url, { method: fileId ? 'PATCH' : 'POST', headers: authed(tok, { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(blob.size) }), body: JSON.stringify(meta) });
  const loc = init.headers.get('Location');
  if (!loc) throw new CloudAuthError('Google did not start the upload.', 'load');
  const r = await cloudFetch(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
  return (await r.json()).id;
}

export const google = {
  id: 'google',
  label: 'Google Drive',
  enabled: (cfg) => !!cfg?.enabled && !!cfg?.client_id,

  /** Interactive (from a click). */
  async connect(cfg) {
    const tok = await requestToken(cfg.client_id, { prompt: 'consent' });
    let account = '';
    try { const r = await cloudFetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: authed(tok) }); account = (await r.json())?.user?.emailAddress || ''; } catch { /* optional */ }
    return { tok, account };
  },
  /** Silent renewal (no click). Throws CloudAuthError when Google wants the person to act. */
  async refresh(cfg, account) {
    return requestToken(cfg.client_id, { prompt: '', hint: account || undefined });
  },

  /** Make sure the folder chain exists; returns { rootId, folders } where folders maps our node id → Drive folder id. */
  async ensureFolder(tok, state, nodeId, name, parentRemoteId) {
    if (state.folders[nodeId]) return state.folders[nodeId];
    const id = await withRetry(() => findOrCreateFolder(tok, name, parentRemoteId));
    state.folders[nodeId] = id;
    return id;
  },
  async ensureRoot(tok, state) {
    if (!state.rootId) state.rootId = await withRetry(() => findOrCreateFolder(tok, ROOT_NAME, null));
    return state.rootId;
  },

  /** Create or update one file. Returns the remote id. */
  async put(tok, { remoteId, name, parentRemoteId, blob }) {
    return withRetry(async () => {
      try { return await uploadBytes(tok, { fileId: remoteId, name, parentId: parentRemoteId, blob }); } catch (e) {
        if (remoteId && e?.status === 404) return uploadBytes(tok, { fileId: null, name, parentId: parentRemoteId, blob }); // deleted in Drive: create again
        throw e;
      }
    });
  },
};
