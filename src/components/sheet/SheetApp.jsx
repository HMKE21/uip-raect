import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import '../../styles/css/sheet.css';
import { key, parseCell, parseRange, rangeStr, addr, MAXR, MAXC, keyR, keyC } from '../../lib/sheet/addr.js';
import { E, isErr, tokenize, shiftFormula } from '../../lib/sheet/formula.js';
import { eachCell, Rng, toStr } from '../../lib/sheet/core.js';
import { FUNCS } from '../../lib/sheet/funcs.js';
import { DEF_H, DEF_W, HDR_H, HDR_W, FONT, THEMES, drawGrid, geometry, locate, displayOf, fontOf, mergeIndex } from '../../lib/sheet/draw.js';
import { fitColumn } from '../../lib/sheet/autofit.js';
import SheetRibbon from './SheetRibbon';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mkSel = (ar, ac, r2 = ar, c2 = ac) => ({ ar, ac, r1: Math.min(ar, r2), c1: Math.min(ac, c2), r2: Math.max(ar, r2), c2: Math.max(ac, c2) });
const FN_NAMES = Object.keys(FUNCS).sort();
const THEME_KEY = 'uip.sheet.theme3';
// The editor frame is the platform's dark navy, so the grid defaults to dark; the read-only preview follows the site theme.
const loadTheme = (readOnly) => { try { const t = localStorage.getItem(THEME_KEY); if (t === 'dark' || t === 'light') return t; return readOnly ? (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light') : 'dark'; } catch { return 'dark'; } };

/** Next / previous editing position that follows Excel: jump to the edge of a data block with Ctrl+Arrow. */
function jump(wb, sheet, r, c, dr, dc) {
  const has = (rr, cc) => wb.getValue(sheet, rr, cc) !== null;
  let nr = r + dr; let nc = c + dc;
  const inb = (rr, cc) => rr >= 0 && cc >= 0 && rr < MAXR && cc < MAXC;
  if (!inb(nr, nc)) return [r, c];
  if (has(r, c) && has(nr, nc)) { while (inb(nr + dr, nc + dc) && has(nr + dr, nc + dc)) { nr += dr; nc += dc; } return [nr, nc]; }
  const lastR = Math.max(sheet.maxRow, 0); const lastC = Math.max(sheet.maxCol, 0);
  while (inb(nr, nc) && !has(nr, nc)) { if ((dr > 0 && nr > lastR) || (dc > 0 && nc > lastC)) return [dr > 0 ? Math.min(MAXR - 1, nr) : nr, dc > 0 ? Math.min(MAXC - 1, nc) : nc].map((v, i) => (i === 0 ? (dr > 0 ? Math.min(lastR + 0, MAXR - 1) : v) : (dc > 0 ? Math.min(lastC + 0, MAXC - 1) : v))); nr += dr; nc += dc; }
  return inb(nr, nc) ? [nr, nc] : [clamp(nr, 0, MAXR - 1), clamp(nc, 0, MAXC - 1)];
}

export default function SheetApp({ ctl, readOnly = false, tt, rtl, onToast }) {
  const wb = ctl.wb;
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => ctl.on(force), [ctl]);
  const [six, setSix] = useState(0);
  const sheet = wb.sheets[Math.min(six, wb.sheets.length - 1)];
  const [theme, setThemeS] = useState(() => loadTheme(readOnly));
  const setTheme = (t) => { setThemeS(t); try { localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ } };
  const [view, setView] = useState({ grid: true, head: true, showF: false, bar: true, z: 1 });
  const [sel, setSelS] = useState(() => mkSel(0, 0));
  const selRef = useRef(sel); selRef.current = sel;
  const setSel = useCallback((s) => { selRef.current = s; setSelS(s); }, []);
  const [edit, setEditS] = useState(null);
  const editRef = useRef(null); editRef.current = edit;
  const setEdit = useCallback((e) => { editRef.current = e; setEditS(e); }, []);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [menu, setMenu] = useState(null);
  const [find, setFind] = useState(null);
  const [dragUi, setDragUi] = useState(null);
  const [tabEdit, setTabEdit] = useState(null);
  const [hint, setHint] = useState('');
  const scrollRef = useRef(null); const cvRef = useRef(null); const taRef = useRef(null); const mode = useRef(null); const drawRef = useRef(null);
  const sheetSel = useRef(new Map());
  const z = view.z;

  // extents of the virtual sheet grow with the data and the cursor
  const rows = Math.max(sheet.maxRow + 40, sel.r2 + 40, 120); const cols = Math.max(sheet.maxCol + 10, sel.c2 + 8, 30);
  const geom = useMemo(() => geometry(sheet, rows, cols), [sheet, rows, cols, wb.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const hw = view.head ? HDR_W : 0; const hh = view.head ? HDR_H : 0;
  const totalW = hw + geom.cx[cols] * z + 60; const totalH = hh + geom.ry[rows] * z + 60;
  const fr = Math.min(sheet.freeze.r || 0, rows - 1); const fc = Math.min(sheet.freeze.c || 0, cols - 1); const fw = geom.cx[fc] * z; const fh = geom.ry[fr] * z;
  const X = (c) => hw + geom.cx[c] * z - (c < fc ? 0 : scroll.x); const Y = (r) => hh + geom.ry[r] * z - (r < fr ? 0 : scroll.y);

  useEffect(() => {
    const el = scrollRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ---------- drawing ---------- */
  const cutRect = ctl.clip && ctl.clip.sheet === sheet ? ctl.clip.g : null;
  useLayoutEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1; const W = size.w; const H = size.h;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`; }
    const st = { wb, sheet, geom, W, H, sx: scroll.x, sy: scroll.y, z, dpr, theme, sel, edit, showGrid: view.grid, showHead: view.head, showF: view.showF, readOnly, fillDrag: dragUi && dragUi.fill, cutRect, marching: 0 };
    drawRef.current = (extra) => drawGrid(cv, { ...st, ...extra });
    drawGrid(cv, st);
  });
  useEffect(() => {
    if (!cutRect) return undefined; let o = 0; const t = setInterval(() => { o = (o + 1) % 9; drawRef.current && drawRef.current({ marching: o }); }, 110); return () => clearInterval(t);
  }, [cutRect]);

  /* ---------- scrolling / visibility ---------- */
  const reveal = useCallback((r, c) => {
    const el = scrollRef.current; if (!el) return;
    const g = geometry(sheet, Math.max(rows, r + 40), Math.max(cols, c + 8));
    const L = g.cx[c] * z; const R = g.cx[c + 1] * z; const T = g.ry[r] * z; const B = g.ry[r + 1] * z;
    const vw = el.clientWidth - hw; const vh = el.clientHeight - hh;
    if (c >= fc) { if (L - fw < el.scrollLeft) el.scrollLeft = Math.max(0, L - fw); else if (R > el.scrollLeft + vw) el.scrollLeft = R - vw + 16; }
    if (r >= fr) { if (T - fh < el.scrollTop) el.scrollTop = Math.max(0, T - fh); else if (B > el.scrollTop + vh) el.scrollTop = B - vh + 16; }
  }, [sheet, rows, cols, z, hw, hh, fr, fc, fw, fh]);
  const moveTo = useCallback((r, c, extend = false) => {
    const s = selRef.current; const nr = clamp(r, 0, MAXR - 1); const nc = clamp(c, 0, MAXC - 1);
    setSel(extend ? mkSel(s.ar, s.ac, nr, nc) : mkSel(nr, nc));
    requestAnimationFrame(() => reveal(nr, nc));
  }, [reveal, setSel]);

  /* ---------- helpers ---------- */
  const cur = () => selRef.current;
  const rangeOf = () => { const s = cur(); return { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 }; };
  const toast = (m) => { setHint(m); if (onToast) onToast(m); setTimeout(() => setHint(''), 2500); };
  const activeText = () => wb.inputText(sheet, cur().ar, cur().ac);
  const hit = (e) => {
    const el = scrollRef.current; const b = el.getBoundingClientRect(); const px = e.clientX - b.left; const py = e.clientY - b.top;
    if (px > el.clientWidth || py > el.clientHeight) return null;
    const lx = (px - hw < fw ? px - hw : px - hw + scroll.x) / z; const ly = (py - hh < fh ? py - hh : py - hh + scroll.y) / z;
    const onCol = px < hw; const onRow = py < hh;
    const c = locate(geom.cx, Math.max(0, lx)); const r = locate(geom.ry, Math.max(0, ly));
    return { px, py, c, r, corner: view.head && onCol && onRow, colHead: view.head && onRow && !onCol, rowHead: view.head && onCol && !onRow, lx, ly };
  };
  const nearEdge = (h) => {
    if (h.colHead) { const x = X(h.c + 1); if (Math.abs(h.px - x) <= 4) return { axis: 'c', idx: h.c }; const x0 = X(h.c); if (h.c > 0 && Math.abs(h.px - x0) <= 4) return { axis: 'c', idx: h.c - 1 }; }
    if (h.rowHead) { const y = Y(h.r + 1); if (Math.abs(h.py - y) <= 4) return { axis: 'r', idx: h.r }; const y0 = Y(h.r); if (h.r > 0 && Math.abs(h.py - y0) <= 4) return { axis: 'r', idx: h.r - 1 }; }
    return null;
  };
  const onHandle = (h) => { const s = cur(); if (readOnly || editRef.current) return false; const x = X(s.c2 + 1); const y = Y(s.r2 + 1); return Math.abs(h.px - x) <= 6 && Math.abs(h.py - y) <= 6 && s.r2 - s.r1 < 5000; };

  /* ---------- editing ---------- */
  const editOn = !!edit; const editR = edit ? edit.r : -1; const editC = edit ? edit.c : -1; const editHow = edit ? edit.how : '';
  useLayoutEffect(() => { const ta = taRef.current; if (!editOn || !ta || editHow === 'bar') return; ta.focus(); const p = editRef.current ? editRef.current.caret : 0; ta.setSelectionRange(p, p); }, [editOn, editR, editC, editHow]);
  const startEdit = (text, how = 'edit', pos) => {
    if (readOnly) return; const s = cur(); const t = text ?? activeText();
    setEdit({ r: s.ar, c: s.ac, text: t, how, caret: pos ?? t.length }); requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.focus(); const p = pos ?? t.length; ta.setSelectionRange(p, p); } });
  };
  const commit = (dr = 0, dc = 0, keep = false) => {
    const ed = editRef.current; if (!ed) return;
    const s = cur(); setEdit(null);
    const prev = wb.inputText(sheet, ed.r, ed.c);
    if (ed.text !== prev) ctl.input(sheet, ed.r, ed.c, ed.text);
    if (keep) return;
    // Enter inside a multi-cell selection cycles through it, like Excel
    if (s.r1 !== s.r2 || s.c1 !== s.c2) {
      let nr = s.ar + dr; let nc = s.ac + dc;
      if (nr > s.r2) { nr = s.r1; nc += 1; } if (nr < s.r1) { nr = s.r2; nc -= 1; } if (nc > s.c2) { nc = s.c1; nr += 1; } if (nc < s.c1) { nc = s.c2; nr -= 1; }
      setSel({ ...s, ar: clamp(nr, s.r1, s.r2), ac: clamp(nc, s.c1, s.c2) }); requestAnimationFrame(() => scrollRef.current?.focus()); return;
    }
    moveTo(ed.r + dr, ed.c + dc); requestAnimationFrame(() => scrollRef.current?.focus());
  };
  const cancel = () => { setEdit(null); requestAnimationFrame(() => scrollRef.current?.focus()); };
  const canPoint = (t, caret) => { if (!t || t[0] !== '=') return false; const p = t.slice(0, caret).replace(/\s+$/, ''); return p === '=' || /[(,+\-*/^&=<>:;{]$/.test(p); };
  const insertRef = (text) => {
    const ed = editRef.current; const ta = taRef.current; const caret = ta ? ta.selectionStart : ed.caret;
    const pt = ed.pt && ed.pt.at === caret ? ed.pt : null; const start = pt ? pt.start : caret; const end = pt ? pt.end : caret;
    const nt = ed.text.slice(0, start) + text + ed.text.slice(end); const np = start + text.length;
    setEdit({ ...ed, text: nt, caret: np, pt: { start, end: np, at: np } }); requestAnimationFrame(() => { const t2 = taRef.current; if (t2) { t2.focus(); t2.setSelectionRange(np, np); } });
  };
  const refText = (g) => `${sheet === wb.sheets[six] ? '' : ''}${rangeStr(g)}`;

  /* ---------- pointer ---------- */
  const onDown = (e) => {
    if (e.button === 2) return;
    const h = hit(e); if (!h) return; scrollRef.current.focus({ preventScroll: true }); setMenu(null);
    const ed = editRef.current;
    if (ed && !h.colHead && !h.rowHead && !h.corner) {
      const ta = taRef.current; const caret = ta ? ta.selectionStart : ed.caret;
      if (canPoint(ed.text, caret) || (ed.pt && ed.pt.at === caret)) { mode.current = { t: 'point', r: h.r, c: h.c }; insertRef(rangeStr({ r1: h.r, c1: h.c, r2: h.r, c2: h.c })); e.preventDefault(); scrollRef.current.setPointerCapture(e.pointerId); return; }
      commit(0, 0, true);
    }
    scrollRef.current.setPointerCapture(e.pointerId);
    if (h.corner) { setSel({ ar: 0, ac: 0, r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }); return; }
    const edge = nearEdge(h);
    if (edge && !readOnly) { const orig = edge.axis === 'c' ? (sheet.colW.get(edge.idx) ?? DEF_W) : (sheet.rowH.get(edge.idx) ?? DEF_H); const s = cur(); const group = edge.axis === 'c' ? (edge.idx >= s.c1 && edge.idx <= s.c2 ? Array.from({ length: s.c2 - s.c1 + 1 }, (_, i) => s.c1 + i) : [edge.idx]) : (edge.idx >= s.r1 && edge.idx <= s.r2 ? Array.from({ length: s.r2 - s.r1 + 1 }, (_, i) => s.r1 + i) : [edge.idx]); mode.current = { t: 'resize', edge, orig, start: edge.axis === 'c' ? h.px : h.py, group, olds: group.map((i) => (edge.axis === 'c' ? sheet.colW.get(i) : sheet.rowH.get(i))) }; return; }
    if (onHandle(h)) { mode.current = { t: 'fill', src: rangeOf() }; return; }
    if (h.colHead) { const s = cur(); const a = e.shiftKey ? s.ac : h.c; setSel({ ar: 0, ac: e.shiftKey ? s.ac : h.c, r1: 0, r2: MAXR - 1, c1: Math.min(a, h.c), c2: Math.max(a, h.c) }); mode.current = { t: 'cols', a }; return; }
    if (h.rowHead) { const s = cur(); const a = e.shiftKey ? s.ar : h.r; setSel({ ar: e.shiftKey ? s.ar : h.r, ac: 0, c1: 0, c2: MAXC - 1, r1: Math.min(a, h.r), r2: Math.max(a, h.r) }); mode.current = { t: 'rows', a }; return; }
    const m = mergeIndex(sheet).get(key(h.r, h.c));
    if (e.shiftKey) { const s = cur(); setSel(mkSel(s.ar, s.ac, h.r, h.c)); } else if (e.ctrlKey || e.metaKey) { setSel(mkSel(h.r, h.c)); } else if (m) setSel({ ar: m.r1, ac: m.c1, r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }); else setSel(mkSel(h.r, h.c));
    mode.current = { t: 'cells' };
  };
  const onMove = (e) => {
    const md = mode.current; const el = scrollRef.current;
    if (!md) { const h = hit(e); if (h) { const edge = nearEdge(h); el.style.cursor = edge ? (edge.axis === 'c' ? 'col-resize' : 'row-resize') : onHandle(h) ? 'crosshair' : h.colHead || h.rowHead ? 'pointer' : 'cell'; } return; }
    const h = hit({ clientX: e.clientX, clientY: e.clientY }) || null; const b = el.getBoundingClientRect();
    // auto-scroll while dragging beyond the edges
    const dx = e.clientX < b.left + hw ? -20 : e.clientX > b.right - 20 ? 20 : 0; const dy = e.clientY < b.top + hh ? -20 : e.clientY > b.bottom - 20 ? 20 : 0;
    if (md.t !== 'resize' && (dx || dy)) { el.scrollLeft += dx; el.scrollTop += dy; }
    const px = clamp(e.clientX - b.left, hw, el.clientWidth - 1); const py = clamp(e.clientY - b.top, hh, el.clientHeight - 1);
    const c = locate(geom.cx, (px - hw < fw ? px - hw : px - hw + el.scrollLeft) / z); const r = locate(geom.ry, (py - hh < fh ? py - hh : py - hh + el.scrollTop) / z);
    void h;
    if (md.t === 'cells') { const s = cur(); if (s.r2 !== r || s.c2 !== c || s.ar !== s.r1) setSel(mkSel(s.ar, s.ac, r, c)); } else if (md.t === 'cols') { const s = cur(); setSel({ ...s, c1: Math.min(md.a, c), c2: Math.max(md.a, c) }); } else if (md.t === 'rows') { const s = cur(); setSel({ ...s, r1: Math.min(md.a, r), r2: Math.max(md.a, r) }); } else if (md.t === 'point') {
      const g = { r1: Math.min(md.r, r), c1: Math.min(md.c, c), r2: Math.max(md.r, r), c2: Math.max(md.c, c) }; insertRef(rangeStr(g));
    } else if (md.t === 'resize') {
      const d = ((md.edge.axis === 'c' ? e.clientX - b.left : e.clientY - b.top) - md.start) / z; const nv = Math.max(md.edge.axis === 'c' ? 12 : 8, Math.round(md.orig + d));
      md.group.forEach((i) => { if (md.edge.axis === 'c') { sheet.colW.set(i, nv); sheet.manualW.add(i); } else sheet.rowH.set(i, nv); }); md.val = nv; wb.version += 1; force();
    } else if (md.t === 'fill') {
      const s0 = md.src; let dst = null;
      if (r > s0.r2 && Math.abs(r - s0.r2) >= Math.abs(c - s0.c2) * 0.6 || (r > s0.r2 && c >= s0.c1 && c <= s0.c2)) dst = { r1: s0.r2 + 1, r2: r, c1: s0.c1, c2: s0.c2 };
      else if (r < s0.r1 && c >= s0.c1 && c <= s0.c2) dst = { r1: r, r2: s0.r1 - 1, c1: s0.c1, c2: s0.c2 };
      else if (c > s0.c2) dst = { c1: s0.c2 + 1, c2: c, r1: s0.r1, r2: s0.r2 };
      else if (c < s0.c1) dst = { c1: c, c2: s0.c1 - 1, r1: s0.r1, r2: s0.r2 };
      md.dst = dst; setDragUi(dst ? { fill: { r1: Math.min(s0.r1, dst.r1), c1: Math.min(s0.c1, dst.c1), r2: Math.max(s0.r2, dst.r2), c2: Math.max(s0.c2, dst.c2) } } : null);
    }
  };
  const onUp = (e) => {
    const md = mode.current; mode.current = null; try { scrollRef.current.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!md) return;
    if (md.t === 'resize') { md.group.forEach((i, k) => { if (md.edge.axis === 'c') { if (md.olds[k] === undefined) sheet.colW.delete(i); else sheet.colW.set(i, md.olds[k]); } else if (md.olds[k] === undefined) sheet.rowH.delete(i); else sheet.rowH.set(i, md.olds[k]); }); if (md.val) { if (md.edge.axis === 'c') ctl.setColW(sheet, md.group, md.val); else ctl.setRowH(sheet, md.group, md.val); } }
    if (md.t === 'fill') { setDragUi(null); if (md.dst) { ctl.fill(sheet, md.src, md.dst); setSel(mkSel(Math.min(md.src.r1, md.dst.r1), Math.min(md.src.c1, md.dst.c1), Math.max(md.src.r2, md.dst.r2), Math.max(md.src.c2, md.dst.c2))); } }
    if (md.t === 'point') requestAnimationFrame(() => taRef.current?.focus());
  };
  const autofit = (axis, idx) => {
    if (axis === 'c') { const s = cur(); const cols = idx >= s.c1 && idx <= s.c2 && s.c2 > s.c1 ? Array.from({ length: s.c2 - s.c1 + 1 }, (_, i) => s.c1 + i) : [idx]; cols.forEach((c) => { const w = fitColumn(wb, sheet, c); ctl.setColW(sheet, [c], w, true); }); return; }
    const cv = document.createElement('canvas').getContext('2d');
    { let mh = DEF_H; for (let c = 0; c <= Math.min(sheet.maxCol, 200); c += 1) { const d = displayOf(wb, sheet, idx, c, false); if (d.st.wrap && d.text) { cv.font = fontOf(d.st, 1); const w = sheet.colW.get(c) ?? DEF_W; const lines = Math.ceil(cv.measureText(d.text).width / Math.max(10, w - 8)); mh = Math.max(mh, lines * 19 + 5); } else if (d.st.fs) mh = Math.max(mh, d.st.fs * 1.333 * 1.3 + 6); } ctl.setRowH(sheet, [idx], mh > DEF_H ? Math.ceil(mh) : null); }
  };
  const onDbl = (e) => {
    const h = hit(e); if (!h) return; const edge = nearEdge(h); if (edge && !readOnly) { autofit(edge.axis, edge.idx); return; }
    if (h.colHead || h.rowHead || h.corner) return;
    if (!readOnly) { const m = mergeIndex(sheet).get(key(h.r, h.c)); if (m) setSel({ ar: m.r1, ac: m.c1, r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }); else setSel(mkSel(h.r, h.c)); const t = wb.inputText(sheet, h.r, h.c); setEdit({ r: m ? m.r1 : h.r, c: m ? m.c1 : h.c, text: t, how: 'edit', caret: t.length }); requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(t.length, t.length); } }); }
  };
  const onCtx = (e) => {
    e.preventDefault(); const h = hit(e); if (!h) return; const s = cur();
    if (!(h.r >= s.r1 && h.r <= s.r2 && h.c >= s.c1 && h.c <= s.c2) || h.colHead || h.rowHead) {
      if (h.colHead) setSel({ ar: 0, ac: h.c, r1: 0, r2: MAXR - 1, c1: h.c, c2: h.c }); else if (h.rowHead) setSel({ ar: h.r, ac: 0, c1: 0, c2: MAXC - 1, r1: h.r, r2: h.r }); else if (!h.corner) setSel(mkSel(h.r, h.c));
    }
    setMenu({ x: e.clientX, y: e.clientY, kind: h.colHead ? 'col' : h.rowHead ? 'row' : 'cell' });
  };

  /* ---------- actions (used by ribbon, menu and keyboard) ---------- */
  const A = {
    sheet, sel, edit, view, theme, wb, ctl, readOnly, autofit,
    setView: (p) => setView((v) => ({ ...v, ...p })), setTheme,
    range: rangeOf,
    style: (patch) => { if (editRef.current) commit(0, 0, true); ctl.style(sheet, rangeOf(), patch); },
    toggle: (prop) => ctl.toggle(sheet, rangeOf(), prop),
    borders: (m, st, col) => ctl.borders(sheet, rangeOf(), m, st, col),
    merge: (on = true) => ctl.merge(sheet, rangeOf(), on),
    clear: (what) => ctl.clear(sheet, rangeOf(), what),
    copy: async (cut = false) => { const t = ctl.copy(sheet, rangeOf(), cut); try { await navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } force(); },
    paste: async (modeP = 'all') => {
      const s = cur(); let text; try { text = await navigator.clipboard.readText(); } catch { text = undefined; }
      if (ctl.clip && (text === undefined || text === ctl.clip.tsv)) { const g = ctl.paste(sheet, s.r1, s.c1, { mode: modeP }); if (g) setSel({ ar: g.r1, ac: g.c1, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }); } else if (text) { const g = ctl.paste(sheet, s.r1, s.c1, { text }); if (g) setSel({ ar: g.r1, ac: g.c1, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }); } else toast(tt('Clipboard access was blocked — use Ctrl+V.', 'الحافظة محجوبة — استخدم Ctrl+V.'));
    },
    undo: () => { const s = ctl.undo(); if (s) { const i = wb.sheets.indexOf(s); if (i >= 0) setSix(i); } }, redo: () => { const s = ctl.redo(); if (s) { const i = wb.sheets.indexOf(s); if (i >= 0) setSix(i); } },
    fillDown: () => { const s = cur(); if (s.r1 === s.r2) return; ctl.fill(sheet, { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c2 }, { r1: s.r1 + 1, c1: s.c1, r2: s.r2, c2: s.c2 }); },
    fillRight: () => { const s = cur(); if (s.c1 === s.c2) return; ctl.fill(sheet, { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c1 }, { r1: s.r1, c1: s.c1 + 1, r2: s.r2, c2: s.c2 }); },
    insertRows: () => { const s = cur(); ctl.insert(sheet, 'r', s.r1, s.r2 - s.r1 + 1); }, deleteRows: () => { const s = cur(); ctl.remove(sheet, 'r', s.r1, s.r2 - s.r1 + 1); },
    insertCols: () => { const s = cur(); ctl.insert(sheet, 'c', s.c1, s.c2 - s.c1 + 1); }, deleteCols: () => { const s = cur(); ctl.remove(sheet, 'c', s.c1, s.c2 - s.c1 + 1); },
    hide: (axis, on) => { const s = cur(); const idx = axis === 'r' ? Array.from({ length: s.r2 - s.r1 + 1 }, (_, i) => s.r1 + i) : Array.from({ length: s.c2 - s.c1 + 1 }, (_, i) => s.c1 + i); ctl.hide(sheet, axis, idx, on); },
    unhideAll: () => { ctl.hide(sheet, 'r', [...sheet.hiddenRows], false); ctl.hide(sheet, 'c', [...sheet.hiddenCols], false); },
    sort: (asc) => {
      const s = cur(); let g = { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 };
      if (s.r1 === s.r2 && s.c1 === s.c2) { let r1 = s.ar; let r2 = s.ar; while (r1 > 0 && wb.getValue(sheet, r1 - 1, s.ac) !== null) r1 -= 1; while (r2 < sheet.maxRow && wb.getValue(sheet, r2 + 1, s.ac) !== null) r2 += 1; let c1 = s.ac; let c2 = s.ac; while (c1 > 0 && wb.getValue(sheet, s.ar, c1 - 1) !== null) c1 -= 1; while (c2 < sheet.maxCol && wb.getValue(sheet, s.ar, c2 + 1) !== null) c2 += 1; g = { r1, c1, r2, c2 }; setSel({ ...mkSel(g.r1, g.c1, g.r2, g.c2), ar: s.ar, ac: s.ac }); }
      const hdr = typeof wb.getValue(sheet, g.r1, s.ac) === 'string' && g.r2 > g.r1 && typeof wb.getValue(sheet, g.r1 + 1, s.ac) === 'number';
      ctl.sort(sheet, g, s.ac, asc, hdr);
    },
    autoSum: () => {
      const s = cur(); if (editRef.current) return;
      if (s.r1 === s.r2 && s.c1 === s.c2) { let r = s.ar - 1; while (r >= 0 && typeof wb.getValue(sheet, r, s.ac) === 'number') r -= 1; if (r === s.ar - 1) { let c = s.ac - 1; while (c >= 0 && typeof wb.getValue(sheet, s.ar, c) === 'number') c -= 1; if (c === s.ac - 1) { startEdit('=SUM()', 'edit', 5); return; } ctl.input(sheet, s.ar, s.ac, `=SUM(${rangeStr({ r1: s.ar, c1: c + 1, r2: s.ar, c2: s.ac - 1 })})`); return; } ctl.input(sheet, s.ar, s.ac, `=SUM(${rangeStr({ r1: r + 1, c1: s.ac, r2: s.ar - 1, c2: s.ac })})`); return; }
      const ks = []; const w = s.c2 - s.c1 + 1; const h = s.r2 - s.r1 + 1; void ks;
      ctl.run(sheet, Array.from({ length: w }, (_, i) => key(s.r2 + 1, s.c1 + i)), () => { for (let i = 0; i < w; i += 1) wb.setFormula(sheet, s.r2 + 1, s.c1 + i, `SUM(${rangeStr({ r1: s.r1, c1: s.c1 + i, r2: s.r2, c2: s.c1 + i })})`); }); void h;
    },
    insertFn: (name) => { if (editRef.current) { const ed = editRef.current; const t = ed.text[0] === '=' ? ed.text + name + '(' : `=${name}(`; setEdit({ ...ed, text: t, caret: t.length }); requestAnimationFrame(() => taRef.current?.focus()); } else startEdit(`=${name}()`, 'edit', name.length + 2); },
    goto: (txt) => {
      const t = txt.trim(); const nm = wb.names.get(t.toUpperCase());
      if (nm && nm.ref) { const i = wb.sheets.findIndex((s) => s.name === nm.ref.sheet); if (i >= 0) setSix(i); setSel(mkSel(nm.ref.r1, nm.ref.c1, nm.ref.r2, nm.ref.c2)); requestAnimationFrame(() => reveal(nm.ref.r1, nm.ref.c1)); return true; }
      let body = t; let sh = null; const m = /^(?:'([^']+)'|([\w.]+))!(.+)$/.exec(t); if (m) { sh = wb.sheetByName(m[1] || m[2]); body = m[3]; if (!sh) return false; }
      const g = parseRange(body); if (!g) return false;
      if (sh) setSix(wb.sheets.indexOf(sh));
      const wholeCol = /^\$?[A-Za-z]+:\$?[A-Za-z]+$/.test(body); const wholeRow = /^\$?\d+:\$?\d+$/.test(body);
      setSel({ ar: g.r1, ac: g.c1, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, ...(wholeCol || wholeRow ? {} : {}) }); requestAnimationFrame(() => reveal(g.r1, g.c1)); return true;
    },
    defineName: (name) => { const s = cur(); wb.names.set(name.toUpperCase(), { name, ref: { sheet: sheet.name, r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 } }); wb.touch(); ctl.emit(); },
    openFind: (replace = false) => setFind((f) => ({ q: f?.q || '', rep: f?.rep || '', replace, cs: f?.cs || false, whole: f?.whole || false, scope: f?.scope || 'sheet', n: 0 })),
    freeze: (r, c) => ctl.freeze(sheet, r, c),
    activeText, startEdit,
  };

  /* ---------- keyboard (grid focus) ---------- */
  const onKey = (e) => {
    if (editRef.current) return;
    const s = cur(); const k = e.key; const ctrl = e.ctrlKey || e.metaKey; const shift = e.shiftKey;
    const nav = (dr, dc) => {
      e.preventDefault(); const ext = shift;
      const base = ext ? [s.ar === s.r1 ? s.r2 : s.r1, s.ac === s.c1 ? s.c2 : s.c1] : [s.ar, s.ac];
      let [nr, nc] = ctrl ? jump(wb, sheet, base[0], base[1], dr, dc) : [base[0] + dr, base[1] + dc];
      const skip = (rr, cc) => (dr && sheet.hiddenRows.has(rr)) || (dc && sheet.hiddenCols.has(cc));
      while (skip(nr, nc) && nr > 0 && nc > 0 && nr < MAXR - 1) { nr += dr; nc += dc; }
      moveTo(nr, nc, ext);
    };
    if (k === 'ArrowDown') return nav(1, 0); if (k === 'ArrowUp') return nav(-1, 0); if (k === 'ArrowLeft') return nav(0, -1); if (k === 'ArrowRight') return nav(0, 1);
    if (k === 'PageDown') { e.preventDefault(); return moveTo(s.ar + 20, s.ac, shift); } if (k === 'PageUp') { e.preventDefault(); return moveTo(s.ar - 20, s.ac, shift); }
    if (k === 'Home') { e.preventDefault(); return ctrl ? moveTo(0, 0, shift) : moveTo(s.ar, 0, shift); }
    if (k === 'End' && ctrl) { e.preventDefault(); return moveTo(sheet.maxRow, sheet.maxCol, shift); }
    if (k === 'Tab') { e.preventDefault(); return shift ? moveTo(s.ar, s.ac - 1) : moveTo(s.ar, s.ac + 1); }
    if (k === 'Enter') {
      e.preventDefault(); if (readOnly) return moveTo(s.ar + 1, s.ac);
      if (ctrl) return startEdit(activeText(), 'edit'); // Ctrl+Enter on a selection with typed text is handled in the editor
      if (s.r1 !== s.r2 || s.c1 !== s.c2) { const nr = s.ar + (shift ? -1 : 1); return setSel({ ...s, ar: nr > s.r2 ? s.r1 : nr < s.r1 ? s.r2 : nr, ac: nr > s.r2 ? (s.ac + 1 > s.c2 ? s.c1 : s.ac + 1) : s.ac }); }
      return moveTo(s.ar + (shift ? -1 : 1), s.ac);
    }
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 'a') { e.preventDefault(); if (s.r1 === 0 && s.c1 === 0 && s.r2 >= sheet.maxRow && s.c2 >= sheet.maxCol) return setSel({ ar: 0, ac: 0, r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }); return setSel({ ar: s.ar, ac: s.ac, r1: 0, c1: 0, r2: Math.max(sheet.maxRow, 0), c2: Math.max(sheet.maxCol, 0) }); }
      if (lk === 'c') { e.preventDefault(); return A.copy(false); } if (lk === 'x' && !readOnly) { e.preventDefault(); return A.copy(true); }
      if (lk === 'f') { e.preventDefault(); return A.openFind(false); } if (lk === 'h' && !readOnly) { e.preventDefault(); return A.openFind(true); }
      if (lk === 'g') { e.preventDefault(); const t = window.prompt(tt('Go to (e.g. B12 or A1:C9):', 'اذهب إلى (مثال B12 أو A1:C9):')); if (t) A.goto(t); return null; }
      if (readOnly) return null;
      if (lk === 'z') { e.preventDefault(); return shift ? A.redo() : A.undo(); } if (lk === 'y') { e.preventDefault(); return A.redo(); }
      if (lk === 'b') { e.preventDefault(); return A.toggle('b'); } if (lk === 'i') { e.preventDefault(); return A.toggle('i'); } if (lk === 'u') { e.preventDefault(); return A.toggle('u'); } if (k === '5') { e.preventDefault(); return A.toggle('st'); }
      if (lk === 'd') { e.preventDefault(); return A.fillDown(); } if (lk === 'r') { e.preventDefault(); return A.fillRight(); }
      if (k === ';') { e.preventDefault(); const d = new Date(); const t = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; return ctl.input(sheet, s.ar, s.ac, shift ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : t); }
      if (k === '`') { e.preventDefault(); return A.setView({ showF: !view.showF }); }
      if (k === '1') { e.preventDefault(); return A.setView({ dialog: 'format' }); }
      if (k === ' ') { e.preventDefault(); return shift ? setSel({ ...s, r1: 0, c1: s.c1, r2: MAXR - 1, c2: s.c2, ar: 0 }) : setSel({ ...s, c1: s.c1, c2: s.c2, r1: 0, r2: MAXR - 1, ar: 0 }); }
      if (k === '-') { e.preventDefault(); return (s.r1 === 0 && s.r2 >= MAXR - 1) ? A.deleteCols() : (s.c1 === 0 && s.c2 >= MAXC - 1) ? A.deleteRows() : setMenu({ x: 200, y: 200, kind: 'cell' }); }
      if (k === '+' || k === '=') { e.preventDefault(); return (s.r1 === 0 && s.r2 >= MAXR - 1) ? A.insertCols() : (s.c1 === 0 && s.c2 >= MAXC - 1) ? A.insertRows() : setMenu({ x: 200, y: 200, kind: 'cell' }); }
      return null;
    }
    if (k === ' ' && shift) { e.preventDefault(); return setSel({ ar: s.ar, ac: 0, r1: s.r1, r2: s.r2, c1: 0, c2: MAXC - 1 }); }
    if (readOnly) return null;
    if (k === 'F2') { e.preventDefault(); return startEdit(activeText(), 'edit'); }
    if (k === 'F4') { e.preventDefault(); return null; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return A.clear('contents'); }
    if (e.altKey && k === '=') { e.preventDefault(); return A.autoSum(); }
    if (k === 'Escape') { if (ctl.clip) { ctl.clip = null; force(); } return null; }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); return startEdit(k, 'enter'); }
    return null;
  };
  const onPaste = (e) => {
    if (editRef.current || readOnly) return; e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const s = cur();
    const g = ctl.paste(sheet, s.r1, s.c1, { text }); if (g) setSel({ ar: g.r1, ac: g.c1, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });
  };

  /* ---------- editor textarea ---------- */
  const onEditKey = (e) => {
    e.stopPropagation();
    const ed = editRef.current; const ta = e.target;
    if (e.key === 'Escape') { e.preventDefault(); return cancel(); }
    if (e.key === 'Enter') { if (e.altKey) { e.preventDefault(); const p = ta.selectionStart; setEdit({ ...ed, text: `${ed.text.slice(0, p)}\n${ed.text.slice(ta.selectionEnd)}`, caret: p + 1 }); requestAnimationFrame(() => ta.setSelectionRange(p + 1, p + 1)); return null; } e.preventDefault(); if (e.ctrlKey || e.metaKey) { commit(0, 0, true); const s = cur(); if (s.r1 !== s.r2 || s.c1 !== s.c2) ctl.inputRange(sheet, rangeOf(), ed.text); return null; } return commit(e.shiftKey ? -1 : 1, 0); }
    if (e.key === 'Tab') { e.preventDefault(); const ac = suggest(ed.text, ta.selectionStart); if (ac.length && !e.shiftKey) { pickFn(ac[0]); return null; } return commit(0, e.shiftKey ? -1 : 1); }
    if (ed.how === 'enter' && !ed.text.startsWith('=')) { const mv = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]; if (mv) { e.preventDefault(); return commit(mv[0], mv[1]); } }
    if (ed.how === 'enter' && ed.text.startsWith('=') && canPoint(ed.text, ta.selectionStart) && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault(); const d = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]; const base = ed.ptCell || [ed.r, ed.c]; const nr = clamp(base[0] + d[0], 0, MAXR - 1); const nc = clamp(base[1] + d[1], 0, MAXC - 1);
      insertRef(addr(nr, nc)); setEdit({ ...editRef.current, ptCell: [nr, nc] }); return null;
    }
    if (e.key === 'F4') { e.preventDefault(); const p = ta.selectionStart; const m = /(\$?[A-Za-z]{1,3}\$?\d+)$/.exec(ed.text.slice(0, p)) || /(\$?[A-Za-z]{1,3}\$?\d+)/.exec(ed.text.slice(Math.max(0, p - 12))); if (m) { const old = m[1]; const mm = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(old); const nxt = [`$${mm[2]}$${mm[4]}`, `${mm[2]}$${mm[4]}`, `$${mm[2]}${mm[4]}`, `${mm[2]}${mm[4]}`][mm[1] && mm[3] ? 1 : !mm[1] && mm[3] ? 2 : mm[1] && !mm[3] ? 3 : 0]; const st = ed.text.lastIndexOf(old, p); setEdit({ ...ed, text: ed.text.slice(0, st) + nxt + ed.text.slice(st + old.length) }); } return null; }
    return null;
  };
  const suggest = (text, caret) => { if (!text || text[0] !== '=') return []; const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text.slice(0, caret)); if (!m || /[0-9]$/.test(m[1]) && /^[A-Za-z]{1,3}\d+$/.test(m[1])) return []; const u = m[1].toUpperCase(); return FN_NAMES.filter((n) => n.startsWith(u) && n !== u).slice(0, 8); };
  const pickFn = (name) => { const ed = editRef.current; const ta = taRef.current; const caret = ta ? ta.selectionStart : ed.caret; const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(ed.text.slice(0, caret)); const st = caret - m[1].length; const t = `${ed.text.slice(0, st)}${name}(${ed.text.slice(caret)}`; const p = st + name.length + 1; setEdit({ ...ed, text: t, caret: p }); requestAnimationFrame(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(p, p); }); };

  /* ---------- selection stats ---------- */
  const stats = useMemo(() => {
    const s = sel; const area = (s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1); if (area <= 1 && !(sheet.cells.get(key(s.ar, s.ac)))) return null;
    let n = 0; let cnt = 0; let sum = 0; let mn = Infinity; let mx = -Infinity;
    eachCell({ wb }, new Rng(sheet, s.r1, s.c1, Math.min(s.r2, sheet.maxRow), Math.min(s.c2, sheet.maxCol)), (v) => { if (v === null) return; cnt += 1; if (typeof v === 'number') { n += 1; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; } });
    return { n, cnt, sum, mn, mx, avg: n ? sum / n : 0 };
  }, [sel, sheet, wb.version]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- find ---------- */
  const matches = useMemo(() => {
    if (!find || !find.q) return [];
    const out = []; const q = find.cs ? find.q : find.q.toLowerCase();
    const sheets = find.scope === 'book' ? wb.sheets : [sheet];
    for (const sh of sheets) {
      const ks = [...sh.cells.keys()].sort((a, b) => a - b);
      for (const k of ks) { const r = keyR(k); const c = keyC(k); const d = displayOf(wb, sh, r, c, false).text; const t = find.cs ? d : d.toLowerCase(); if (find.whole ? t === q : t.includes(q)) out.push({ sh, r, c }); }
    }
    return out;
  }, [find, sheet, wb.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const gotoMatch = (i) => { if (!matches.length) return; const m = matches[(i + matches.length) % matches.length]; setFind((f) => ({ ...f, n: (i + matches.length) % matches.length })); const si = wb.sheets.indexOf(m.sh); if (si !== six) setSix(si); setSel(mkSel(m.r, m.c)); requestAnimationFrame(() => reveal(m.r, m.c)); };
  const replaceAll = () => {
    if (!find.q || !matches.length) return; let n = 0;
    const rx = new RegExp(find.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), find.cs ? 'g' : 'gi');
    const bySheet = new Map(); matches.forEach((m) => { if (!bySheet.has(m.sh)) bySheet.set(m.sh, []); bySheet.get(m.sh).push(m); });
    for (const [sh, list] of bySheet) ctl.run(sh, list.map((m) => key(m.r, m.c)), () => { list.forEach((m) => { const cell = sh.cells.get(key(m.r, m.c)); if (!cell) return; if (cell.f) { const nf = cell.f.replace(rx, find.rep); if (nf !== cell.f) { cell.f = nf; n += 1; } } else if (typeof cell.v === 'string') { const nv = find.whole ? find.rep : cell.v.replace(rx, find.rep); wb.setInput(sh, m.r, m.c, nv); n += 1; } }); });
    toast(tt(`Replaced ${n}.`, `تم استبدال ${n}.`));
  };

  /* ---------- layout bits ---------- */
  const T = THEMES[theme];
  const ab = { x: X(sel.ac), y: Y(sel.ar) };
  const merged = mergeIndex(sheet).get(key(edit ? edit.r : sel.ar, edit ? edit.c : sel.ac));
  const eb = edit ? (() => { const m = mergeIndex(sheet).get(key(edit.r, edit.c)); const x = X(m ? m.c1 : edit.c); const y = Y(m ? m.r1 : edit.r); return { x, y, w: X((m ? m.c2 : edit.c) + 1) - x, h: Y((m ? m.r2 : edit.r) + 1) - y }; })() : null;
  void ab; void merged;
  const est = edit ? displayOf(wb, sheet, edit.r, edit.c, false).st : {};
  const sugg = edit ? suggest(edit.text, edit.caret) : [];
  const nameBox = sel.r1 === sel.r2 && sel.c1 === sel.c2 ? addr(sel.ar, sel.ac) : (sel.r2 - sel.r1 + 1 >= MAXR ? `${addr(0, sel.c1).replace(/\d+/, '')}:${addr(0, sel.c2).replace(/\d+/, '')}` : sel.c2 - sel.c1 + 1 >= MAXC ? `${sel.r1 + 1}:${sel.r2 + 1}` : `${sel.r2 - sel.r1 + 1}R x ${sel.c2 - sel.c1 + 1}C`);
  const fxText = edit ? edit.text : activeText();
  const cell = sheet.cells.get(key(sel.ar, sel.ac)); const ast = cell ? wb.styles[cell.s] || {} : {};
  void tokenize; void shiftFormula; void toStr; void FONT; void E; void isErr; void parseCell; void refText; void T; void setSix;

  return (
    <div className={`sx sx--${theme}`} dir="ltr" data-rtl={rtl ? '1' : undefined}>
      {!readOnly && <SheetRibbon A={A} tt={tt} rtl={rtl} state={{ ast, sel, canUndo: ctl.canUndo, canRedo: ctl.canRedo, clip: !!ctl.clip }} />}
      {view.bar && (
        <div className="sx__fx">
          <input className="sx__name" aria-label={tt('Name box', 'مربع الاسم')} defaultValue={nameBox} key={nameBox} onKeyDown={(e) => { if (e.key === 'Enter') { const ok = A.goto(e.target.value); if (!ok && /^[A-Za-z_][\w.]*$/.test(e.target.value) && !readOnly) { A.defineName(e.target.value); } scrollRef.current?.focus(); } if (e.key === 'Escape') scrollRef.current?.focus(); }} onFocus={(e) => e.target.select()} />
          <span className="sx__fxl" title={tt('Insert function', 'إدراج دالة')}>fx</span>
          <input className="sx__fxin" dir="auto" spellCheck={false} value={fxText} readOnly={readOnly}
            onFocus={() => { if (!editRef.current && !readOnly) setEdit({ r: sel.ar, c: sel.ac, text: activeText(), how: 'bar', caret: activeText().length }); }}
            onChange={(e) => setEdit({ ...(editRef.current || { r: sel.ar, c: sel.ac, how: 'bar' }), text: e.target.value, caret: e.target.selectionStart })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(1, 0); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } }} />
        </div>
      )}
      <div className="sx__body">
        <div className="sx__grid" ref={scrollRef} tabIndex={0} onKeyDown={onKey} onPaste={onPaste} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDbl} onContextMenu={onCtx}
          onScroll={(e) => setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })}
          onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setView((v) => ({ ...v, z: clamp(Math.round((v.z - Math.sign(e.deltaY) * 0.1) * 10) / 10, 0.4, 3) })); } }}>
          <div style={{ width: totalW, height: totalH, pointerEvents: 'none' }} />
          <canvas ref={cvRef} className="sx__cv" style={{ left: 0, top: 0, transform: `translate(${scroll.x}px, ${scroll.y}px)` }} />
          {edit && eb && (
            <div className="sx__ed" style={{ left: eb.x + scroll.x, top: eb.y + scroll.y, minWidth: eb.w, minHeight: eb.h }}>
              <textarea ref={taRef} className="sx__ta" dir="auto" spellCheck={false} value={edit.text} rows={Math.max(1, edit.text.split('\n').length)}
                style={{ font: fontOf(est, z), color: est.color || T.fg, background: T.bg, minWidth: eb.w, minHeight: eb.h, width: `${Math.max(eb.w, Math.min(600, edit.text.length * 8 * z + 30))}px`, textAlign: est.al === 'right' || (est.al === undefined && /^[-+]?[\d.,]+%?$/.test(edit.text)) ? 'right' : est.al === 'center' ? 'center' : 'left' }}
                onChange={(e) => setEdit({ ...editRef.current, text: e.target.value, caret: e.target.selectionStart, pt: null, ptCell: null })} onKeyDown={onEditKey}
                onSelect={(e) => { const ed = editRef.current; if (ed && ed.caret !== e.target.selectionStart) setEdit({ ...ed, caret: e.target.selectionStart }); }}
                onBlur={() => { /* clicking the grid / formula bar keeps the edit alive; commit happens via pointer handlers */ }} />
              {sugg.length > 0 && <ul className="sx__ac">{sugg.map((n) => <li key={n}><button type="button" onMouseDown={(e) => { e.preventDefault(); pickFn(n); }}>{n}</button></li>)}</ul>}
            </div>
          )}
        </div>
        {find && (
          <div className="sx__find" role="dialog" aria-label={tt('Find', 'بحث')}>
            <div className="sx__frow"><input autoFocus value={find.q} placeholder={tt('Find', 'بحث')} onChange={(e) => setFind({ ...find, q: e.target.value, n: 0 })} onKeyDown={(e) => { if (e.key === 'Enter') gotoMatch(find.n + (e.shiftKey ? -1 : 1)); if (e.key === 'Escape') setFind(null); }} />
              <span className="sx__cnt">{matches.length ? `${Math.min(find.n + 1, matches.length)}/${matches.length}` : find.q ? '0' : ''}</span>
              <button type="button" onClick={() => gotoMatch(find.n - 1)} aria-label={tt('Previous', 'السابق')}>▲</button><button type="button" onClick={() => gotoMatch(find.n + 1)} aria-label={tt('Next', 'التالي')}>▼</button>
              <button type="button" onClick={() => setFind(null)} aria-label={tt('Close', 'إغلاق')}>✕</button></div>
            {find.replace && !readOnly && <div className="sx__frow"><input value={find.rep} placeholder={tt('Replace with', 'استبدال بـ')} onChange={(e) => setFind({ ...find, rep: e.target.value })} /><button type="button" onClick={replaceAll}>{tt('Replace all', 'استبدال الكل')}</button></div>}
            <div className="sx__frow sx__fopts">
              <label><input type="checkbox" checked={find.cs} onChange={(e) => setFind({ ...find, cs: e.target.checked })} />{tt('Match case', 'حساسية الحروف')}</label>
              <label><input type="checkbox" checked={find.whole} onChange={(e) => setFind({ ...find, whole: e.target.checked })} />{tt('Entire cell', 'الخلية كاملة')}</label>
              <label><input type="checkbox" checked={find.scope === 'book'} onChange={(e) => setFind({ ...find, scope: e.target.checked ? 'book' : 'sheet' })} />{tt('Whole workbook', 'المصنف كله')}</label>
            </div>
          </div>
        )}
        {menu && <CtxMenu menu={menu} A={A} tt={tt} readOnly={readOnly} close={() => setMenu(null)} />}
      </div>
      <div className="sx__status">
        <div className="sx__tabs" role="tablist">
          {wb.sheets.map((s, i) => (
            <span key={s.name + i} className={`sx__tab${i === six ? ' is-on' : ''}`} role="tab" aria-selected={i === six}
              onClick={() => { sheetSel.current.set(six, sel); setSix(i); setSel(sheetSel.current.get(i) || mkSel(0, 0)); setEdit(null); }}
              onDoubleClick={() => !readOnly && setTabEdit({ i, text: s.name })}
              onContextMenu={(e) => { e.preventDefault(); if (readOnly) return; setMenu({ x: e.clientX, y: e.clientY - 120, kind: 'tab', i }); }}>
              {tabEdit && tabEdit.i === i ? <input autoFocus value={tabEdit.text} onChange={(e) => setTabEdit({ ...tabEdit, text: e.target.value })} onBlur={() => { ctl.renameSheet(s, tabEdit.text); setTabEdit(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setTabEdit(null); }} /> : s.name}
            </span>
          ))}
          {!readOnly && <button type="button" className="sx__addtab" aria-label={tt('New sheet', 'ورقة جديدة')} onClick={() => { let n = wb.sheets.length + 1; while (wb.sheetByName(`Sheet${n}`)) n += 1; ctl.addSheet(`Sheet${n}`); setSix(wb.sheets.length - 1); setSel(mkSel(0, 0)); }}>+</button>}
        </div>
        <span className="sx__sp" />
        {hint && <span className="sx__hint">{hint}</span>}
        {wb.circular && <span className="sx__warn">{tt('Circular reference', 'مرجع دائري')}</span>}
        {stats && <span className="sx__stats">{stats.n > 0 ? `${tt('Average', 'المتوسط')}: ${+stats.avg.toFixed(6)}   ${tt('Count', 'العدد')}: ${stats.cnt}   ${tt('Sum', 'المجموع')}: ${+stats.sum.toFixed(6)}` : `${tt('Count', 'العدد')}: ${stats.cnt}`}</span>}
        <span className="sx__zoom"><button type="button" aria-label="−" onClick={() => setView((v) => ({ ...v, z: clamp(Math.round((v.z - 0.1) * 10) / 10, 0.4, 3) }))}>−</button><input type="range" min="40" max="300" step="10" value={Math.round(z * 100)} aria-label={tt('Zoom', 'تكبير')} onChange={(e) => setView((v) => ({ ...v, z: +e.target.value / 100 }))} /><button type="button" aria-label="+" onClick={() => setView((v) => ({ ...v, z: clamp(Math.round((v.z + 0.1) * 10) / 10, 0.4, 3) }))}>+</button><span>{Math.round(z * 100)}%</span></span>
      </div>
    </div>
  );
}

