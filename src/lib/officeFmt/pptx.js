/**
 * PowerPoint (.pptx) reader + text writer, without touching the rest of the package.
 *   loadPptx(arrayBuffer) -> { files, cx, cy, slides: [{ index, path, bg, shapes }], revoke() }
 *   savePptx(deck, edits)  -> Blob     edits: { "<slideIdx>:<textBodyIdx>": string[] (paragraph texts) }
 * Only the paragraphs whose text changed are rewritten (the first run keeps its formatting); everything else in the
 * file — shapes, themes, animations, notes, media — is copied as it was.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, n) => (el ? Array.from(el.children).filter((c) => !n || c.localName === n) : []);
const kid = (el, n) => kids(el, n)[0] || null;
const walk = (el, ...names) => names.reduce((e, n) => (e ? kid(e, n) : null), el);
const at = (el, n) => (el ? el.getAttribute(n) : null);
const num = (v, d = 0) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const resolve = (base, target) => {
  if (/^https?:/i.test(target)) return null;
  const parts = (target.startsWith('/') ? target.slice(1) : `${base.slice(0, base.lastIndexOf('/') + 1)}${target}`).split('/');
  const out = []; parts.forEach((p) => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
  return out.join('/');
};
const relsOf = (files, path) => {
  const rp = `${path.slice(0, path.lastIndexOf('/') + 1)}_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`;
  const f = files[rp]; const map = {};
  if (f) Array.from(parseXml(strFromU8(f)).getElementsByTagName('Relationship')).forEach((r) => { map[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', target: resolve(path, r.getAttribute('Target') || '') }; });
  return map;
};

/* ---- colours */
const SCHEME = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
function themeColors(files) {
  const f = files['ppt/theme/theme1.xml']; const out = {};
  if (!f) return out;
  const cs = Array.from(parseXml(strFromU8(f)).getElementsByTagNameNS('*', 'clrScheme'))[0];
  kids(cs).forEach((c) => { const v = kid(c); out[c.localName] = v.localName === 'sysClr' ? `#${at(v, 'lastClr') || '000000'}` : `#${at(v, 'val')}`; });
  return out;
}
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
function adjust(hex, node) {
  let [r, g, b] = hexToRgb(hex);
  kids(node).forEach((m) => {
    const v = num(at(m, 'val'), 100000) / 100000;
    if (m.localName === 'lumMod' || m.localName === 'lumOff') {
      const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255; let l = (mx + mn) / 2; const d = mx - mn;
      let h = 0; let s = 0;
      if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r / 255 ? (g - b) / 255 / d + (g < b ? 6 : 0) : mx === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4; h /= 6; }
      l = m.localName === 'lumMod' ? l * v : l + v;
      l = Math.max(0, Math.min(1, l));
      const f = (p, q, t) => { let x = t; if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
      if (!s) { r = g = b = l * 255; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = f(p, q, h + 1 / 3) * 255; g = f(p, q, h) * 255; b = f(p, q, h - 1 / 3) * 255; }
    } else if (m.localName === 'tint') { r = 255 - (255 - r) * v; g = 255 - (255 - g) * v; b = 255 - (255 - b) * v; } else if (m.localName === 'shade') { r *= v; g *= v; b *= v; }
  });
  return toHex([r, g, b]);
}
function colorOf(fillEl, theme) {
  const c = kids(fillEl).find((k) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(k.localName));
  if (!c) return null;
  let hex = null;
  if (c.localName === 'srgbClr') hex = `#${at(c, 'val')}`;
  else if (c.localName === 'sysClr') hex = `#${at(c, 'lastClr') || '000000'}`;
  else if (c.localName === 'schemeClr') { const k = at(c, 'val'); hex = theme[k] || theme[SCHEME[k]] || null; }
  else if (c.localName === 'prstClr') hex = at(c, 'val') === 'white' ? '#ffffff' : '#000000';
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? adjust(hex, c) : null;
}
const solid = (spPr, theme) => { const f = kid(spPr, 'solidFill'); return f ? colorOf(f, theme) : null; };

