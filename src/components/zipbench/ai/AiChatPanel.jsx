import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { Answer, Diff } from './AiFixPanel';
import '../../../styles/css/zip-ai-fix.css';

/** What a brand-new file looks like in the panel: its first lines, all "added". */
function NewFilePreview({ content }) {
  const lines = String(content).split('\n');
  const shown = lines.slice(0, 14);
  return (
    <div className="zb-ai__diff" dir="ltr" role="group">
      {shown.map((s, i) => (
        <div key={i} className="zb-ai__row is-add">
          <span className="zb-ai__ln">{i + 1}</span>
          <span className="zb-ai__sign" aria-hidden="true">+</span>
          <span className="zb-ai__txt">{s || ' '}</span>
        </div>
      ))}
      {lines.length > shown.length && <div className="zb-ai__more" dir="auto">… +{lines.length - shown.length}</div>}
    </div>
  );
}

function EditCard({ e, tt, onApply, onReject, onOpen }) {
  return (
    <div className={`zb-ai__edit is-${e.state}`}>
      <div className="zb-ai__efile">
        <button type="button" className="zb-ai__file" onClick={() => onOpen(e.path)} title={tt('Open this file', 'افتح الملف ده')} dir="ltr">{e.path}</button>
        {e.kind === 'create' && <span className="zb-ai__badge">{tt('New file', 'ملف جديد')}</span>}
      </div>
      {e.kind === 'create' ? <NewFilePreview content={e.replace} /> : <Diff edit={e} />}
      <div className="zb-ai__edit-acts">
        {e.state === 'pending' && (
          <>
            <button type="button" className="zb-btn zb-btn--primary" onClick={() => onApply(e.id)}>
              <Icon name="check" size={14} /> <span>{e.kind === 'create' ? tt('Create', 'إنشاء') : tt('Apply', 'تطبيق')}</span>
            </button>
            <button type="button" className="zb-btn" onClick={() => onReject(e.id)}><Icon name="x" size={14} /> <span>{tt('Reject', 'رفض')}</span></button>
          </>
        )}
        {e.state === 'applied' && <span className="zb-ai__tag is-ok"><Icon name="check" size={13} /> {tt('Applied — Ctrl+S to keep it', 'اتطبّق — Ctrl+S عشان تحفظه')}</span>}
        {e.state === 'rejected' && <span className="zb-ai__tag">{tt('Rejected', 'مرفوض')}</span>}
        {e.state === 'stale' && (
          <span className="zb-ai__tag is-warn">
            {e.kind === 'create' ? tt('A file with that name already exists.', 'فيه ملف بنفس الاسم بالفعل.') : tt('The code changed since the suggestion — ask again.', 'الكود اتغيّر بعد الاقتراح — اسأل تاني.')}
          </span>
        )}
      </div>
    </div>
  );
}

function Message({ m, tt, onApply, onApplyAll, onReject, onOpen, onRetry, isLast }) {
  if (m.role === 'user') return <div className="zb-chat__user" dir="auto">{m.content}</div>;
  const streaming = m.phase === 'streaming';
  const edits = m.edits || [];
  const pending = edits.filter((e) => e.state === 'pending');
  return (
    <div className="zb-chat__bot">
      {streaming && !m.content && <div className="zb-ai__wait"><span className="zb-ai__dots" aria-hidden="true"><i /><i /><i /></span>{tt('Reading your code…', 'بقرأ الكود…')}</div>}
      {m.content && <Answer text={m.content} tt={tt} streaming={streaming} />}
      {streaming && m.content && <span className="zb-ai__cursor" aria-hidden="true" />}
      {m.phase === 'stopped' && <div className="zb-ai__tag">{tt('Stopped', 'اتوقّف')}</div>}

      {edits.length > 0 && (
        <div className="zb-ai__edits">
          <div className="zb-ai__edits-head">
            <strong>{tt('Suggested changes', 'التعديلات المقترحة')} ({edits.length}) {tt('in', 'في')} {new Set(edits.map((e) => e.path)).size} {new Set(edits.map((e) => e.path)).size === 1 ? tt('file', 'ملف') : tt('files', 'ملفات')}</strong>
            {pending.length > 1 && <button type="button" className="zb-btn zb-btn--primary" onClick={() => onApplyAll(m.id)}><Icon name="check" size={14} /> <span>{tt('Apply all', 'تطبيق الكل')}</span></button>}
          </div>
          {edits.map((e) => <EditCard key={e.id} e={e} tt={tt} onApply={(id) => onApply(m.id, id)} onReject={(id) => onReject(m.id, id)} onOpen={onOpen} />)}
        </div>
      )}

      {m.phase === 'error' && (
        <div className="zb-ai__error" role="alert">
          <span>{m.error}</span>
          {isLast && <button type="button" className="zb-btn" onClick={onRetry}><Icon name="refresh" size={14} /> <span>{tt('Try again', 'حاول تاني')}</span></button>}
        </div>
      )}
    </div>
  );
}

/**
 * Right-hand AI chat panel of the workbench. It knows the open file, the selected lines, the terminal output and the other
 * open tabs (the little chips above the box say which of those are sent — each can be turned off) and, in assistant mode,
 * answers with changes to one or SEVERAL files (and new files) shown as diffs. Nothing changes until the student presses Apply.
 */
