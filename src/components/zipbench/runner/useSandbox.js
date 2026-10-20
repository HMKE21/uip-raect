import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';

const OUT_CAP = 200 * 1024;

// The gateway keeps a sandbox alive for a few minutes after the browser disappears (refresh, lost connection) and lets the
// same user re-attach to it (`resume`). We remember what is running so a refresh re-attaches instead of starting over
// (no new container, no upload, no npm install).
const markKey = (id) => `uip.sbx:${id}`;
const readMark = (id) => { try { const m = JSON.parse(localStorage.getItem(markKey(id)) || 'null'); return m && m.until > Date.now() ? m : null; } catch { return null; } };
const writeMark = (id, m) => { try { localStorage.setItem(markKey(id), JSON.stringify(m)); } catch { /* private mode */ } };
const clearMark = (id) => { try { localStorage.removeItem(markKey(id)); } catch { /* private mode */ } };

/**
 * Client for the uip-sandbox gateway (real terminal + Laravel / Node / Python servers in an isolated container).
 *
 *   1. POST tokenPath (default /api/v1/projects/{id}/sandbox-token; My PC folders pass their own)  ->  { url, token }   (Full-API checks the user may open this project)
 *   2. open  wss://<gateway>/ws?token=…  and talk the small JSON protocol (see uip-sandbox/src/server.js)
 *   3. the project zip is sent as ONE binary frame when the gateway asks for it ("send-files")
 *
 * phase: idle | connecting | starting | running | exited | error | closed | disconnected
 */