/* ---- geometry */
function xfrmOf(spPr) {
  const x = kid(spPr, 'xfrm'); if (!x) return null;
  const off = kid(x, 'off'); const ext = kid(x, 'ext'); if (!off || !ext) return null;
  return { x: num(at(off, 'x')), y: num(at(off, 'y')), w: num(at(ext, 'cx')), h: num(at(ext, 'cy')), rot: num(at(x, 'rot')) / 60000 };
}
const phOf = (el) => { const ph = walk(el, 'nvSpPr', 'nvPr', 'ph') || walk(el, 'nvPicPr', 'nvPr', 'ph'); return ph ? { type: at(ph, 'type') || 'body', idx: at(ph, 'idx') } : null; };
const tree = (doc) => walk(Array.from(doc.getElementsByTagNameNS('*', 'cSld'))[0], 'spTree');
const sameKind = (a, b) => { const g = (t) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t); return g(a) === g(b); };
function findPh(shapes, ph) {
  if (!ph) return null;
  return shapes.find((s) => s.ph && ph.idx !== null && s.ph.idx === ph.idx && sameKind(s.ph.type, ph.type)) || shapes.find((s) => s.ph && sameKind(s.ph.type, ph.type)) || null;
}
function phShapes(treeEl) { return kids(treeEl, 'sp').map((sp) => ({ ph: phOf(sp), xfrm: xfrmOf(kid(sp, 'spPr')), el: sp })).filter((s) => s.ph); }

/* ---- text */
function defaultSz(ph, lvl, layoutPh, masterEl) {
  const lay = layoutPh && walk(layoutPh.el, 'txBody', 'lstStyle', `lvl${lvl + 1}pPr`);
  const l1 = lay && walk(lay, 'defRPr'); if (l1 && at(l1, 'sz')) return num(at(l1, 'sz'));
  const st = walk(masterEl, 'txStyles'); const group = !ph ? 'otherStyle' : /title/i.test(ph.type) ? 'titleStyle' : 'bodyStyle';
  const d = walk(st, group, `lvl${lvl + 1}pPr`, 'defRPr'); return d && at(d, 'sz') ? num(at(d, 'sz')) : 1800;
}

function readParas(txBody, ctx) {
  const bodyPr = kid(txBody, 'bodyPr'); const fs = num(at(walk(bodyPr, 'normAutofit'), 'fontScale'), 100000) / 100000;
  const paras = kids(txBody, 'p').map((p) => {
    const pPr = kid(p, 'pPr'); const lvl = num(at(pPr, 'lvl'));
    const endSz = at(kid(p, 'endParaRPr'), 'sz');
    const base = defaultSz(ctx.ph, lvl, ctx.layoutPh, ctx.master);
    const noBullet = !!kid(pPr, 'buNone'); const bu = kid(pPr, 'buChar'); const num_ = kid(pPr, 'buAutoNum');
    const bullet = noBullet ? '' : bu ? at(bu, 'char') : num_ ? '#' : (ctx.ph && /^(body|obj)$/i.test(ctx.ph.type) && ctx.ph.idx !== null ? '•' : (ctx.ph && /^body$/i.test(ctx.ph.type) ? '•' : ''));
    const runs = [];
    kids(p).forEach((r) => {
      if (r.localName === 'br') { runs.push({ t: '\n' }); return; }
      if (r.localName !== 'r' && r.localName !== 'fld') return;
      const rPr = kid(r, 'rPr'); const t = kid(r, 't')?.textContent || '';
      runs.push({ t, b: at(rPr, 'b') === '1', i: at(rPr, 'i') === '1', u: !!at(rPr, 'u') && at(rPr, 'u') !== 'none', st: at(rPr, 'strike') && at(rPr, 'strike') !== 'noStrike', sz: at(rPr, 'sz') ? num(at(rPr, 'sz')) * fs : null, color: kid(rPr, 'solidFill') ? colorOf(kid(rPr, 'solidFill'), ctx.theme) : null, font: at(kid(rPr, 'latin'), 'typeface') });
    });
    const algn = at(pPr, 'algn'); const rtl = at(pPr, 'rtl') === '1' || (!runs.length ? false : /[\u0590-\u08FF]/.test(runs.map((r) => r.t).join('')));
    return { algn: algn || (ctx.ph && /title/i.test(ctx.ph.type) && ctx.ph.type === 'ctrTitle' ? 'ctr' : null), lvl, bullet, rtl, sz: (endSz ? num(endSz) : base) * fs, mar: num(at(pPr, 'marL')), runs, text: runs.map((r) => r.t).join('') };
  });
  return { paras, anchor: at(bodyPr, 'anchor') || (ctx.ph && /title/i.test(ctx.ph.type) ? 'ctr' : 't'), ins: [num(at(bodyPr, 'lIns'), 91440), num(at(bodyPr, 'tIns'), 45720), num(at(bodyPr, 'rIns'), 91440), num(at(bodyPr, 'bIns'), 45720)], wrap: at(bodyPr, 'wrap') !== 'none' };
}

