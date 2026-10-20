/**
 * Word (.docx) <-> editable HTML.
 *   docxToHtml(arrayBuffer) -> sanitized HTML      (mammoth)
 *   htmlToDocx(rootElement) -> Blob                 (docx library)
 *   sanitizeHtml(html)      -> safe HTML string
 * Saving rebuilds the document from the edited content: headings, bold / italic / underline / strike, colours, lists,
 * tables, links, pictures, alignment and RTL are kept; page layout, headers / footers and styles of the original are not.
 */
const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'SPAN', 'A', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'DIV', 'SUB', 'SUP', 'BLOCKQUOTE']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
const SAFE_URL = /^(https?:|mailto:|tel:|#)/i;
const SAFE_IMG = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

function cleanStyle(st) {
  const out = [];
  String(st || '').split(';').forEach((d) => {
    const i = d.indexOf(':'); if (i < 0) return;
    const k = d.slice(0, i).trim().toLowerCase(); const v = d.slice(i + 1).trim();
    if (k === 'text-align' && /^(left|right|center|justify|start|end)$/.test(v)) out.push(`text-align:${v}`);
    else if (k === 'direction' && /^(rtl|ltr)$/.test(v)) out.push(`direction:${v}`);
    else if (k === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i.test(v)) out.push(`color:${v}`);
    else if (k === 'font-size' && /^[\d.]+(pt|px)$/.test(v)) out.push(`font-size:${v}`);
    else if (k === 'font-weight' && /^(bold|[5-9]00)$/.test(v)) out.push('font-weight:bold');
    else if (k === 'font-style' && v === 'italic') out.push('font-style:italic');
    else if (k === 'text-decoration' && /^(underline|line-through)( (underline|line-through))?$/.test(v)) out.push(`text-decoration:${v}`);
  });
  return out.join(';');
}

function cleanNode(node, doc) {
  if (node.nodeType === 3) return doc.createTextNode(node.nodeValue);
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toUpperCase();
  if (DROP.has(tag)) return null;
  if (!ALLOWED.has(tag)) { const f = doc.createDocumentFragment(); node.childNodes.forEach((c) => { const n = cleanNode(c, doc); if (n) f.appendChild(n); }); return f; }
  const el = doc.createElement(tag.toLowerCase());
  const st = cleanStyle(node.getAttribute('style')); if (st) el.setAttribute('style', st);
  const dir = node.getAttribute('dir'); if (dir === 'rtl' || dir === 'ltr') el.setAttribute('dir', dir);
  if (tag === 'A') { const h = (node.getAttribute('href') || '').trim(); if (SAFE_URL.test(h)) { el.setAttribute('href', h); el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); } }
  if (tag === 'IMG') { const s = (node.getAttribute('src') || '').trim(); if (!SAFE_IMG.test(s)) return null; el.setAttribute('src', s); const w = parseInt(node.getAttribute('width'), 10); if (w > 0) el.setAttribute('width', String(w)); }
  if (tag === 'TD' || tag === 'TH') { ['colspan', 'rowspan'].forEach((a) => { const v = parseInt(node.getAttribute(a), 10); if (v > 1 && v < 50) el.setAttribute(a, String(v)); }); }
  node.childNodes.forEach((c) => { const n = cleanNode(c, doc); if (n) el.appendChild(n); });
  return el;
}

export function sanitizeHtml(html) {
  const src = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const doc = document.implementation.createHTMLDocument('');
  const box = doc.createElement('div');
  src.body.childNodes.forEach((c) => { const n = cleanNode(c, doc); if (n) box.appendChild(n); });
  return box.innerHTML;
}

export async function docxToHtml(arrayBuffer) {
  const m = await import('mammoth/mammoth.browser.js');
  const mammoth = m.default || m;
  const out = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
    convertImage: mammoth.images.imgElement((img) => img.read('base64').then((b) => ({ src: `data:${img.contentType};base64,${b}` }))),
  });
  return sanitizeHtml(out.value || '<p></p>');
}

