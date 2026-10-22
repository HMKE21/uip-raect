import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { toDate } from '../components/exam/examUi';
import './miniApps.css';

/* ------------------------------------------------------------------------------------------------------------------
 * Small built-in apps of the UIP desktop: Notes, Calculator, Calendar.
 * Notes and the calendar's personal tasks live in this browser, per account (localStorage). The calendar also shows the
 * student's real exams (/exam-system/my-exams) and scheduled meetings / lectures (/meetings/calendar).
 * ---------------------------------------------------------------------------------------------------------------- */

const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

/* ============================== Notes ============================== */
const notesKey = (uid) => `uip_notes_v1_${uid ?? 'anon'}`;
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const titleOf = (n, tt) => (n.title?.trim() || n.body.trim().split('\n')[0].slice(0, 40) || tt('New note', 'ملاحظة جديدة'));

export function NotesApp({ uid, tt, ar }) {
  const [notes, setNotes] = useState(() => {
    const l = read(notesKey(uid), []);
    return Array.isArray(l) ? l.filter((n) => n && typeof n.id === 'string') : [];
  });
  const [sel, setSel] = useState(() => notes[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(true);
  const timer = useRef(0);
  const latest = useRef(notes); latest.current = notes;

  // debounced autosave; flushed when the window closes
  const persist = useCallback((list) => { latest.current = list; setSaved(false); clearTimeout(timer.current); timer.current = setTimeout(() => { write(notesKey(uid), latest.current); setSaved(true); }, 400); }, [uid]);
  useEffect(() => () => { clearTimeout(timer.current); write(notesKey(uid), latest.current); }, [uid]);

  const cur = notes.find((n) => n.id === sel) || null;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...notes].filter((n) => !needle || `${n.title} ${n.body}`.toLowerCase().includes(needle)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.updated - a.updated);
  }, [notes, q]);

  const patch = (id, p) => { const n = notes.map((x) => (x.id === id ? { ...x, ...p, updated: Date.now() } : x)); setNotes(n); persist(n); };
  const add = () => { const n = { id: newId(), title: '', body: '', pin: false, updated: Date.now() }; const l = [n, ...notes]; setNotes(l); setSel(n.id); persist(l); setQ(''); };
  const del = (id) => {
    const l = notes.filter((x) => x.id !== id); setNotes(l); persist(l);
    if (sel === id) setSel(l[0]?.id ?? null);
  };

  return (
    <div className="os-notes">
      <aside className="os-notes__side">
        <div className="os-notes__bar">
          <label className="os-mini-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Search notes', 'بحث في الملاحظات')} /></label>
          <button type="button" className="os-mini-ib" onClick={add} title={tt('New note', 'ملاحظة جديدة')} aria-label={tt('New note', 'ملاحظة جديدة')}><Icon name="edit" size={16} /></button>
        </div>
        <ul className="os-notes__list">
          {list.length === 0 && <li className="os-notes__empty">{notes.length ? tt('No match.', 'مفيش نتيجة.') : tt('No notes yet. Tap the pencil to write one.', 'مفيش ملاحظات لسه. اضغط القلم واكتب أول ملاحظة.')}</li>}
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" className={n.id === sel ? 'is-on' : ''} onClick={() => setSel(n.id)}>
                <b dir="auto">{n.pin && <Icon name="pin" size={11} />} {titleOf(n, tt)}</b>
                <small dir="auto">{new Date(n.updated).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' })} · {n.body.replace(/\s+/g, ' ').slice(0, 40) || tt('No text', 'من غير نص')}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="os-notes__main">
        {cur ? (
          <>
            <div className="os-notes__tools">
              <input className="os-notes__title" dir="auto" value={cur.title} maxLength={120} placeholder={tt('Title', 'العنوان')} onChange={(e) => patch(cur.id, { title: e.target.value })} />
              <button type="button" className={`os-mini-ib${cur.pin ? ' is-on' : ''}`} onClick={() => patch(cur.id, { pin: !cur.pin })} title={tt('Pin', 'تثبيت')} aria-label={tt('Pin', 'تثبيت')} aria-pressed={!!cur.pin}><Icon name="pin" size={15} /></button>
              <button type="button" className="os-mini-ib" onClick={() => del(cur.id)} title={tt('Delete note', 'حذف الملاحظة')} aria-label={tt('Delete note', 'حذف الملاحظة')}><Icon name="trash" size={15} /></button>
            </div>
            <textarea className="os-notes__ta" dir="auto" value={cur.body} maxLength={50000} placeholder={tt('Start typing…', 'اكتب هنا…')} onChange={(e) => patch(cur.id, { body: e.target.value })} autoFocus />
            <footer className="os-notes__foot"><span>{cur.body.length.toLocaleString(ar ? 'ar-EG' : 'en-US')} {tt('characters', 'حرف')}</span><span>{saved ? tt('Saved on this device', 'محفوظة على الجهاز ده') : tt('Saving…', 'بيحفظ…')}</span></footer>
          </>
        ) : (
          <div className="os-app-msg"><span>{tt('Select a note or create a new one.', 'اختار ملاحظة أو اعمل واحدة جديدة.')}</span></div>
        )}
      </section>
    </div>
  );
}