/* ---- slide */
function readShapes(treeEl, ctx, map, out, tbIndex) {
  kids(treeEl).forEach((el) => {
    const n = el.localName;
    if (n === 'grpSp') {
      const gx = kid(kid(el, 'grpSpPr'), 'xfrm'); let m2 = map;
      if (gx) {
        const off = kid(gx, 'off'); const ext = kid(gx, 'ext'); const co = kid(gx, 'chOff'); const ce = kid(gx, 'chExt');
        const sx = num(at(ext, 'cx')) / (num(at(ce, 'cx')) || 1); const sy = num(at(ext, 'cy')) / (num(at(ce, 'cy')) || 1);
        const ox = num(at(off, 'x')); const oy = num(at(off, 'y')); const cx0 = num(at(co, 'x')); const cy0 = num(at(co, 'y'));
        m2 = (r) => map({ x: ox + (r.x - cx0) * sx, y: oy + (r.y - cy0) * sy, w: r.w * sx, h: r.h * sy, rot: r.rot });
      }
      readShapes(el, ctx, m2, out, tbIndex); return;
    }
    if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(n)) return;
    const spPr = kid(el, 'spPr') || kid(el, 'xfrm'); const ph = phOf(el);
    let rect = n === 'graphicFrame' ? (() => { const x = kid(el, 'xfrm'); const o = kid(x, 'off'); const e = kid(x, 'ext'); return o && e ? { x: num(at(o, 'x')), y: num(at(o, 'y')), w: num(at(e, 'cx')), h: num(at(e, 'cy')), rot: 0 } : null; })() : xfrmOf(spPr);
    const layoutPh = ph ? findPh(ctx.layoutPhs, ph) : null; const masterPh = ph ? findPh(ctx.masterPhs, ph) : null;
    if (!rect && ph) rect = layoutPh?.xfrm || masterPh?.xfrm || null;
    if (!rect) return;
    rect = map(rect);
    const base = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, rot: rect.rot || 0, ph };
    if (n === 'pic') {
      const rid = at(walk(el, 'blipFill', 'blip'), 'r:embed') || walk(el, 'blipFill', 'blip')?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const rel = ctx.rels[rid]; const f = rel && ctx.files[rel.target];
      const ext = (rel?.target.split('.').pop() || '').toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext];
      if (f && mime) { const url = URL.createObjectURL(new Blob([f], { type: mime })); ctx.urls.push(url); out.push({ ...base, kind: 'pic', url, alt: at(walk(el, 'nvPicPr', 'cNvPr'), 'descr') || '' }); }
      return;
    }
    if (n === 'graphicFrame') {
      const tbl = Array.from(el.getElementsByTagNameNS('*', 'tbl'))[0]; if (!tbl) return;
      const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => num(at(g, 'w')));
      const rows = kids(tbl, 'tr').map((tr) => ({ h: num(at(tr, 'h')), cells: kids(tr, 'tc').map((tc) => {
        const tb = kid(tc, 'txBody'); const k = tb ? tbIndex.get(tb) : null;
        const tcPr = kid(tc, 'tcPr');
        return { k, fill: solid(tcPr, ctx.theme), span: num(at(tc, 'gridSpan'), 1), skip: at(tc, 'hMerge') === '1' || at(tc, 'vMerge') === '1', rspan: num(at(tc, 'rowSpan'), 1), text: tb ? readParas(tb, { ...ctx, ph: null, layoutPh: null }) : { paras: [], anchor: 't', ins: [91440, 45720, 91440, 45720] } };
      }) }));
      const first = !!at(kid(tbl, 'tblPr'), 'firstRow');
      out.push({ ...base, kind: 'table', cols, rows, firstRow: first, accent: ctx.theme.accent1 || '#4472C4' }); return;
    }
    const tb = kid(el, 'txBody'); const fill = solid(spPr, ctx.theme);
    const ln = kid(spPr, 'ln'); const lnColor = ln && kid(ln, 'solidFill') ? colorOf(kid(ln, 'solidFill'), ctx.theme) : null;
    const geom = at(kid(spPr, 'prstGeom'), 'prst');
    const text = tb ? readParas(tb, { ...ctx, ph, layoutPh }) : null;
    const hasText = text && text.paras.some((p) => p.text.trim());
    if (!hasText && !fill && !lnColor && !(tb && ph)) return;
    out.push({ ...base, kind: 'shape', k: tb ? tbIndex.get(tb) : null, fill, line: lnColor, geom, text, editable: !!tb });
  });
}