export default function AiChatPanel({
  tt, messages, busy, modes, mode, canSwitchMode, onMode, chips, onChip, suggestions, onSend, onStop, onRetry, onClear, onClose,
  onApply, onApplyAll, onReject, onOpen, activeLabel,
}) {
  const [text, setText] = useState('');
  const bodyRef = useRef(null);
  const stick = useRef(true);
  const boxRef = useRef(null);

  useEffect(() => { const el = bodyRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages]);
  const onScroll = () => { const el = bodyRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
  useEffect(() => { boxRef.current?.focus(); }, []);
  useEffect(() => { // grow with the text, up to ~6 lines
    const el = boxRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  }, [text]);

  const submit = (q) => {
    const v = String(q ?? text).trim();
    if (!v || busy) return;
    stick.current = true;
    onSend(v);
    setText('');
  };
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const modeName = (m) => (m === 'assistant' ? tt('Assistant', 'مساعد') : tt('Tutor', 'مدرّس'));
  const modeHint = mode === 'assistant'
    ? tt('Answers and can change your files — you review every change before it is applied.', 'بيجاوب وممكن يعدّل ملفاتك — وإنت بتراجع كل تعديل قبل ما يتطبّق.')
    : tt('Explains and gives hints — you write the code yourself.', 'بيشرح وبيدّيك تلميحات — وإنت اللي بتكتب الكود.');

  return (
    <aside className="zb-ai zb-chat" aria-label={tt('AI chat', 'شات الذكاء الاصطناعي')}>
      <header className="zb-ai__head">
        <span className="zb-ai__ico"><Icon name="sparkles" size={15} /></span>
        <div className="zb-ai__title">
          <strong>{tt('AI chat', 'شات الذكاء الاصطناعي')}</strong>
          {activeLabel && <span className="zb-ai__file" dir="ltr" style={{ cursor: 'default' }}>{activeLabel}</span>}
        </div>
        {messages.length > 0 && <button type="button" className="zb-ibtn" onClick={onClear} title={tt('New chat', 'محادثة جديدة')} aria-label={tt('New chat', 'محادثة جديدة')}><Icon name="trash" size={15} /></button>}
        <button type="button" className="zb-ibtn" onClick={onClose} title={tt('Close', 'إغلاق')} aria-label={tt('Close', 'إغلاق')}><Icon name="x" size={15} /></button>
      </header>

      {canSwitchMode && (
        <div className="zb-ai__modes" role="tablist" aria-label={tt('Assistant mode', 'وضع المساعد')}>
          {modes.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={`zb-ai__mode${mode === m ? ' is-on' : ''}`} onClick={() => onMode(m)} disabled={busy}>{modeName(m)}</button>
          ))}
        </div>
      )}
      <p className="zb-ai__hint" dir="auto">{modeHint}</p>

      <div className="zb-ai__body" ref={bodyRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="zb-chat__empty">
            <p dir="auto">{tt('Ask about your code. I can see the open file, the lines you select and the terminal output.', 'اسأل عن الكود بتاعك. أنا شايف الملف المفتوح والسطور اللي بتحددها وناتج الـ terminal.')}</p>
            <div className="zb-chat__sugg">
              {suggestions.map((s) => <button key={s} type="button" className="zb-ai__mini" onClick={() => submit(s)} disabled={busy}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={m.id} m={m} tt={tt} isLast={i === messages.length - 1} onApply={onApply} onApplyAll={onApplyAll} onReject={onReject} onOpen={onOpen} onRetry={onRetry} />
        ))}
      </div>

      <div className="zb-chat__composer">
        {chips.length > 0 && (
          <div className="zb-chat__chips" role="group" aria-label={tt('Context sent with your message', 'السياق اللي بيتبعت مع رسالتك')}>
            {chips.map((c) => (
              <button key={c.key} type="button" className={`zb-chat__chip${c.on ? ' is-on' : ''}`} onClick={() => onChip(c.key)} aria-pressed={c.on} title={c.on ? tt('Sent with your message — click to turn off', 'بيتبعت مع رسالتك — اضغط لإيقافه') : tt('Not sent — click to include', 'مش بيتبعت — اضغط لتضمينه')}>
                {c.on && <Icon name="check" size={11} />} <span dir="auto">{c.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="zb-chat__row">
          <textarea ref={boxRef} className="zb-chat__input" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} dir="auto" maxLength={6000}
            placeholder={tt('Ask a question…  (Enter to send, Shift+Enter for a new line)', 'اكتب سؤالك…  (Enter للإرسال، Shift+Enter لسطر جديد)')} aria-label={tt('Message', 'الرسالة')} />
          {busy
            ? <button type="button" className="zb-btn zb-btn--primary zb-chat__send" onClick={onStop} title={tt('Stop', 'إيقاف')} aria-label={tt('Stop', 'إيقاف')}><Icon name="stop" size={15} /></button>
            : <button type="button" className="zb-btn zb-btn--primary zb-chat__send" onClick={() => submit()} disabled={!text.trim()} title={tt('Send', 'إرسال')} aria-label={tt('Send', 'إرسال')}><Icon name="send" size={15} /></button>}
        </div>
        <small className="zb-chat__note">{tt('AI can make mistakes — check the answer before relying on it.', 'الذكاء الاصطناعي ممكن يغلط — راجع الإجابة قبل ما تعتمد عليها.')}</small>
      </div>
    </aside>
  );
}
