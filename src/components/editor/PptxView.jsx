import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OfficeShell from './OfficeShell';
import { Btn } from './EditorUI';
import useDocHistory from './useDocHistory';
import { loadPptx, savePptx } from '../../lib/officeFmt/pptx';
import '../../styles/css/office.css';

const ALIGN = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };
const FONT = "'Segoe UI', Tahoma, 'Noto Naskh Arabic', Arial, sans-serif";

function Para({ p, cx, over }) {
  const cq = (sz) => `${((sz / 100) * 12700 / cx) * 100}cqw`;
  const first = p.runs.find((r) => r.t !== '\n') || {};
  const rtl = p.rtl;
  const hang = (p.mar || (p.bullet ? 342900 : 0)) / cx * 100;
  return (
    <div className="px__p" dir={rtl ? 'rtl' : 'ltr'} style={{ fontSize: cq(p.sz), textAlign: ALIGN[p.algn] || (rtl ? 'right' : 'left'), paddingInlineStart: `${hang + p.lvl * 3}cqw`, textIndent: p.bullet ? `${-hang * 0.0 }cqw` : 0, minHeight: '1.15em', lineHeight: 1.2, position: 'relative' }}>
      {p.bullet && <span style={{ position: 'absolute', insetInlineStart: `${p.lvl * 3 + Math.max(0, hang - 2.2)}cqw` }}>{p.bullet === '#' ? '•' : p.bullet}</span>}
      {over !== undefined
        ? <span style={{ fontWeight: first.b ? 700 : undefined, fontStyle: first.i ? 'italic' : undefined, color: first.color || undefined }}>{over}</span>
        : p.runs.map((r, i) => (r.t === '\n' ? <br key={i} /> : <span key={i} style={{ fontSize: r.sz ? cq(r.sz) : undefined, fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? 'italic' : undefined, textDecoration: [r.u && 'underline', r.st && 'line-through'].filter(Boolean).join(' ') || undefined, color: r.color || undefined, fontFamily: r.font && !r.font.startsWith('+') ? `'${r.font}', ${FONT}` : undefined }}>{r.t}</span>))}
    </div>
  );
}

function TextBlock({ text, cx, over }) {
  return text.paras.map((p, i) => <Para key={i} p={p} cx={cx} over={over?.[i]} />);
}

const Slide = memo(function Slide({ slide, deck, edits, editable, onEdit, wide }) {
  const { cx, cy } = deck; const [open, setOpen] = useState(null);
  const pc = (v, d) => `${(v / d) * 100}%`;
  const box = (s) => ({ left: pc(s.x, cx), top: pc(s.y, cy), width: pc(s.w, cx), height: pc(s.h, cy), transform: s.rot ? `rotate(${s.rot}deg)` : undefined });
  const color = (c) => (c ? undefined : undefined);
  return (
    <div className="px__slide" style={{ width: wide || '100%', aspectRatio: `${cx} / ${cy}`, containerType: 'inline-size', background: slide.bg, color: slide.fg, fontFamily: FONT }}>
      {slide.shapes.map((s, i) => {
        if (s.kind === 'pic') return <div key={i} className="px__sh" style={box(s)}><img src={s.url} alt={s.alt} draggable={false} /></div>;
        if (s.kind === 'table') {
          return (
            <div key={i} className="px__sh" style={box(s)}>
              <table><colgroup>{s.cols.map((w, c) => <col key={c} style={{ width: pc(w, s.cols.reduce((a, b) => a + b, 0) || 1) }} />)}</colgroup>
                <tbody>{s.rows.map((r, ri) => (
                  <tr key={ri} style={{ height: pc(r.h, s.h || 1) }}>{r.cells.map((c, ci) => c.skip ? null : (
                    <td key={ci} colSpan={c.span} rowSpan={c.rspan} style={{ background: c.fill || (s.firstRow && ri === 0 ? s.accent : undefined), color: s.firstRow && ri === 0 && !c.fill ? '#fff' : undefined, fontWeight: s.firstRow && ri === 0 ? 700 : undefined }}>
                      {editable && c.k !== null && open === `${i}:${ri}:${ci}`
                        ? <Editor value={(edits[`${slide.index}:${c.k}`] || c.text.paras.map((p) => p.text)).join('\n')} sz={c.text.paras[0]?.sz} cx={cx} onDone={(v) => { setOpen(null); onEdit(`${slide.index}:${c.k}`, v.split('\n'), c.text.paras.map((p) => p.text)); }} />
                        : <div onClick={() => editable && c.k !== null && setOpen(`${i}:${ri}:${ci}`)} style={{ cursor: editable ? 'text' : undefined }}><TextBlock text={c.text} cx={cx} over={edits[`${slide.index}:${c.k}`]} /></div>}
                    </td>))}</tr>))}</tbody></table>
            </div>
          );
        }
        const key = s.k !== null ? `${slide.index}:${s.k}` : null; const over = key ? edits[key] : undefined;
        const st = { ...box(s), background: s.fill || undefined, border: s.line ? `${Math.max(1, cx / 1e6)}px solid ${s.line}` : undefined, borderRadius: s.geom === 'ellipse' ? '50%' : s.geom === 'roundRect' ? '8%' : undefined, display: 'flex', flexDirection: 'column', justifyContent: { t: 'flex-start', ctr: 'center', b: 'flex-end' }[s.text?.anchor] || 'flex-start', padding: s.text ? `${(s.text.ins[1] / cy) * 100 * (cy / cx)}cqw ${(s.text.ins[2] / cx) * 100}cqw ${(s.text.ins[3] / cy) * 100 * (cy / cx)}cqw ${(s.text.ins[0] / cx) * 100}cqw` : 0 };
        const editing = open === String(i);
        return (
          <div key={i} className={`px__sh${editable && s.editable ? ' is-text' : ''}`} style={st} onClick={() => editable && s.editable && key && !editing && setOpen(String(i))}>
            {s.text && (editing
              ? <Editor value={(over || s.text.paras.map((p) => p.text)).join('\n')} sz={s.text.paras[0]?.sz} cx={cx} onDone={(v) => { setOpen(null); onEdit(key, v.split('\n'), s.text.paras.map((p) => p.text)); }} />
              : <TextBlock text={s.text} cx={cx} over={over} />)}
          </div>
        );
      })}
    </div>
  );
});