export function useSandbox(projectId, tokenPath) {
  const wsRef = useRef(null);
  const sinkRef = useRef(null);      // terminal writer, set by <SandboxPanel>
  const outRef = useRef('');         // output so far, replayed when the terminal (re)mounts
  const runRef = useRef(0);          // run counter: ignore events of an older socket
  const lastRef = useRef(null);      // { kind, entry, choice } of the last run, used to reconnect
  const sizeRef = useRef({ cols: 100, rows: 28 });
  const tries = useRef(0);           // automatic re-attach attempts since the last good connection
  const idRef = useRef('');          // what the remembered-run marker is keyed by
  idRef.current = String(tokenPath || projectId || '');
  const [phase, setPhase] = useState('idle');
  const [statusText, setStatusText] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);

  const emit = useCallback((d) => {
    outRef.current = (outRef.current + d).slice(-OUT_CAP);
    sinkRef.current?.write(d);
  }, []);

  /** <SandboxPanel> hands in its xterm instance; everything printed so far is replayed into it. */
  const attach = useCallback((term) => {
    sinkRef.current = term;
    if (term && outRef.current) term.write(outRef.current);
  }, []);

  const closeSocket = useCallback(() => {
    const ws = wsRef.current; wsRef.current = null;
    if (ws) { ws.onmessage = null; ws.onclose = null; ws.onerror = null; try { ws.close(); } catch { /* ignore */ } }
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(async ({ kind, entry = '', zip, cols = 100, rows = 28, resume = false, choice = '' }) => {
    closeSocket();
    runRef.current += 1;
    const run = runRef.current;
    setError(''); setHint('');
    if (!resume) { outRef.current = ''; sinkRef.current?.reset?.(); setPreviewUrl(null); }
    setPhase('connecting'); setStatusText('');
    lastRef.current = { kind, entry, choice };
    sizeRef.current = { cols, rows };
    try {
      const res = await api.post(tokenPath || `/api/v1/projects/${projectId}/sandbox-token`);
      const { url, token } = res?.data ?? res;
      if (run !== runRef.current) return;
      const wsUrl = `${String(url).replace(/^http/i, 'ws').replace(/\/+$/, '')}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'init', kind, entry, cols, rows, resume }));
      ws.onerror = () => { if (run === runRef.current) { if (resume) setPhase('disconnected'); else { setError('Could not reach the sandbox server.'); setPhase('error'); } } };
      ws.onclose = () => {
        if (run !== runRef.current || wsRef.current !== ws) return;
        wsRef.current = null;
        setPhase((p) => (p === 'running' || p === 'starting' ? 'disconnected' : p === 'connecting' ? (resume ? 'disconnected' : 'error') : p));
      };
      ws.onmessage = (ev) => {
        if (run !== runRef.current || typeof ev.data !== 'string') return;
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        switch (m.t) {
          case 'send-files': setPhase('starting'); ws.send(zip); break;
          case 'status': setPhase('starting'); setStatusText(m.text || ''); break;
          case 'session': tries.current = 0; setPhase('running'); setStatusText(''); setExpiresAt(Date.now() + (m.expiresInMs || 0)); if (idRef.current) writeMark(idRef.current, { kind, entry, choice, until: Date.now() + (m.expiresInMs || 0) }); break;
          case 'out': emit(m.d); break;
          case 'preview': setPreviewUrl(m.url || null); break;
          case 'hint': setHint(m.text || ''); break;
          case 'exit': setPhase('exited'); break;
          case 'nosession': setPhase('idle'); setStatusText('No running sandbox to resume.'); clearMark(idRef.current); break;
          case 'error': setError(m.text || 'Sandbox error'); setPhase('error'); break;
          case 'closed': clearMark(idRef.current); setPhase('closed'); setStatusText(m.reason || ''); setPreviewUrl(null); wsRef.current = null; break;
          default: break;
        }
      };
    } catch (e) {
      if (run !== runRef.current) return;
      if (resume) { setPhase('disconnected'); return; } // offline right now: the auto-reconnect keeps trying
      setError(e?.message || 'Could not start the sandbox.'); setPhase('error');
    }
  }, [projectId, tokenPath, closeSocket, emit]);

  /** start a new sandbox. `zip` is a Uint8Array with the project files at its root. */
  const start = useCallback((opts) => connect(opts), [connect]);

  /** the socket dropped but the sandbox may still be alive on the gateway: reattach to it */
  const reconnect = useCallback((cols, rows) => {
    const last = lastRef.current;
    if (last) connect({ ...last, cols, rows, resume: true });
  }, [connect]);

  const restart = useCallback((cols, rows) => { outRef.current = ''; sinkRef.current?.reset?.(); send({ t: 'restart', cols, rows }); setPhase('running'); }, [send]);
  const stop = useCallback(() => { send({ t: 'stop' }); setPreviewUrl(null); }, [send]);
  const input = useCallback((d) => send({ t: 'input', d }), [send]);
  const resize = useCallback((cols, rows) => { sizeRef.current = { cols, rows }; send({ t: 'resize', cols, rows }); }, [send]);
  const reset = useCallback(() => {
    clearMark(idRef.current);
    runRef.current += 1; send({ t: 'stop' }); closeSocket();
    outRef.current = ''; sinkRef.current?.reset?.();
    setPhase('idle'); setStatusText(''); setPreviewUrl(null); setHint(''); setError('');
  }, [send, closeSocket]);

  /** a run from before a refresh is still alive on the gateway? -> { kind, entry, choice } else null */
  const resumable = useCallback(() => (idRef.current ? readMark(idRef.current) : null), []);
  const resumeSaved = useCallback((cols = 100, rows = 28) => {
    const m = idRef.current ? readMark(idRef.current) : null;
    if (!m) return false;
    connect({ kind: m.kind, entry: m.entry, choice: m.choice, cols, rows, resume: true });
    return true;
  }, [connect]);

  // connection lost (Wi-Fi dropped, laptop slept, tab refreshed): keep re-attaching while the gateway still holds the sandbox (~10 min)
  useEffect(() => {
    if (phase !== 'disconnected') return undefined;
    let n = 0;
    const tryNow = () => { if (tries.current > 100) return; if (navigator.onLine !== false) { tries.current += 1; const l = lastRef.current; if (l) connect({ ...l, cols: sizeRef.current.cols, rows: sizeRef.current.rows, resume: true }); } };
    const h = setInterval(() => { n += 1; if (n > 90) clearInterval(h); else tryNow(); }, 6000);
    window.addEventListener('online', tryNow);
    return () => { clearInterval(h); window.removeEventListener('online', tryNow); };
  }, [phase, connect]);

  // leaving the page ends the sandbox (it would only sit there until the idle timeout otherwise)
  useEffect(() => () => { runRef.current += 1; try { wsRef.current?.send(JSON.stringify({ t: 'stop' })); } catch { /* ignore */ } closeSocket(); }, [closeSocket]);

  const busy = phase === 'connecting' || phase === 'starting';
  return { phase, busy, statusText, previewUrl, hint, error, expiresAt, attach, start, reconnect, resumable, resumeSaved, restart, stop, input, resize, reset };
}