function CtxMenu({ menu, A, tt, readOnly, close }) {
  const sel = A.sel; const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); }; window.addEventListener('pointerdown', h, true); return () => window.removeEventListener('pointerdown', h, true); }, [close]);
  const go = (fn) => () => { close(); fn(); };
  const sep = <li className="sx__msep" role="separator" />;
  const item = (label, fn, dis) => <li><button type="button" disabled={dis} onClick={go(fn)}>{label}</button></li>;
  let items;
  if (menu.kind === 'tab') {
    const s = A.wb.sheets[menu.i];
    items = [item(tt('Rename', 'إعادة تسمية'), () => A.ctl.renameSheet(s, window.prompt(tt('Sheet name', 'اسم الورقة'), s.name) || s.name)), item(tt('Delete', 'حذف'), () => { if (window.confirm(tt('Delete this sheet?', 'حذف الورقة؟'))) A.ctl.deleteSheet(s); }, A.wb.sheets.length < 2)];
  } else {
    const rowsSel = sel.c1 === 0 && sel.c2 >= MAXC - 1; const colsSel = sel.r1 === 0 && sel.r2 >= MAXR - 1;
    items = [
      item(tt('Cut', 'قص'), () => A.copy(true), readOnly), item(tt('Copy', 'نسخ'), () => A.copy(false)), item(tt('Paste', 'لصق'), () => A.paste('all'), readOnly),
      item(tt('Paste values only', 'لصق القيم فقط'), () => A.paste('values'), readOnly || !A.ctl.clip), item(tt('Paste formats only', 'لصق التنسيق فقط'), () => A.paste('formats'), readOnly || !A.ctl.clip), sep,
      ...(menu.kind !== 'cell' || rowsSel || colsSel ? [] : [item(tt('Insert row above', 'إدراج صف أعلى'), A.insertRows, readOnly), item(tt('Insert column left', 'إدراج عمود يسار'), A.insertCols, readOnly), item(tt('Delete rows', 'حذف الصفوف'), A.deleteRows, readOnly), item(tt('Delete columns', 'حذف الأعمدة'), A.deleteCols, readOnly)]),
      ...(menu.kind === 'row' || rowsSel ? [item(tt('Insert rows', 'إدراج صفوف'), A.insertRows, readOnly), item(tt('Delete rows', 'حذف الصفوف'), A.deleteRows, readOnly), item(tt('Hide rows', 'إخفاء الصفوف'), () => A.hide('r', true), readOnly), item(tt('Unhide all', 'إظهار الكل'), A.unhideAll, readOnly)] : []),
      ...(menu.kind === 'col' || colsSel ? [item(tt('Insert columns', 'إدراج أعمدة'), A.insertCols, readOnly), item(tt('Delete columns', 'حذف الأعمدة'), A.deleteCols, readOnly), item(tt('Hide columns', 'إخفاء الأعمدة'), () => A.hide('c', true), readOnly), item(tt('Unhide all', 'إظهار الكل'), A.unhideAll, readOnly)] : []),
      sep, item(tt('Clear contents', 'مسح المحتوى'), () => A.clear('contents'), readOnly), item(tt('Clear formats', 'مسح التنسيق'), () => A.clear('formats'), readOnly),
      item(tt('Sort A → Z', 'ترتيب تصاعدي'), () => A.sort(true), readOnly), item(tt('Sort Z → A', 'ترتيب تنازلي'), () => A.sort(false), readOnly),
    ];
  }
  const style = { left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 40 * items.length) };
  return <ul ref={ref} className="sx__menu" style={{ position: 'fixed', ...style }} role="menu">{items.map((it, i) => <Fragment key={i}>{it}</Fragment>)}</ul>;
}