function Editor({ value, sz, cx, onDone }) {
  const ref = useRef(null);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }, []);
  return <textarea ref={ref} className="px__tx" defaultValue={value} dir="auto" style={{ fontSize: `${((sz || 1800) / 100 * 12700 / cx) * 100}cqw`, lineHeight: 1.2, resize: 'none', border: '2px solid #3b82f6', background: 'rgba(255,255,255,.92)', color: '#111', padding: '0.4cqw', margin: 0, font: 'inherit', fontSize: `${((sz || 1800) / 100 * 12700 / cx) * 100}cqw`, overflow: 'hidden' }}
    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }} onBlur={(e) => onDone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.target.value = value; e.target.blur(); } e.stopPropagation(); }} onClick={(e) => e.stopPropagation()} />;
}

function useDeck(blob) {
  const [s, setS] = useState({ status: 'loading' });
  useEffect(() => {
    let dead = false; let d = null;
    blob.arrayBuffer().then(loadPptx).then((x) => { d = x; if (dead) x.revoke(); else setS({ status: 'ready', deck: x }); }).catch((e) => !dead && setS({ status: 'error', msg: e?.message || String(e) }));
    return () => { dead = true; d?.revoke(); };
  }, [blob]);
  return s;
}

/** Read-only slide list for the file viewer. */
export function PptxPreview({ blob, tt }) {
  const s = useDeck(blob);
  if (s.status === 'loading') return <p className="st-fv__empty">{tt('Loading…', 'جارٍ التحميل…')}</p>;
  if (s.status === 'error') return <p className="st-fv__empty">{s.msg}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      {s.deck.slides.map((sl) => <div key={sl.index} style={{ width: 'min(900px, 100%)' }}><Slide slide={sl} deck={s.deck} edits={{}} /></div>)}
    </div>
  );
}

/** Slide editor: thumbnails + stage; click any text to edit it. Everything else in the file is preserved on save. */
export default function PptxView({ blob, fileName, tt, rtl, guardRef, onSave, onClose }) {
  const s = useDeck(blob); const h = useDocHistory({}); const [cur, setCur] = useState(0);
  const onEdit = useCallback((key, texts, orig) => {
    const same = texts.length === orig.length && texts.every((t, i) => t === orig[i]);
    const next = { ...h.value }; if (same) delete next[key]; else next[key] = texts;
    if (JSON.stringify(next) !== JSON.stringify(h.value)) h.set(next);
  }, [h]);
  const build = useCallback(async () => savePptx(s.deck, h.value), [s, h.value]);
  if (s.status === 'loading') return <div className="ed ed--center"><span className="st-fv-spinner" /><p className="ed__hint">{tt('Opening the presentation…', 'جارٍ فتح العرض…')}</p></div>;
  if (s.status === 'error') return <div className="ed ed--center"><p className="ed__err">{s.msg}</p><Btn label={tt('Close', 'إغلاق')} onClick={onClose} /></div>;
  const { deck } = s; const slide = deck.slides[cur];
  const tools = (
    <div className="ed__top">
      <Btn icon="ed-undo" onClick={h.undo} disabled={!h.canUndo} title={tt('Undo', 'تراجع')} /><Btn icon="ed-redo" onClick={h.redo} disabled={!h.canRedo} title={tt('Redo', 'إعادة')} />
      <span className="ed__sep" /><span className="ed__pagecount">{cur + 1} / {deck.slides.length}</span>
      <Btn icon={rtl ? 'chevron-right' : 'chevron-left'} onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} />
      <Btn icon={rtl ? 'chevron-left' : 'chevron-right'} onClick={() => setCur((c) => Math.min(deck.slides.length - 1, c + 1))} disabled={cur >= deck.slides.length - 1} />
      <span className="ed__hint">{tt('Click any text on the slide to edit it.', 'اضغط على أي نص في الشريحة لتعديله.')}</span>
    </div>
  );
  return (
    <OfficeShell fileName={fileName} tt={tt} guardRef={guardRef} onSave={onSave} onClose={onClose} dirty={h.dirty} build={build} onSaved={h.markSaved} tools={tools}>
      <div className="px">
        <div className="px__thumbs">{deck.slides.map((sl, i) => (
          <button key={i} type="button" className={`px__thumb${i === cur ? ' is-on' : ''}`} onClick={() => setCur(i)} aria-label={`${tt('Slide', 'شريحة')} ${i + 1}`}><Slide slide={sl} deck={deck} edits={h.value} /><b>{i + 1}</b></button>
        ))}</div>
        <div className="px__stage"><div style={{ width: 'min(1000px, 100%)', margin: 'auto' }}><Slide key={cur} slide={slide} deck={deck} edits={h.value} editable onEdit={onEdit} /></div></div>
      </div>
    </OfficeShell>
  );
}
