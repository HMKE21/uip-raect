import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';

const OUT_CAP = 200 * 1024;

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
  const lastRef = useRef(null);      // { kind, entry, size } of the last run, used to reconnect
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

  const connect = useCallback(async ({ kind, entry = '', zip, cols = 100, rows = 28, resume = false }) => {
    closeSocket();
    runRef.current += 1;
    const run = runRef.current;
    setError(''); setHint('');
    if (!resume) { outRef.current = ''; sinkRef.current?.reset?.(); setPreviewUrl(null); }
    setPhase('connecting'); setStatusText('');
    lastRef.current = { kind, entry };
    try {
      const res = await api.post(tokenPath || `/api/v1/projects/${projectId}/sandbox-token`);
      const { url, token } = res?.data ?? res;
      if (run !== runRef.current) return;
      const wsUrl = `${String(url).replace(/^http/i, 'ws').replace(/\/+$/, '')}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'init', kind, entry, cols, rows, resume }));
      ws.onerror = () => { if (run === runRef.current) { setError('Could not reach the sandbox server.'); setPhase('error'); } };
      ws.onclose = () => {
        if (run !== runRef.current || wsRef.current !== ws) return;
        wsRef.current = null;
        setPhase((p) => (p === 'running' || p === 'starting' ? 'disconnected' : p === 'connecting' ? 'error' : p));
      };
      ws.onmessage = (ev) => {
        if (run !== runRef.current || typeof ev.data !== 'string') return;
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        switch (m.t) {
          case 'send-files': setPhase('starting'); ws.send(zip); break;
          case 'status': setPhase('starting'); setStatusText(m.text || ''); break;
          case 'session': setPhase('running'); setStatusText(''); setExpiresAt(Date.now() + (m.expiresInMs || 0)); break;
          case 'out': emit(m.d); break;
          case 'preview': setPreviewUrl(m.url || null); break;
          case 'hint': setHint(m.text || ''); break;
          case 'exit': setPhase('exited'); break;
          case 'nosession': setPhase('idle'); setStatusText('No running sandbox to resume.'); break;
          case 'error': setError(m.text || 'Sandbox error'); setPhase('error'); break;
          case 'closed': setPhase('closed'); setStatusText(m.reason || ''); setPreviewUrl(null); wsRef.current = null; break;
          default: break;
        }
      };
    } catch (e) {
      if (run !== runRef.current) return;
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
  const resize = useCallback((cols, rows) => send({ t: 'resize', cols, rows }), [send]);
  const reset = useCallback(() => {
    runRef.current += 1; send({ t: 'stop' }); closeSocket();
    outRef.current = ''; sinkRef.current?.reset?.();
    setPhase('idle'); setStatusText(''); setPreviewUrl(null); setHint(''); setError('');
  }, [send, closeSocket]);

  // leaving the page ends the sandbox (it would only sit there until the idle timeout otherwise)
  useEffect(() => () => { runRef.current += 1; try { wsRef.current?.send(JSON.stringify({ t: 'stop' })); } catch { /* ignore */ } closeSocket(); }, [closeSocket]);

  const busy = phase === 'connecting' || phase === 'starting';
  return { phase, busy, statusText, previewUrl, hint, error, expiresAt, attach, start, reconnect, restart, stop, input, resize, reset };
}
