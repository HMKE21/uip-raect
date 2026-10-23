import { CloudAuthError, CloudQuotaError, CloudRetryError, cloudFetch, withRetry } from './errors';
import { BACKUP_ROOT } from './categories';

/**
 * OneDrive backup provider (Microsoft Graph). OAuth2 authorization-code + PKCE in a pop-up (public/ms-auth.html is the redirect),
 * scopes Files.ReadWrite.AppFolder (only the app's own folder "Apps/<app name>") + User.Read. No library needed.
 * Tokens live in sessionStorage (see engine.js), never on the server.
 */
const SCOPE = 'Files.ReadWrite.AppFolder User.Read offline_access';
const ROOT = BACKUP_ROOT;
const SMALL = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 16; // multiple of 320 KiB, as Graph requires

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectUri = () => `${window.location.origin}/ms-auth.html`;
const tokenUrl = (cfg) => `${cfg.authority.replace(/\/+$/, '')}/oauth2/v2.0/token`;

async function tokenCall(cfg, params) {
  let res;
  try { res = await fetch(tokenUrl(cfg), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.client_id, scope: SCOPE, ...params }) }); } catch { throw new CloudRetryError('Network problem.', 0); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    if (res.status >= 500) throw new CloudRetryError('Microsoft is busy.', res.status);
    throw new CloudAuthError(j.error_description?.split('\r')[0] || 'Microsoft sign-in failed.', j.error || 'denied');
  }
  return { tok: { accessToken: j.access_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000 }, refreshToken: j.refresh_token || null };
}

function popupCode(cfg) {
  const verifier = rand(48);
  const stateNonce = rand(16);
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then((h) => new Promise((resolve, reject) => {
    const url = `${cfg.authority.replace(/\/+$/, '')}/oauth2/v2.0/authorize?${new URLSearchParams({
      client_id: cfg.client_id, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: SCOPE,
      state: stateNonce, code_challenge: b64url(h), code_challenge_method: 'S256', prompt: 'select_account',
    })}`;
    const w = window.open(url, 'uip-ms-auth', 'width=520,height=680');
    if (!w) { reject(new CloudAuthError('The sign-in window was blocked. Allow pop-ups and try again.', 'popup')); return; }
    const done = (fn, v) => { window.removeEventListener('message', onMsg); clearInterval(timer); try { w.close(); } catch { /* already closed */ } fn(v); };
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'uip-ms-auth') return;
      const p = new URLSearchParams(e.data.search || '');
      if (p.get('state') !== stateNonce) return;
      if (p.get('code')) done(resolve, { code: p.get('code'), verifier });
      else done(reject, new CloudAuthError(p.get('error_description') || 'Microsoft sign-in was cancelled.', p.get('error') || 'denied'));
    };
    window.addEventListener('message', onMsg);
    const timer = setInterval(() => { if (w.closed) done(reject, new CloudAuthError('The sign-in window was closed.', 'popup')); }, 600);
  }));
}

const authed = (tok, extra) => ({ ...(extra || {}), Authorization: `Bearer ${tok.accessToken}` });
const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
const approot = (path) => `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${enc(path)}`;

async function putSmall(tok, path, blob) {
  const r = await cloudFetch(`${approot(path)}:/content?@microsoft.graph.conflictBehavior=replace`, { method: 'PUT', headers: authed(tok, { 'Content-Type': blob.type || 'application/octet-stream' }), body: blob });
  return (await r.json()).id;
}

async function putLarge(tok, path, blob) {
  const s = await cloudFetch(`${approot(path)}:/createUploadSession`, { method: 'POST', headers: authed(tok, { 'Content-Type': 'application/json' }), body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
  const { uploadUrl } = await s.json();
  let id = null;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const end = Math.min(blob.size, off + CHUNK);
    let res;
    try { res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${off}-${end - 1}/${blob.size}` }, body: blob.slice(off, end) }); } catch { throw new CloudRetryError('Network problem.', 0); }
    if (res.status === 507) throw new CloudQuotaError();
    if (res.status >= 500 || res.status === 429) throw new CloudRetryError('Microsoft is busy.', res.status);
    if (!res.ok) throw Object.assign(new Error(`Cloud error ${res.status}.`), { status: res.status });
    if (res.status === 200 || res.status === 201) id = (await res.json()).id;
  }
  return id;
}

export const microsoft = {
  id: 'microsoft',
  label: 'OneDrive',
  enabled: (cfg) => !!cfg?.enabled && !!cfg?.client_id && !!window.crypto?.subtle,

  /** Interactive (from a click). Returns { tok, refreshToken, account }. */
  async connect(cfg) {
    const { code, verifier } = await popupCode(cfg);
    const r = await tokenCall(cfg, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
    let account = '';
    try { const me = await cloudFetch('https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail', { headers: authed(r.tok) }); const j = await me.json(); account = j.mail || j.userPrincipalName || ''; } catch { /* optional */ }
    return { ...r, account };
  },
  async refresh(cfg, refreshToken) {
    if (!refreshToken) throw new CloudAuthError('Sign in again to continue.', 'expired');
    return tokenCall(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken });
  },

  // OneDrive creates the intermediate folders itself when a file is addressed by path.
  async ensureRoot() { return ROOT; },
  async ensureFolder(tok, state, nodeId, name, parentRemoteId) { return `${parentRemoteId}/${name}`; },

  async put(tok, { name, parentRemoteId, blob }) {
    const path = `${parentRemoteId}/${name}`;
    return withRetry(() => (blob.size <= SMALL ? putSmall(tok, path, blob) : putLarge(tok, path, blob)));
  },
};
