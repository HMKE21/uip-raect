/**
 * Spreadsheet read / write for the grid editor (.xlsx / .csv / .tsv).
 *   readSheets(blob, ext) -> [{ name, cells: string[][] }]
 *   buildSheets(sheets, ext, { rtl }) -> Blob
 * Formulas are saved as their last values; colours / widths / charts of the original are not kept.
 */
import { parseCsv, toCsv } from '../exporter';

export const MAX_COLS = 200;
export const MAX_CELLS = 400000;
export const cellStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : v === null || v === undefined ? '' : String(v));

const parseTsv = (text) => String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.split('\t')).filter((r, i, a) => !(i === a.length - 1 && r.length === 1 && r[0] === ''));

export async function readSheets(blob, ext) {
  if (ext === 'csv' || ext === 'tsv') {
    const text = await blob.text();
    const rows = (ext === 'tsv' ? parseTsv(text) : parseCsv(text)).map((r) => r.map(cellStr));
    return [{ name: ext.toUpperCase(), cells: rows.length ? rows : [['']] }];
  }
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const sheets = await readExcelFile(blob);
  return sheets.map((s) => ({ name: s.sheet, cells: s.data.length ? s.data.map((r) => r.map(cellStr)) : [['']] }));
}

/** Rectangular, trailing empty rows / columns removed. */
export function normalize(cells) {
  const rows = cells.map((r) => { let n = r.length; while (n > 0 && (r[n - 1] ?? '') === '') n -= 1; return r.slice(0, n); });
  while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  const w = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? ''));
}

/** Plain numbers become numbers; IDs / phone numbers / zero-padded codes stay text. */
const typed = (s) => (s === '' ? null : /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s) ? Number(s) : s);

export function toCsvText(cells, delimiter = ',') {
  const rows = normalize(cells);
  if (delimiter === '\t') return rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
  return toCsv(rows[0], rows.slice(1));
}

export async function buildSheets(sheets, ext, { rtl } = {}) {
  if (ext === 'csv') return new Blob(['\uFEFF', toCsvText(sheets[0].cells)], { type: 'text/csv;charset=utf-8' });
  if (ext === 'tsv') return new Blob([toCsvText(sheets[0].cells, '\t')], { type: 'text/tab-separated-values;charset=utf-8' });
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const used = new Set();
  const out = sheets.map((s, i) => {
    const rows = normalize(s.cells);
    let name = String(s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)}_${i}`;
    used.add(name.toLowerCase());
    const data = rows.map((r, ri) => r.map((c) => (ri === 0 && c !== '' ? { value: c === '' ? null : String(c), fontWeight: 'bold', backgroundColor: '#E8ECFF', textColor: '#1B2559' } : typed(c))));
    const columns = rows[0].map((_, ci) => {
      let max = 8;
      for (let r = 0; r < Math.min(rows.length, 200); r += 1) max = Math.max(max, String(rows[r][ci]).length);
      return { width: Math.min(48, max + 2) };
    });
    return { data, sheet: name, columns, stickyRowsCount: 1, rightToLeft: !!rtl };
  });
  return writeXlsxFile(out).toBlob();
}

export const colName = (i) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
