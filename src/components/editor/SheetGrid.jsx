import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import { Btn } from './EditorUI';
import { colName, MAX_COLS, THEMES, themeById, loadTheme, saveTheme } from '../../lib/officeFmt/xlsx';
import '../../styles/css/editor.css';
import '../../styles/css/office.css';

const ROW_H = 30;
const OVERSCAN = 12;
const MIN_ROWS = 100; // like Excel, an empty sheet shows a full canvas of cells; typing into them grows the data
const MIN_COLS = 26;
const padGrid = (src, readOnly) => {
  if (readOnly) return src;
  const w = Math.min(MAX_COLS, Math.max(MIN_COLS, (src[0]?.length || 1) + 5)); const h = Math.max(MIN_ROWS, src.length + 30);
  return Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => src[r]?.[c] ?? ''));
};
/** Drops the empty tail (rows / columns) so the padding never becomes data. */
const trimGrid = (n) => {
  let h = n.length; while (h > 1 && n[h - 1].every((v) => (v ?? '') === '')) h -= 1;
  const rows = n.slice(0, h); let w = rows[0]?.length || 1;
  while (w > 1 && rows.every((r) => (r[w - 1] ?? '') === '')) w -= 1;
  return rows.map((r) => r.slice(0, w));
};
const num = (s) => (s !== '' && /^-?\d+(\.\d+)?$/.test(String(s).trim()) ? Number(s) : null);

/**
 * Spreadsheet-style grid (virtualised). Controlled: `cells` (string[][]) + `onChange(nextCells)`.
 * Header row (row 1) is styled as the header; row numbers, column letters, sort, find, add/delete rows & columns,
 * column auto-widths, arrow / Tab / Enter navigation, copy / paste of ranges from Excel.
 */