export async function loadPptx(buf) {
  const files = unzipSync(new Uint8Array(buf));
  if (!files['ppt/presentation.xml']) throw new Error('Not a PowerPoint file.');
  const pres = parseXml(strFromU8(files['ppt/presentation.xml']));
  const sz = Array.from(pres.getElementsByTagNameNS('*', 'sldSz'))[0]; const cx = num(at(sz, 'cx'), 9144000); const cy = num(at(sz, 'cy'), 6858000);
  const prels = relsOf(files, 'ppt/presentation.xml'); const theme = themeColors(files);
  const ids = Array.from(pres.getElementsByTagNameNS('*', 'sldId')).map((s) => s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id'));
  const urls = []; const cacheL = new Map();
  const slides = ids.map((rid, index) => {
    const path = prels[rid]?.target; if (!path || !files[path]) return { index, path, bg: '#fff', shapes: [] };
    const doc = parseXml(strFromU8(files[path])); const rels = relsOf(files, path);
    const layoutPath = Object.values(rels).find((r) => /slideLayout$/.test(r.type))?.target;
    let layoutPhs = []; let masterPhs = []; let master = null; let layoutBg = null; let baseTheme = mapTheme(theme, null);
    if (layoutPath && files[layoutPath]) {
      if (!cacheL.has(layoutPath)) {
        const ld = parseXml(strFromU8(files[layoutPath])); const lr = relsOf(files, layoutPath);
        const mp = Object.values(lr).find((r) => /slideMaster$/.test(r.type))?.target; const md = mp && files[mp] ? parseXml(strFromU8(files[mp])) : null;
        const th = mapTheme(theme, md ? kid(md.documentElement, 'clrMap') : null);
        cacheL.set(layoutPath, { lph: phShapes(tree(ld)), mph: md ? phShapes(tree(md)) : [], master: md ? md.documentElement : null, th, bg: bgOf(ld, th, files, lr, urls) || (md ? bgOf(md, th, files, relsOf(files, mp), urls) : null) });
      }
      const L = cacheL.get(layoutPath); layoutPhs = L.lph; masterPhs = L.mph; master = L.master; layoutBg = L.bg; baseTheme = L.th;
    }
    const root = tree(doc);
    // text bodies get a stable number (document order) shared by the reader and the writer
    const ov = Array.from(doc.getElementsByTagNameNS('*', 'overrideClrMapping'))[0]; const th = ov ? mapTheme(theme, ov) : baseTheme;
    const tbIndex = new Map(); Array.from(doc.getElementsByTagNameNS('*', 'txBody')).forEach((tb, i) => tbIndex.set(tb, i));
    const shapes = []; readShapes(root, { files, rels, theme: th, layoutPhs, masterPhs, master, urls }, (r) => r, shapes, tbIndex);
    return { index, path, bg: bgOf(doc, th, files, rels, urls) || layoutBg || '#ffffff', fg: th.tx1 || '#000000', shapes };
  });
  return { files, cx, cy, slides, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
function mapTheme(theme, map) {
  const th = { ...theme };
  ['bg1', 'tx1', 'bg2', 'tx2'].forEach((k) => { const to = (map && at(map, k)) || SCHEME[k]; if (theme[to]) th[k] = theme[to]; });
  return th;
}
function bgOf(doc, th, files, rels, urls) {
  const bg = Array.from(doc.getElementsByTagNameNS('*', 'bg'))[0]; if (!bg) return null;
  const pr = kid(bg, 'bgPr');
  if (pr) {
    const c = solid(pr, th); if (c) return c;
    const g = kid(pr, 'gradFill');
    if (g) { const gs = kids(kid(g, 'gsLst'), 'gs').map((x) => colorOf(x, th)).filter(Boolean); if (gs.length) return gs.length > 1 ? `linear-gradient(180deg, ${gs[0]}, ${gs[gs.length - 1]})` : gs[0]; }
    const b = kid(pr, 'blipFill');
    if (b) {
      const bl = kid(b, 'blip'); const rid = bl && (bl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || at(bl, 'r:embed'));
      const rel = rels[rid]; const f = rel && files[rel.target]; const ext = (rel?.target.split('.').pop() || '').toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
      if (f && mime) { const u = URL.createObjectURL(new Blob([f], { type: mime })); urls.push(u); return `center / cover no-repeat url("${u}")`; }
    }
    return null;
  }
  const ref = kid(bg, 'bgRef'); return ref ? colorOf(ref, th) : null;
}

export function savePptx(deck, edits) {
  const out = { ...deck.files }; const bySlide = {};
  Object.entries(edits).forEach(([key, paras]) => { const [si, k] = key.split(':').map(Number); (bySlide[si] ||= {})[k] = paras; });
  Object.entries(bySlide).forEach(([si, m]) => {
    const slide = deck.slides[si]; if (!slide?.path) return;
    const doc = parseXml(strFromU8(deck.files[slide.path])); const bodies = Array.from(doc.getElementsByTagNameNS('*', 'txBody'));
    Object.entries(m).forEach(([k, texts]) => {
      const tb = bodies[Number(k)]; if (!tb) return;
      const ps = kids(tb, 'p'); const A = tb.namespaceURI;
      const setText = (p, text) => {
        const runs = kids(p).filter((c) => c.localName === 'r' || c.localName === 'fld');
        let r = runs[0];
        if (!r) { r = doc.createElementNS(A, 'a:r'); const t0 = doc.createElementNS(A, 'a:t'); r.appendChild(t0); const end = kid(p, 'endParaRPr'); const rp = end ? doc.createElementNS(A, 'a:rPr') : null; if (end) Array.from(end.attributes).forEach((a) => rp.setAttribute(a.name, a.value)); if (rp) { kids(end).forEach((c) => rp.appendChild(c.cloneNode(true))); r.insertBefore(rp, t0); } p.insertBefore(r, end || null); }
        if (r.localName === 'fld') { const nr = doc.createElementNS(A, 'a:r'); kids(r).forEach((c) => { if (c.localName !== 'pPr') nr.appendChild(c.cloneNode(true)); }); r.replaceWith(nr); r = nr; }
        let t = kid(r, 't'); if (!t) { t = doc.createElementNS(A, 'a:t'); r.appendChild(t); }
        t.textContent = text;
        kids(p).forEach((c) => { if ((c.localName === 'r' || c.localName === 'fld' || c.localName === 'br') && c !== r) c.remove(); });
      };
      texts.forEach((text, i) => {
        if (ps[i]) { if (kids(ps[i]).filter((c) => c.localName === 'r' || c.localName === 'fld' || c.localName === 'br').map((c) => (c.localName === 'br' ? '\n' : kid(c, 't')?.textContent || '')).join('') !== text) setText(ps[i], text); } else {
          const src = ps[ps.length - 1]; const np = src ? src.cloneNode(true) : doc.createElementNS(A, 'a:p'); setText(np, text); (ps[ps.length - 1]?.after ? ps[ps.length - 1].after(np) : tb.appendChild(np)); ps.push(np);
        }
      });
      for (let i = ps.length - 1; i >= texts.length && i > 0; i -= 1) ps[i].remove();
    });
    out[slide.path] = strToU8(new XMLSerializer().serializeToString(doc));
  });
  return new Blob([zipSync(out, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