/* ---------------------------------------------------------------- HTML -> docx */
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const hex = (c) => {
  if (!c) return undefined;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (m) return (m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1]).toUpperCase();
  const r = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  return r ? [r[1], r[2], r[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined;
};
const b64bytes = (src) => { const bin = atob(src.slice(src.indexOf(',') + 1)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i); return u; };
const imgType = (src) => (/image\/(png|jpe?g|gif|bmp)/i.exec(src)?.[1] || 'png').toLowerCase().replace('jpeg', 'jpg');

export async function htmlToDocx(root) {
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, ExternalHyperlink, LevelFormat, BorderStyle } = D;
  const ALIGN = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER, justify: AlignmentType.JUSTIFIED, start: AlignmentType.START, end: AlignmentType.END };
  const HEAD = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
  let listRefs = 0; const numbering = []; const newNumbering = (ordered) => {
    const reference = `list-${listRefs += 1}`;
    numbering.push({ reference, levels: Array.from({ length: 6 }, (_, level) => ({ level, format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: ordered ? `%${level + 1}.` : '•', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) });
    return reference;
  };

  const dirOf = (el) => { const d = el.closest?.('[dir]')?.getAttribute('dir'); const st = el.closest?.('[style*="direction"]'); if (d) return d === 'rtl'; if (st && /direction:\s*rtl/i.test(st.getAttribute('style'))) return true; return RTL_RE.test(el.textContent || ''); };

  function runs(node, fmt, rtl) {
    const out = [];
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { if (n.nodeValue) out.push(new TextRun({ text: n.nodeValue.replace(/\u00a0/g, ' '), ...fmt, rightToLeft: rtl || undefined })); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName; const f = { ...fmt };
      if (t === 'BR') { out.push(new TextRun({ break: 1 })); return; }
      if (t === 'STRONG' || t === 'B') f.bold = true;
      if (t === 'EM' || t === 'I') f.italics = true;
      if (t === 'U') f.underline = {};
      if (t === 'S' || t === 'STRIKE') f.strike = true;
      if (t === 'SUB') f.subScript = true; if (t === 'SUP') f.superScript = true;
      const st = n.style;
      if (st) {
        if (st.color) f.color = hex(st.color); if (st.fontWeight === 'bold') f.bold = true; if (st.fontStyle === 'italic') f.italics = true;
        if (/underline/.test(st.textDecoration)) f.underline = {}; if (/line-through/.test(st.textDecoration)) f.strike = true;
        const fs = /^([\d.]+)(pt|px)$/.exec(st.fontSize || ''); if (fs) f.size = Math.round((fs[2] === 'px' ? Number(fs[1]) * 0.75 : Number(fs[1])) * 2);
      }
      if (t === 'IMG') { const im = image(n); if (im) out.push(im); return; }
      if (t === 'A' && /^(https?:|mailto:|tel:)/i.test(n.getAttribute('href') || '')) {
        out.push(new ExternalHyperlink({ link: n.getAttribute('href'), children: runs(n, { ...f, color: f.color || '1D4ED8', underline: {} }, rtl) })); return;
      }
      out.push(...runs(n, f, rtl));
    });
    return out;
  }
  function image(n) {
    const src = n.getAttribute('src') || ''; if (!/^data:image\//.test(src)) return null;
    let w = n.naturalWidth || parseInt(n.getAttribute('width'), 10) || 400; let h = n.naturalHeight || Math.round(w * 0.6);
    if (n.naturalWidth && n.naturalHeight) { h = n.naturalHeight; w = n.naturalWidth; }
    const max = 560; if (w > max) { h = Math.round((h * max) / w); w = max; }
    try { return new ImageRun({ type: imgType(src), data: b64bytes(src), transformation: { width: w, height: h } }); } catch { return null; }
  }
  const alignOf = (el, rtl) => { const a = /text-align:\s*(\w+)/i.exec(el.getAttribute('style') || '')?.[1]; return a ? ALIGN[a.toLowerCase()] : undefined; };

  function para(el, extra = {}) {
    const rtl = dirOf(el);
    const bold = /^H[1-6]$/.test(el.tagName) ? undefined : undefined;
    return new Paragraph({ children: runs(el, { bold }, rtl), bidirectional: rtl || undefined, alignment: alignOf(el, rtl), ...extra });
  }
  function list(el, level, ref, out) {
    const ordered = el.tagName === 'OL'; const reference = ref || newNumbering(ordered);
    Array.from(el.children).forEach((li) => {
      if (li.tagName !== 'LI') return;
      const inline = li.cloneNode(true); inline.querySelectorAll('ul,ol').forEach((x) => x.remove());
      out.push(para(inline, { numbering: { reference, level: Math.min(level, 5) } }));
      li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => list(sub, level + 1, null, out));
    });
  }
  function table(el) {
    const trs = Array.from(el.querySelectorAll('tr')).filter((tr) => tr.closest('table') === el);
    const rtl = dirOf(el);
    const border = { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: rtl || undefined,
      rows: trs.map((tr) => new TableRow({
        children: Array.from(tr.children).filter((c) => /^T[DH]$/.test(c.tagName)).map((td) => {
          const kids = []; blocks(td, kids); if (!kids.length) kids.push(new Paragraph({}));
          return new TableCell({ children: kids, columnSpan: parseInt(td.getAttribute('colspan'), 10) || undefined, rowSpan: parseInt(td.getAttribute('rowspan'), 10) || undefined, borders: { top: border, bottom: border, left: border, right: border } });
        }),
      })),
    });
  }
  function blocks(parent, out) {
    let loose = [];
    const flush = () => { if (loose.some((n) => n.nodeType !== 3 || n.nodeValue.trim())) { const w = document.createElement('p'); loose.forEach((n) => w.appendChild(n.cloneNode(true))); out.push(para(w)); } loose = []; };
    parent.childNodes.forEach((n) => {
      if (n.nodeType === 3) { loose.push(n); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (/^(P|H[1-6]|BLOCKQUOTE)$/.test(t)) { flush(); out.push(para(n, HEAD[t] ? { heading: HEAD[t] } : t === 'BLOCKQUOTE' ? { indent: { left: 720 } } : {})); }
      else if (t === 'UL' || t === 'OL') { flush(); list(n, 0, null, out); }
      else if (t === 'TABLE') { flush(); out.push(table(n)); out.push(new Paragraph({})); }
      else if (t === 'DIV') { flush(); if (n.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,table,div')) blocks(n, out); else out.push(para(n)); }
      else loose.push(n);
    });
    flush();
  }

  const body = [];
  blocks(root, body);
  if (!body.length) body.push(new Paragraph({}));
  const doc = new Document({
    creator: 'UIP', numbering: { config: numbering },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: body }],
  });
  return Packer.toBlob(doc);
}
