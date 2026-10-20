/**
 * Unified export engine — one place that turns tabular data into a downloadable
 * CSV / Excel (.xlsx) / PDF / JSON file, entirely in the browser.
 *
 * Two entry points:
 *   exportTable({ headers, rows, format, filename, title })
 *       — for data the page already holds in memory.
 *   exportFromCsvBlob(blob, { format, filename, title })
 *       — for the many API endpoints that only return a CSV file: the CSV is
 *         parsed and re-rendered in the requested format (csv passes through
 *         untouched), so every export in the platform can offer every format
 *         without a backend change.
 *
 * The heavy libraries (xlsx writer, jsPDF, html2canvas) are loaded on demand,
 * so they never weigh on the initial bundle.
 */

import { getExportLang } from './exportLang';
import { canSaveNatively, nativeSaveFile } from '../native';

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf', 'json'];

export const FORMAT_META = {
  csv: { ext: 'csv', mime: 'text/csv;charset=utf-8' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  json: { ext: 'json', mime: 'application/json;charset=utf-8' },
};

const isRtl = () => {
  const chosen = getExportLang(); // language picked in the export menu
  if (chosen) return chosen === 'ar';
  return typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';
};

/* ------------------------------------------------------------------ helpers */

/**
 * Preview sink. While `runWithSink(handler, fn)` is running, the next saveBlob()
 * hands the finished file to `handler(blob, filename)` instead of downloading it.
 * That is how every "Download" in the platform can also offer "Preview": the
 * preview just runs the very same export code and intercepts the final save.
 */
let sink = null;
export async function runWithSink(handler, fn) {
  sink = handler;
  try { return await fn(); } finally { sink = null; }
}

/** True while an export is being run for preview (nothing will be downloaded). */
export const isPreviewing = () => sink !== null;

function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function saveBlob(blob, filename) {
  if (sink) { const h = sink; sink = null; h(blob, filename); return; }
  // Inside the Android app a blob: link cannot be downloaded - hand the file to the native side instead.
  if (canSaveNatively()) {
    nativeSaveFile(blob, filename).catch(() => anchorDownload(blob, filename));
    return;
  }
  anchorDownload(blob, filename);
}

/** "report.csv" + "pdf" -> "report.pdf"; "report" + "pdf" -> "report.pdf". */
export function withExtension(filename, format) {
  const ext = FORMAT_META[format]?.ext || format;
  const base = String(filename || 'export').replace(/\.(csv|xlsx|pdf|json|xls|docx)$/i, '');
  return `${base}.${ext}`;
}

const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const csvEscape = (v) => {
  const s = cellText(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers, rows) {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

/** Numbers stay numbers in Excel; IDs / phone numbers / zero-padded codes stay text. */
function excelValue(raw) {
  const s = cellText(raw);
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return Number(s);
  return s === '' ? null : s;
}

/* ------------------------------------------------------------------ builders */

async function buildXlsx(headers, rows, { title, rtl }) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = headers.map((h) => ({ value: cellText(h), fontWeight: 'bold', backgroundColor: '#E8ECFF', textColor: '#1B2559' }));
  const data = [head, ...rows.map((r) => headers.map((_, i) => excelValue(r[i])))];
  const columns = headers.map((h, i) => {
    let max = cellText(h).length;
    for (let r = 0; r < Math.min(rows.length, 200); r += 1) max = Math.max(max, cellText(rows[r][i]).length);
    return { width: Math.min(48, Math.max(10, max + 2)) };
  });
  const sheet = String(title || 'Export').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export';
  const file = writeXlsxFile([{ data, sheet, columns, stickyRowsCount: 1, rightToLeft: rtl }]);
  return file.toBlob();
}

function buildJson(headers, rows) {
  const objs = rows.map((r) => Object.fromEntries(headers.map((h, i) => [cellText(h) || `column_${i + 1}`, r[i] ?? null])));
  return new Blob([JSON.stringify(objs, null, 2)], { type: FORMAT_META.json.mime });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * PDF. Rendered through the browser's own text engine (html2canvas) rather than
 * jsPDF's built-in fonts, so Arabic shaping and right-to-left tables come out
 * correctly. Rows are paginated by measured height, so no row is ever cut.
 */
async function buildPdf(headers, rows, { title, rtl }) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const landscape = headers.length > 5;
  const pageMm = landscape ? { w: 297, h: 210 } : { w: 210, h: 297 };
  const W = landscape ? 1122 : 794; // px at 96dpi
  const H = Math.round((W * pageMm.h) / pageMm.w);
  const PAD = 36;
  const FOOT = 26;

  // Column weights from content length, so a long "description" gets more room than an "id".
  const weights = headers.map((h, i) => {
    const lens = rows.slice(0, 300).map((r) => cellText(r[i]).length).sort((a, b) => a - b);
    const p90 = lens.length ? lens[Math.floor(lens.length * 0.9)] : 0;
    return Math.min(36, Math.max(6, Math.max(p90, cellText(h).length * 0.9)));
  });
  const totalW = weights.reduce((a, b) => a + b, 0);

  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const dir = rtl ? 'rtl' : 'ltr';
  const stamp = new Date().toLocaleString(rtl ? 'ar-EG' : 'en-GB');
  const MAX_CELL = 220;

  const tableHtml = (list, withHead = true) => `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px;line-height:1.45">
      <colgroup>${weights.map((w) => `<col style="width:${((w / totalW) * 100).toFixed(2)}%">`).join('')}</colgroup>
      ${withHead ? `<thead><tr>${headers.map((h) => `<th style="background:#E8ECFF;color:#1B2559;font-weight:700;text-align:start;padding:7px 8px;border:1px solid #CBD2F0;word-break:break-word">${esc(cellText(h))}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${list.map((r, ri) => `<tr style="background:${ri % 2 ? '#F7F8FD' : '#fff'}">${headers.map((_, i) => {
        const s = cellText(r[i]);
        return `<td style="padding:6px 8px;border:1px solid #E1E5F5;vertical-align:top;word-break:break-word;overflow-wrap:anywhere">${esc(s.length > MAX_CELL ? `${s.slice(0, MAX_CELL)}…` : s)}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;background:#fff;color:#111;font-family:${font};direction:${dir};`;
  document.body.appendChild(stage);

  try {
    const pageShell = (inner, pageNo, pageCount, first) => `
      <div style="box-sizing:border-box;width:${W}px;height:${H}px;padding:${PAD}px;background:#fff;position:relative;direction:${dir}">
        ${first ? `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;border-bottom:2px solid #4F5BE8;padding-bottom:8px">
          <h1 style="margin:0;font-size:20px;color:#1B2559">${esc(title || 'Export')}</h1>
          <span style="font-size:11px;color:#6B7280">${esc(stamp)} · ${rows.length}</span></div>` : ''}
        ${inner}
        <div style="position:absolute;bottom:12px;inset-inline:${PAD}px;display:flex;justify-content:space-between;font-size:10px;color:#9CA3AF">
          <span>${esc(title || '')}</span><span dir="ltr">${pageNo} / ${pageCount}</span></div>
      </div>`;

    // 1) measure header + each row once
    stage.innerHTML = `<div style="padding:${PAD}px;box-sizing:border-box;width:${W}px">${tableHtml(rows)}</div>`;
    const trs = [...stage.querySelectorAll('tbody tr')];
    const headH = stage.querySelector('thead')?.offsetHeight || 30;
    const rowH = trs.map((tr) => tr.offsetHeight);
    const titleH = 58;
    const room = (first) => H - PAD * 2 - FOOT - headH - (first ? titleH : 0);

    // 2) paginate by height
    const pages = [];
    let cur = []; let used = 0;
    rowH.forEach((h, i) => {
      if (cur.length && used + h > room(pages.length === 0)) { pages.push(cur); cur = []; used = 0; }
      cur.push(i); used += h;
    });
    if (cur.length || !pages.length) pages.push(cur);

    // 3) render each page
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let p = 0; p < pages.length; p += 1) {
      stage.innerHTML = pageShell(tableHtml(pages[p].map((i) => rows[i])), p + 1, pages.length, p === 0);
      const canvas = await html2canvas(stage.firstElementChild, { scale: 2, backgroundColor: '#ffffff', logging: false, width: W, height: H });
      if (p > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageMm.w, pageMm.h, undefined, 'FAST');
    }
    pdf.setProperties({ title: title || 'Export', creator: 'Insight Platform' });
    return pdf.output('blob');
  } finally {
    stage.remove();
  }
}

/* ------------------------------------------------------------------ public API */

/**
 * @param {object}   o
 * @param {string[]} o.headers
 * @param {Array[]}  o.rows
 * @param {'csv'|'xlsx'|'pdf'|'json'} o.format
 * @param {string}   o.filename   base name, extension optional
 * @param {string}  [o.title]     heading of the PDF / sheet name of the workbook
 * @param {boolean} [o.rtl]       defaults to the page direction
 */
export async function exportTable({ headers, rows, format = 'csv', filename = 'export', title, rtl = isRtl() }) {
  if (!FORMAT_META[format]) throw new Error(`Unsupported export format: ${format}`);
  const safeHeaders = (headers || []).map(cellText);
  const safeRows = rows || [];
  let blob;
  if (format === 'csv') blob = new Blob([toCsv(safeHeaders, safeRows)], { type: FORMAT_META.csv.mime });
  else if (format === 'json') blob = buildJson(safeHeaders, safeRows);
  else if (format === 'xlsx') blob = await buildXlsx(safeHeaders, safeRows, { title: title || filename, rtl });
  else blob = await buildPdf(safeHeaders, safeRows, { title: title || filename, rtl });
  saveBlob(blob, withExtension(filename, format));
}

/** Convert a CSV file returned by the API into the requested format and download it. */
export async function exportFromCsvBlob(blob, { format = 'csv', filename = 'export', title, rtl } = {}) {
  if (format === 'csv') { saveBlob(blob, withExtension(filename, 'csv')); return; }
  const parsed = parseCsv(await blob.text());
  if (!parsed.length) throw new Error('The export is empty.');
  const [headers, ...rows] = parsed;
  await exportTable({ headers, rows, format, filename, title: title || filename, rtl });
}

/**
 * Export every key/value of a plain object list (e.g. API JSON rows) — columns are
 * taken from `columns` ([{ key, label, get? }]) or, when omitted, from the first row.
 */
export async function exportObjects(list, { columns, ...opts } = {}) {
  const cols = columns || Object.keys(list?.[0] || {}).map((key) => ({ key, label: key }));
  const rows = (list || []).map((o) => cols.map((c) => (c.get ? c.get(o) : o?.[c.key])));
  return exportTable({ headers: cols.map((c) => c.label ?? c.key), rows, ...opts });
}