/* ============================== Calculator ============================== */
/** Safe expression evaluator (no eval): + − × ÷ ^ % with parentheses and unary minus. Returns a number or throws. */
function calc(src) {
  const t = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  let i = 0;
  const peek = () => t[i];
  const num = () => {
    const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\.?/i.exec(t.slice(i));
    if (!m) throw new Error('syntax');
    i += m[0].length; return parseFloat(m[0]);
  };
  const atom = () => {
    if (peek() === '(') { i += 1; const v = add(); if (peek() !== ')') throw new Error('paren'); i += 1; return post(v); }
    if (peek() === '-') { i += 1; return -pow(); }
    if (peek() === '+') { i += 1; return pow(); }
    return post(num());
  };
  const post = (v) => { let x = v; while (peek() === '%') { i += 1; x /= 100; } return x; };
  const pow = () => { const b = atom(); if (peek() === '^') { i += 1; return b ** pow(); } return b; };
  const mul = () => {
    let v = pow();
    while (peek() === '*' || peek() === '/') { const op = t[i]; i += 1; const r = pow(); v = op === '*' ? v * r : v / r; }
    return v;
  };
  const add = () => {
    let v = mul();
    while (peek() === '+' || peek() === '-') { const op = t[i]; i += 1; const r = mul(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const v = add();
  if (i < t.length) throw new Error('syntax');
  if (!Number.isFinite(v)) throw new Error('math');
  return v;
}
const fmtNum = (v) => { const r = Number(v.toPrecision(12)); return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0) ? r.toExponential(6) : String(r); };
const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', 'DEL', '='];

export function CalculatorApp({ tt }) {
  const [expr, setExpr] = useState('');
  const [res, setRes] = useState('');
  const [hist, setHist] = useState([]);
  const [fresh, setFresh] = useState(false); // the last press was "=": a digit starts over, an operator continues from the result
  const root = useRef(null);

  const preview = useMemo(() => { if (!expr) return ''; try { return fmtNum(calc(expr)); } catch { return ''; } }, [expr]);
  const equals = useCallback(() => {
    if (!expr) return;
    try { const r = fmtNum(calc(expr)); setHist((h) => [{ e: expr, r }, ...h].slice(0, 20)); setRes(r); setExpr(r); setFresh(true); } catch { setRes(tt('Error', 'خطأ')); setFresh(true); }
  }, [expr, tt]);
  const press = useCallback((k) => {
    if (k === 'C') { setExpr(''); setRes(''); setFresh(false); return; }
    if (k === 'DEL') { setExpr((e) => (fresh ? '' : e.slice(0, -1))); setFresh(false); return; }
    if (k === '=') { equals(); return; }
    const isOp = /^[+−×÷^%]$/.test(k);
    setExpr((e) => {
      const base = fresh && !isOp ? '' : e;
      if (isOp && !base && k !== '−') return base;
      if (isOp && /[+−×÷^]$/.test(base) && k !== '%') return base.slice(0, -1) + k; // replace the previous operator
      return base + k;
    });
    setRes(''); setFresh(false);
  }, [equals, fresh]);

  const onKey = (e) => {
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: 'DEL', Escape: 'C', Delete: 'C' };
    const k = map[e.key] || (/^[\d.+()^%]$/.test(e.key) ? e.key : null);
    if (k) { e.preventDefault(); press(k); }
  };

  return (
    <div className="os-calc" ref={root} tabIndex={0} onKeyDown={onKey} dir="ltr">
      <div className="os-calc__screen" aria-live="polite">
        <small>{hist[0] && !expr ? `${hist[0].e} =` : ''}</small>
        <input readOnly value={expr || '0'} aria-label={tt('Expression', 'العملية')} />
        <span>{(res && res !== expr ? res : '') || (res ? '' : preview)}</span>
      </div>
      <div className="os-calc__keys">
        {KEYS.map((k) => (
          <button key={k} type="button" className={/^[+−×÷]$/.test(k) ? 'is-op' : k === '=' ? 'is-eq' : /^[\d.]$/.test(k) ? '' : 'is-fn'} onClick={() => { press(k); root.current?.focus(); }}>{k === 'DEL' ? '⌫' : k}</button>
        ))}
      </div>
      {hist.length > 0 && (
        <ul className="os-calc__hist" aria-label={tt('History', 'السجل')}>
          {hist.slice(0, 4).map((h, i) => <li key={i}><button type="button" onClick={() => { setExpr(h.r); setFresh(true); }}><span>{h.e}</span><b>= {h.r}</b></button></li>)}
        </ul>
      )}
    </div>
  );
}

/* ============================== Calendar ============================== */
const tasksKey = (uid) => `uip_cal_tasks_v1_${uid ?? 'anon'}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const KIND_COLOR = { exam: '#ff453a', meeting: '#0a84ff', task: '#30d158' };

export function CalendarApp({ uid, tt, ar, onGo }) {
  const lc = ar ? 'ar-EG' : 'en-US';
  const today = useMemo(() => new Date(), []);
  const [cur, setCur] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState(today);
  const [exams, setExams] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState(() => { const l = read(tasksKey(uid), []); return Array.isArray(l) ? l.filter((x) => x && typeof x.id === 'string' && typeof x.date === 'string') : []; });
  const [state, setState] = useState('loading'); // loading | ok | partial | offline
  const [title, setTitle] = useState(''); const [time, setTime] = useState('');

  // exams: the student's list (all windows); meetings / lectures: the month being shown (a little padding on both sides)
  useEffect(() => {
    let live = true;
    api.get('/api/v1/exam-system/my-exams').then((j) => { if (live) setExams(Array.isArray(j.data) ? j.data : []); }).catch(() => { if (live) setState('partial'); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    const start = new Date(cur.getFullYear(), cur.getMonth() - 1, 20); const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 12);
    api.get('/api/v1/meetings/calendar', { start: ymd(start), end: ymd(end) }).then((j) => { if (live) { setMeetings(Array.isArray(j.data) ? j.data : []); setState((s) => (s === 'partial' ? s : 'ok')); } })
      .catch(() => { if (live) setState((s) => (s === 'ok' ? 'partial' : 'offline')); });
    return () => { live = false; };
  }, [cur]);

  const events = useMemo(() => {
    const out = [];
    exams.forEach((e) => { const s = toDate(e.start_at); if (s) out.push({ id: `x${e.id}`, kind: 'exam', at: s, end: toDate(e.end_at), title: e.title, sub: e.subject || '', go: `/student/my-exams/${e.id}` }); });
    meetings.forEach((m) => { const s = toDate(m.scheduled_start_at || m.started_at); if (s) out.push({ id: `m${m.id ?? m.uuid}`, kind: 'meeting', at: s, end: toDate(m.scheduled_end_at), title: m.title, sub: '', go: null }); });
    tasks.forEach((t) => { const [h, mi] = (t.time || '').split(':').map(Number); const d = new Date(`${t.date}T00:00:00`); if (!Number.isNaN(h)) d.setHours(h, mi || 0); out.push({ id: t.id, kind: 'task', at: d, end: null, title: t.title, sub: '', hasTime: !!t.time }); });
    return out.sort((a, b) => a.at - b.at);
  }, [exams, meetings, tasks]);
  const byDay = useMemo(() => { const m = new Map(); events.forEach((e) => { const k = ymd(e.at); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }); return m; }, [events]);
  const dayEvents = byDay.get(ymd(day)) || [];
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = events.filter((e) => e.at >= startOfToday && e.kind !== 'task').slice(0, 4);

  const cells = useMemo(() => {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const start = (first.getDay() - (ar ? 6 : 0) + 7) % 7; // week starts on Saturday in Arabic (Egypt), Sunday in English
    const total = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const c = Array.from({ length: start }, () => null).concat(Array.from({ length: total }, (_, i) => new Date(cur.getFullYear(), cur.getMonth(), i + 1)));
    while (c.length % 7) c.push(null);
    return c;
  }, [cur, ar]);
  const heads = useMemo(() => { const base = ar ? 6 : 0; return Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + ((base + i) % 7)).toLocaleDateString(lc, { weekday: 'short' })); }, [ar, lc]);

  const saveTasks = (l) => { setTasks(l); write(tasksKey(uid), l); };
  const addTask = () => {
    const t = title.trim(); if (!t) return;
    saveTasks([...tasks, { id: `t${Date.now().toString(36)}`, title: t.slice(0, 120), date: ymd(day), time: /^\d{2}:\d{2}$/.test(time) ? time : '' }]);
    setTitle(''); setTime('');
  };
  const move = (n) => setCur((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const goToday = () => { setCur(new Date(today.getFullYear(), today.getMonth(), 1)); setDay(today); };
  const timeText = (e) => (e.kind === 'task' && !e.hasTime ? tt('All day', 'طول اليوم') : e.at.toLocaleTimeString(lc, { hour: 'numeric', minute: '2-digit' }) + (e.end && e.kind !== 'task' && sameDay(e.at, e.end) ? ` – ${e.end.toLocaleTimeString(lc, { hour: 'numeric', minute: '2-digit' })}` : ''));
  const kindLabel = { exam: tt('Exam', 'امتحان'), meeting: tt('Lecture / meeting', 'محاضرة / اجتماع'), task: tt('My task', 'مهمتي') };

  return (
    <div className="os-cal2">
      <section className="os-cal2__grid">
        <header>
          <strong>{cur.toLocaleDateString(lc, { month: 'long', year: 'numeric' })}</strong>
          <span>
            <button type="button" className="os-mini-ib" aria-label={tt('Previous month', 'الشهر السابق')} onClick={() => move(-1)}><Icon name={ar ? 'chevron-right' : 'chevron-left'} size={16} /></button>
            <button type="button" className="os-mini-btn" onClick={goToday}>{tt('Today', 'النهارده')}</button>
            <button type="button" className="os-mini-ib" aria-label={tt('Next month', 'الشهر التالي')} onClick={() => move(1)}><Icon name={ar ? 'chevron-left' : 'chevron-right'} size={16} /></button>
          </span>
        </header>
        <div className="os-cal2__heads">{heads.map((h) => <span key={h}>{h}</span>)}</div>
        <div className="os-cal2__days" role="grid">
          {cells.map((d, i) => {
            if (!d) return <i key={`e${i}`} />;
            const ev = byDay.get(ymd(d)) || [];
            const kinds = [...new Set(ev.map((e) => e.kind))];
            return (
              <button key={i} type="button" role="gridcell" className={`${sameDay(d, today) ? 'is-today ' : ''}${sameDay(d, day) ? 'is-sel' : ''}`} onClick={() => setDay(d)}
                aria-label={`${d.toLocaleDateString(lc, { weekday: 'long', day: 'numeric', month: 'long' })}${ev.length ? `, ${ev.length}` : ''}`}>
                <b>{d.getDate().toLocaleString(lc)}</b>
                <span>{kinds.map((k) => <u key={k} style={{ background: KIND_COLOR[k] }} />)}</span>
              </button>
            );
          })}
        </div>
        <footer className="os-cal2__legend">{Object.keys(KIND_COLOR).map((k) => <span key={k}><u style={{ background: KIND_COLOR[k] }} />{kindLabel[k]}</span>)}</footer>
      </section>
      <aside className="os-cal2__side">
        <h4>{day.toLocaleDateString(lc, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
        {state === 'loading' && <p className="os-cal2__note">{tt('Loading your exams and lectures…', 'بيحمّل الامتحانات والمحاضرات…')}</p>}
        {state === 'offline' && <p className="os-cal2__note">{tt('Could not load exams and lectures. Your own tasks still work.', 'مقدرتش أحمّل الامتحانات والمحاضرات. مهامك الشخصية شغالة.')}</p>}
        {state === 'partial' && <p className="os-cal2__note">{tt('Part of the schedule could not be loaded.', 'جزء من الجدول ماتحمّلش.')}</p>}
        <ul className="os-cal2__events">
          {dayEvents.length === 0 && state !== 'loading' && <li className="os-cal2__none">{tt('Nothing scheduled.', 'مفيش حاجة في اليوم ده.')}</li>}
          {dayEvents.map((e) => (
            <li key={e.id} style={{ '--ev': KIND_COLOR[e.kind] }}>
              <div><b dir="auto">{e.title}</b><small>{kindLabel[e.kind]} · {timeText(e)}{e.sub ? ` · ${e.sub}` : ''}</small></div>
              {e.go && onGo && <button type="button" className="os-mini-btn" onClick={() => onGo(e.go)}>{tt('Open', 'فتح')}</button>}
              {e.kind === 'task' && <button type="button" className="os-mini-ib" aria-label={tt('Delete task', 'حذف المهمة')} onClick={() => saveTasks(tasks.filter((t) => t.id !== e.id))}><Icon name="x" size={13} /></button>}
            </li>
          ))}
        </ul>
        <form className="os-cal2__add" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
          <input dir="auto" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={tt('Add a task for this day', 'ضيف مهمة للنهارده')} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={tt('Time (optional)', 'الوقت (اختياري)')} />
          <button type="submit" className="os-mini-btn is-primary" disabled={!title.trim()}>{tt('Add', 'إضافة')}</button>
        </form>
        {upcoming.length > 0 && (
          <div className="os-cal2__up">
            <h5>{tt('Coming up', 'الجاي')}</h5>
            {upcoming.map((e) => (
              <button key={e.id} type="button" onClick={() => { setDay(e.at); setCur(new Date(e.at.getFullYear(), e.at.getMonth(), 1)); }}>
                <u style={{ background: KIND_COLOR[e.kind] }} /><span dir="auto">{e.title}</span><em>{e.at.toLocaleDateString(lc, { day: 'numeric', month: 'short' })}</em>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
