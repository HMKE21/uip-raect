import { useCallback, useEffect, useRef, useState } from 'react';
import { streamPost, aiLocale } from './sse';

const URL = '/api/v1/ai-code/chat';
const FLUSH_MS = 40;     // batch streamed tokens into one render
const HISTORY = 10;      // messages sent back to the server (it keeps the last 10 anyway)

/** Messages for the failures the server can answer with before the stream starts. */
function httpMessage(status, serverMsg, tt) {
  if (status === 403) return tt('You do not have permission to use the AI code assistant (or it is locked during an exam).', 'مفيش عندك صلاحية لاستخدام مساعد الكود (أو هو مقفول أثناء الامتحان).');
  if (status === 429) return tt('Too many requests. Please wait a moment and try again.', 'طلبات كتير. استنى شوية وجرّب تاني.');
  if (status === 413) return tt('The files are too large for the assistant. Turn off some context and try again.', 'الملفات كبيرة على المساعد. قفّل جزء من السياق وجرّب تاني.');
  if (status === 503) return tt('The AI chat is not available right now.', 'شات الذكاء الاصطناعي مش متاح دلوقتي.');
  return serverMsg || tt('Something went wrong. Please try again.', 'حصلت مشكلة. جرّب تاني.');
}

let uid = 0;
const nextId = () => { uid += 1; return `m${uid}`; };

/**
 * Side-panel chat state. Messages live in memory for the life of the workbench (closing the panel keeps them).
 *
 *   const chat = useAiChat({ tt });
 *   chat.send({ text, mode, buildRequest })   // buildRequest() -> { active_path, files, tree, sel_from, sel_to, error } (read at send time)
 *   chat.messages  // [{ id, role: 'user'|'assistant', content, phase?: 'streaming'|'done'|'error'|'stopped', edits?: [{…, id, state}], error? }]
 *
 * The context (open file, selection, terminal output, other tabs) is rebuilt on EVERY send and only the question text is kept
 * in the history, so the conversation does not grow with file contents.
 */
export function useAiChat({ tt }) {
  const [messages, setMessages] = useState([]);
  const msgsRef = useRef([]);
  msgsRef.current = messages;
  const abortRef = useRef(null);
  const seqRef = useRef(0);
  const ttRef = useRef(tt);
  ttRef.current = tt;

  const abort = useCallback(() => {
    seqRef.current += 1;
    try { abortRef.current?.abort(); } catch { /* already done */ }
    abortRef.current = null;
  }, []);
  useEffect(() => abort, [abort]);

  const run = useCallback(async ({ history, mode, buildRequest }) => {
    abort();
    const seq = seqRef.current;
    const t = (en, ar) => ttRef.current(en, ar);
    const id = nextId();
    const live = () => seq === seqRef.current;
    const patch = (p) => { if (live()) setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...p } : m))); };

    setMessages([...history, { id, role: 'assistant', content: '', phase: 'streaming', edits: [], mode }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let buf = ''; let flushT = 0;
    const flush = () => { flushT = 0; if (buf) { const add = buf; buf = ''; if (live()) setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, content: m.content + add } : m))); } };

    let finished = false;
    const onEvent = (evt) => {
      switch (evt.type) {
        case 'token': buf += evt.delta || ''; if (!flushT) flushT = setTimeout(flush, FLUSH_MS); break;
        case 'edits': patch({ edits: Array.isArray(evt.edits) ? evt.edits.map((e, i) => ({ ...e, id: `${id}e${i}`, state: 'pending' })) : [] }); break;
        case 'done': clearTimeout(flushT); flush(); finished = true; patch({ phase: 'done', ...(typeof evt.content === 'string' && evt.content ? { content: evt.content } : {}) }); break;
        case 'error': clearTimeout(flushT); flush(); finished = true; patch({ phase: 'error', error: evt.message || t('Something went wrong. Please try again.', 'حصلت مشكلة. جرّب تاني.') }); break;
        default: break;
      }
    };

    const wire = history
      .filter((m) => m.content && m.phase !== 'error')
      .slice(-HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await streamPost(URL, { ...buildRequest(), messages: wire, mode, locale: aiLocale() }, { signal: ctrl.signal, onEvent });
      clearTimeout(flushT); flush();
      if (!finished) patch({ phase: 'done' }); // the stream ended without done/error: keep what we have
    } catch (err) {
      clearTimeout(flushT); flush();
      if (!live()) return;
      if (err && err.name === 'AbortError') { patch({ phase: 'stopped' }); return; }
      if (err && err.timeout) { patch({ phase: 'error', error: t('The assistant took too long to answer. Please try again.', 'المساعد اتأخر في الرد. جرّب تاني.') }); return; }
      patch({ phase: 'error', error: err && err.status ? httpMessage(err.status, err.serverMessage, t) : ((err && err.message) || t('Something went wrong. Please try again.', 'حصلت مشكلة. جرّب تاني.')) });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [abort]);

  const send = useCallback(({ text, mode, buildRequest }) => {
    const q = String(text || '').trim();
    if (!q) return;
    run({ history: [...msgsRef.current, { id: nextId(), role: 'user', content: q }], mode, buildRequest });
  }, [run]);

  /** Ask the last question again (after an error, a stop, or when the mode was switched). */
  const retry = useCallback(({ mode, buildRequest }) => {
    const cur = msgsRef.current;
    let i = cur.length - 1;
    while (i >= 0 && cur[i].role !== 'user') i -= 1;
    if (i < 0) return;
    run({ history: cur.slice(0, i + 1), mode, buildRequest });
  }, [run]);

  const stop = useCallback(() => { abort(); setMessages((cur) => cur.map((m) => (m.phase === 'streaming' ? { ...m, phase: 'stopped' } : m))); }, [abort]);
  const clear = useCallback(() => { abort(); setMessages([]); }, [abort]);
  const mark = useCallback((msgId, editId, state) => setMessages((cur) => cur.map((m) => (m.id === msgId && m.edits ? { ...m, edits: m.edits.map((e) => (e.id === editId ? { ...e, state } : e)) } : m))), []);

  return {
    messages, send, retry, stop, clear, mark,
    busy: messages.some((m) => m.phase === 'streaming'),
  };
}