function SheetGrid({ theme, onTheme, cells: src, onChange: emit, tt, rtl, undo, redo, canUndo, canRedo, readOnly = false, extraTools = null }) {
  const cells = useMemo(() => padGrid(src, readOnly), [src, readOnly]);
  const onChange = useCallback((n) => emit(readOnly ? n : trimGrid(n)), [emit, readOnly]);
  const [localTheme, setLocalTheme] = useState(loadTheme);
  const T = themeById(theme ?? localTheme);
  const pickTheme = (id) => { saveTheme(id); setLocalTheme(id); onTheme?.(id); };
  const vars = { '--xg-bg': T.bg, '--xg-fg': T.fg, '--xg-head': T.head, '--xg-head-fg': T.headFg, '--xg-head-on': T.headOn, '--xg-head-on-fg': T.headOnFg, '--xg-hd-bg': T.hdBg, '--xg-hd-fg': T.hdFg, '--xg-band': T.band || 'transparent', '--xg-line': T.line, ...(T.accent ? { '--ed-accent': T.accent } : {}) };
  const hasHeader = cells[0].some((v) => (v ?? '') !== '');
  const [sel, setSel] = useState({ r: 0, c: 0, r2: 0, c2: 0 });
  const [edit, setEdit] = useState(null); // { r, c, v }
  const [find, setFind] = useState('');
  const [widths, setWidths] = useState({});
  const [scroll, setScroll] = useState({ top: 0, h: 600 });
  const [sort, setSort] = useState(null); // { c, dir }
  const [noHeader, setNoHeader] = useState(false);
  const wrap = useRef(null);
  const rows = cells.length;
  const cols = cells[0]?.length || 1;

  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const on = () => setScroll({ top: el.scrollTop, h: el.clientHeight });
    on(); el.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on); ro.observe(el);
    return () => { el.removeEventListener('scroll', on); ro.disconnect(); };
  }, []);

  // default widths from content
  const autoW = useMemo(() => Array.from({ length: cols }, (_, c) => {
    let m = 4;
    for (let r = 0; r < Math.min(rows, 150); r += 1) m = Math.max(m, String(cells[r][c] ?? '').length);
    return Math.min(320, Math.max(80, m * 8.2 + 22));
  }), [cells, cols, rows]);
  const wOf = (c) => widths[c] ?? autoW[c];

  const set = useCallback((fn) => { const next = cells.map((r) => r.slice()); fn(next); onChange(next); }, [cells, onChange]);
  const commit = useCallback(() => { if (!edit) return; if (cells[edit.r]?.[edit.c] !== edit.v) set((n) => { n[edit.r][edit.c] = edit.v; }); setEdit(null); }, [edit, cells, set]);

  const move = (dr, dc, extend = false) => setSel((s) => {
    const r = Math.max(0, Math.min(rows - 1, (extend ? s.r2 : s.r) + dr)); const c = Math.max(0, Math.min(cols - 1, (extend ? s.c2 : s.c) + dc));
    return extend ? { ...s, r2: r, c2: c } : { r, c, r2: r, c2: c };
  });
  const rect = { r1: Math.min(sel.r, sel.r2), r2: Math.max(sel.r, sel.r2), c1: Math.min(sel.c, sel.c2), c2: Math.max(sel.c, sel.c2) };
  const inSel = (r, c) => r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;

  // keep the active cell in view
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    if (sel.r === 0 && sel.r2 === rows - 1 && rows > 1) return; // whole-column selection must not jump to the bottom
    const top = (sel.r2 + 1) * ROW_H; const vh = el.clientHeight - ROW_H;
    if (top - ROW_H < el.scrollTop) el.scrollTop = top - ROW_H; else if (top > el.scrollTop + vh) el.scrollTop = top - vh;
  }, [sel.r2, sel.c2]);

  const onKey = (e) => {
    if (edit) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); move(e.shiftKey ? -1 : 1, 0); } else if (e.key === 'Tab') { e.preventDefault(); commit(); move(0, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') setEdit(null);
      return;
    }
    const mod = e.ctrlKey || e.metaKey; const k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)?.(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo?.(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel({ r: 0, c: 0, r2: rows - 1, c2: cols - 1 }); return; }
    if (mod && k.toLowerCase() === 'c') return; // native copy handler
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, rtl ? 1 : -1], ArrowRight: [0, rtl ? -1 : 1] }[k];
    if (d) { e.preventDefault(); move(d[0], d[1], e.shiftKey); return; }
    if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Home') { e.preventDefault(); setSel({ r: sel.r, c: 0, r2: sel.r, c2: 0 }); return; }
    if (k === 'PageDown') { e.preventDefault(); move(Math.floor(scroll.h / ROW_H) - 1, 0); return; }
    if (k === 'PageUp') { e.preventDefault(); move(-(Math.floor(scroll.h / ROW_H) - 1), 0); return; }
    if (readOnly) return;
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); setEdit({ r: sel.r, c: sel.c, v: cells[sel.r][sel.c] }); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); set((n) => { for (let r = rect.r1; r <= rect.r2; r += 1) for (let c = rect.c1; c <= rect.c2; c += 1) n[r][c] = ''; }); return; }
    if (!mod && k.length === 1) { setEdit({ r: sel.r, c: sel.c, v: k }); e.preventDefault(); }
  };

  const onCopy = (e) => {
    if (edit) return;
    const t = []; for (let r = rect.r1; r <= rect.r2; r += 1) t.push(cells[r].slice(rect.c1, rect.c2 + 1).join('\t'));
    e.clipboardData.setData('text/plain', t.join('\n')); e.preventDefault();
  };
  const onCut = (e) => { if (readOnly) return; onCopy(e); set((n) => { for (let r = rect.r1; r <= rect.r2; r += 1) for (let c = rect.c1; c <= rect.c2; c += 1) n[r][c] = ''; }); };
  const onPaste = (e) => {
    if (edit || readOnly) return;
    const text = e.clipboardData.getData('text/plain'); if (!text) return; e.preventDefault();
    const block = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    set((n) => {
      const needC = Math.min(MAX_COLS, sel.c + Math.max(...block.map((b) => b.length)));
      block.forEach((line, i) => {
        const r = rect.r1 + i; while (n.length <= r) n.push(Array.from({ length: n[0].length }, () => ''));
        line.forEach((v, j) => { const c = rect.c1 + j; if (c >= MAX_COLS) return; for (const row of n) while (row.length < needC) row.push(''); n[r][c] = v; });
      });
    });
  };

  const addRow = (at) => set((n) => { n.splice(at, 0, Array.from({ length: cols }, () => '')); });
  const delRows = () => { if (rows - (rect.r2 - rect.r1 + 1) < 1) return; set((n) => { n.splice(rect.r1, rect.r2 - rect.r1 + 1); }); setSel((s) => ({ ...s, r: Math.min(s.r, rows - 2), r2: Math.min(s.r, rows - 2) })); };
  const addCol = (at) => { if (cols >= MAX_COLS) return; set((n) => { n.forEach((r) => r.splice(at, 0, '')); }); };
  const delCols = () => { if (cols - (rect.c2 - rect.c1 + 1) < 1) return; set((n) => { n.forEach((r) => r.splice(rect.c1, rect.c2 - rect.c1 + 1)); }); setSel((s) => ({ ...s, c: Math.min(s.c, cols - 2), c2: Math.min(s.c, cols - 2) })); };
  const doSort = (c, dir) => {
    setSort({ c, dir });
    set((n) => {
      const start = noHeader ? 0 : 1; const body = n.slice(start);
      body.sort((a, b) => { const x = a[c]; const y = b[c]; if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1; const nx = num(x); const ny = num(y); const cmp = nx !== null && ny !== null ? nx - ny : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }); return dir === 'asc' ? cmp : -cmp; });
      n.splice(start, body.length, ...body);
    });
  };

  const q = find.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (let r = 0; r < rows && out.length < 5000; r += 1) for (let c = 0; c < cols; c += 1) if (String(cells[r][c]).toLowerCase().includes(q)) out.push([r, c]);
    return out;
  }, [q, cells, rows, cols]);
  const hitSet = useMemo(() => new Set(hits.map(([r, c]) => `${r}:${c}`)), [hits]);
  const hitIdx = useRef(-1);
  useEffect(() => { hitIdx.current = -1; }, [q]);
  const nextHit = (dir = 1) => { if (!hits.length) return; hitIdx.current = (hitIdx.current + dir + hits.length) % hits.length; const [r, c] = hits[hitIdx.current]; setSel({ r, c, r2: r, c2: c }); };

  const first = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((scroll.top + scroll.h) / ROW_H) + OVERSCAN);
  const gutter = Math.max(44, String(rows).length * 9 + 22);
  const total = cells.length * ROW_H;
  const sums = useMemo(() => { // status: count / sum / avg of the selected numbers
    let n = 0; let s = 0; let cnt = 0;
    for (let r = rect.r1; r <= rect.r2 && cnt < 100000; r += 1) for (let c = rect.c1; c <= rect.c2; c += 1) { cnt += 1; const v = num(cells[r]?.[c]); if (v !== null) { n += 1; s += v; } }
    return n > 1 ? { n, s, avg: s / n } : null;
  }, [cells, rect.r1, rect.r2, rect.c1, rect.c2]);

  const drag = useRef(false);
  const startResize = (e, c) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = wOf(c); const dir = rtl ? -1 : 1;
    const mv = (ev) => setWidths((w) => ({ ...w, [c]: Math.max(40, w0 + (ev.clientX - x0) * dir) }));
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const tableW = gutter + Array.from({ length: cols }).reduce((a, _, c) => a + wOf(c), 0);

  return (
    <div className="xg" data-theme={T.id} style={vars}>
      <div className="ed__top xg__tools">
        {extraTools}
        <Btn icon="ed-undo" onClick={undo} disabled={!canUndo} title={tt('Undo (Ctrl+Z)', 'تراجع (Ctrl+Z)')} />
        <Btn icon="ed-redo" onClick={redo} disabled={!canRedo} title={tt('Redo (Ctrl+Y)', 'إعادة (Ctrl+Y)')} />
        <span className="ed__sep" />
        {!readOnly && (<>
          <Btn icon="ed-row-plus" label={tt('Row', 'صف')} onClick={() => addRow(rect.r2 + 1)} title={tt('Insert row below', 'إضافة صف بعد المحدد')} />
          <Btn icon="trash" onClick={delRows} title={tt('Delete selected rows', 'حذف الصفوف المحددة')} className="ed__btn--danger" />
          <Btn icon="ed-col-plus" label={tt('Column', 'عمود')} onClick={() => addCol(rect.c2 + 1)} title={tt('Insert column after', 'إضافة عمود بعد المحدد')} />
          <Btn icon="trash" onClick={delCols} title={tt('Delete selected columns', 'حذف الأعمدة المحددة')} className="ed__btn--danger" />
          <span className="ed__sep" />
        </>)}
        <Btn icon="ed-align-left" label="A→Z" onClick={() => doSort(sel.c, 'asc')} title={tt('Sort column ascending', 'ترتيب تصاعدي')} disabled={readOnly} />
        <Btn icon="ed-align-right" label="Z→A" onClick={() => doSort(sel.c, 'desc')} title={tt('Sort column descending', 'ترتيب تنازلي')} disabled={readOnly} />
        <label className="xg__chk"><input type="checkbox" checked={noHeader} onChange={(e) => setNoHeader(e.target.checked)} />{tt('No header row', 'بدون صف عناوين')}</label>
        <label className="xg__theme" title={tt('Theme', 'الثيم')}>
          <i style={{ background: T.swatch }} />
          <select value={T.id} onChange={(e) => pickTheme(e.target.value)} aria-label={tt('Theme', 'الثيم')}>
            {THEMES.map((x) => <option key={x.id} value={x.id}>{tt(x.en, x.ar)}</option>)}
          </select>
        </label>
        <span className="ed__sp" />
        <div className="xg__find">
          <input value={find} placeholder={tt('Find…', 'بحث…')} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextHit(e.shiftKey ? -1 : 1); } }} />
          {q && <span className="ed__pagecount">{hits.length}{hits.length >= 5000 ? '+' : ''}</span>}
          <Btn icon="chevron-up" onClick={() => nextHit(-1)} disabled={!hits.length} />
          <Btn icon="chevron-down" onClick={() => nextHit(1)} disabled={!hits.length} />
        </div>
      </div>
      <div className="xg__formula" dir="auto">
        <span className="xg__ref">{colName(sel.c)}{sel.r + 1}</span>
        <input value={edit ? edit.v : (cells[sel.r]?.[sel.c] ?? '')} readOnly={readOnly}
          onFocus={() => { if (!edit && !readOnly) setEdit({ r: sel.r, c: sel.c, v: cells[sel.r][sel.c] }); }}
          onChange={(e) => setEdit({ r: sel.r, c: sel.c, v: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); wrap.current?.focus(); } else if (e.key === 'Escape') { setEdit(null); wrap.current?.focus(); } }}
          onBlur={() => { if (edit && !document.activeElement?.classList?.contains('xg__in')) commit(); }} />
      </div>
      <div className="xg__scroll" ref={wrap} tabIndex={0} onKeyDown={onKey} onCopy={onCopy} onCut={onCut} onPaste={onPaste} dir={rtl ? 'rtl' : 'ltr'}>
        <div style={{ width: tableW, height: total + ROW_H, position: 'relative' }}>
          <div className="xg__row xg__row--head" style={{ top: 0, height: ROW_H, width: tableW }}>
            <div className="xg__corner" style={{ width: gutter }} onClick={() => setSel({ r: 0, c: 0, r2: rows - 1, c2: cols - 1 })} />
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className={`xg__colh${c >= rect.c1 && c <= rect.c2 ? ' is-on' : ''}`} style={{ width: wOf(c) }}
                onPointerDown={(e) => { if (e.button === 0) setSel({ r: 0, c, r2: rows - 1, c2: c }); }}>
                {colName(c)}{sort?.c === c && <Icon name={sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={11} />}
                <i className="xg__rz" onPointerDown={(e) => startResize(e, c)} onDoubleClick={() => setWidths((w) => { const n = { ...w }; delete n[c]; return n; })} />
              </div>
            ))}
          </div>
          {Array.from({ length: last - first }).map((_, i) => {
            const r = first + i; const row = cells[r];
            return (
              <div key={r} className={`xg__row${r === 0 && !noHeader && hasHeader ? ' xg__row--hd' : ''}${r > 0 && r % 2 === 1 && T.band ? ' xg__row--alt' : ''}`} style={{ top: ROW_H + r * ROW_H, height: ROW_H, width: tableW }}>
                <div className={`xg__rowh${r >= rect.r1 && r <= rect.r2 ? ' is-on' : ''}`} style={{ width: gutter }} onPointerDown={(e) => { if (e.button === 0) setSel({ r, c: 0, r2: r, c2: cols - 1 }); }}>{r + 1}</div>
                {row.map((v, c) => {
                  const active = r === sel.r && c === sel.c;
                  const isEd = edit && edit.r === r && edit.c === c;
                  const n = num(v);
                  return (
                    <div key={c} className={`xg__cell${inSel(r, c) ? ' is-sel' : ''}${active ? ' is-active' : ''}${hitSet.has(`${r}:${c}`) ? ' is-hit' : ''}${n !== null ? ' is-num' : ''}`} style={{ width: wOf(c) }}
                      onPointerDown={(e) => { if (e.button !== 0) return; if (edit) commit(); drag.current = true; if (e.shiftKey) setSel((s) => ({ ...s, r2: r, c2: c })); else setSel({ r, c, r2: r, c2: c }); wrap.current?.focus({ preventScroll: true }); }}
                      onPointerEnter={() => { if (drag.current) setSel((s) => ({ ...s, r2: r, c2: c })); }}
                      onPointerUp={() => { drag.current = false; }}
                      onDoubleClick={() => { if (!readOnly) setEdit({ r, c, v }); }}>
                      {isEd
                        ? <input className="xg__in" autoFocus dir="auto" value={edit.v} onChange={(e) => setEdit({ ...edit, v: e.target.value })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') { onKey(e); wrap.current?.focus(); } e.stopPropagation(); }} />
                        : <span dir="auto">{v}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="xg__status">
        <span>{rows.toLocaleString()} {tt('rows', 'صف')} × {cols} {tt('columns', 'عمود')}</span>
        {sums && <span>{tt('Selected', 'المحدد')}: {sums.n} · Σ {+sums.s.toFixed(4)} · {tt('avg', 'متوسط')} {+sums.avg.toFixed(4)}</span>}
      </div>
    </div>
  );
}

export default memo(SheetGrid);
