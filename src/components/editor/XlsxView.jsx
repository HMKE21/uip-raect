import { useCallback, useEffect, useState } from 'react';
import OfficeShell from './OfficeShell';
import SheetGrid from './SheetGrid';
import useDocHistory from './useDocHistory';
import { buildSheets, loadTheme, MAX_CELLS, readSheets } from '../../lib/officeFmt/xlsx';

// Local autosave stores the cells as JSON (milliseconds) instead of building a whole .xlsx on the main thread every few seconds.
const DRAFT_MIME = 'application/x-uip-sheets+json';
const readAny = async (blob, ext) => {
  if (blob?.type === DRAFT_MIME) { const j = JSON.parse(await blob.text()); if (Array.isArray(j) && j.length) return j; }
  return readSheets(blob, ext);
};

/** Read-only professional grid for the viewer (all sheets, find, sort-free, copy). */
export function XlsxPreview({ blob, ext, tt, rtl }) {
  const [sheets, setSheets] = useState(null); const [i, setI] = useState(0); const [err, setErr] = useState('');
  useEffect(() => { let d = false; readSheets(blob, ext).then((x) => !d && setSheets(x)).catch((e) => !d && setErr(e?.message || String(e))); return () => { d = true; }; }, [blob, ext]);
  if (err) return <p className="st-fv__empty">{err}</p>;
  if (!sheets) return <p className="st-fv__empty">{tt('Loading…', 'جارٍ التحميل…')}</p>;
  const nop = () => {};
  return (
    <div className="ed xg-preview">
      <SheetGrid cells={sheets[i].cells} onChange={nop} tt={tt} rtl={rtl} readOnly />
      {sheets.length > 1 && <div className="xg__tabs" role="tablist">{sheets.map((s, k) => <button key={k} type="button" role="tab" aria-selected={i === k} className={i === k ? 'is-on' : ''} onClick={() => setI(k)}>{s.name}</button>)}</div>}
    </div>
  );
}

/** Grid editor for .xlsx / .csv / .tsv opened from FileViewer. Sheets are tabs; all of them are saved. */
export default function XlsxView({ blob, fileName, ext, tt, rtl, guardRef, onSave, onClose, draftKey, startDirty = false }) {
  const [state, setState] = useState({ status: 'loading' });
  const [sheet, setSheet] = useState(0); const [theme, setTheme] = useState(loadTheme);
  const h = useDocHistory(null, startDirty);

  useEffect(() => {
    let dead = false;
    readAny(blob, ext).then((s) => {
      if (dead) return;
      const big = s.some((x) => x.cells.length * (x.cells[0]?.length || 1) > MAX_CELLS);
      if (big) { setState({ status: 'error', msg: tt('This sheet is too large to edit in the browser.', 'الجدول كبير جدًا للتعديل داخل المتصفح.') }); return; }
      h.reset(s); setState({ status: 'ready' });
    }).catch((e) => !dead && setState({ status: 'error', msg: e?.message || String(e) }));
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, ext]);

  const sheets = h.value || [];
  const cur = sheets[sheet];
  const onChange = useCallback((cells) => h.set(sheets.map((s, i) => (i === sheet ? { ...s, cells } : s))), [h, sheets, sheet]);
  const build = useCallback(() => buildSheets(sheets, ext, { rtl, theme }), [sheets, ext, rtl, theme]);
  const draftBuild = useCallback(() => new Blob([JSON.stringify(sheets)], { type: DRAFT_MIME }), [sheets]);

  if (state.status === 'loading') return <div className="ed ed--center"><span className="st-fv-spinner" /><p className="ed__hint">{tt('Opening the sheet…', 'جارٍ فتح الجدول…')}</p></div>;
  if (state.status === 'error') return <div className="ed ed--center"><p className="ed__err">{state.msg}</p><button type="button" className="ed__btn" onClick={onClose}>{tt('Close', 'إغلاق')}</button></div>;

  return (
    <OfficeShell fileName={fileName} tt={tt} guardRef={guardRef} onSave={onSave} onClose={onClose} dirty={h.dirty} build={build} onSaved={h.markSaved} draftKey={draftKey} draftToken={h.value} draftBuild={draftBuild} draftDelay={4000}
      status={sheets.length > 1 && (
        <div className="xg__tabs" role="tablist">
          {sheets.map((s, i) => <button key={i} type="button" role="tab" aria-selected={sheet === i} className={sheet === i ? 'is-on' : ''} onClick={() => setSheet(i)}>{s.name}</button>)}
        </div>
      )}>
      {cur && <SheetGrid theme={theme} onTheme={setTheme} cells={cur.cells} onChange={onChange} tt={tt} rtl={rtl} undo={h.undo} redo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} />}
      {ext !== 'xlsx' && <p className="ed__hint ed__hint--note xg__note">{tt('The theme is for viewing only: CSV / TSV files cannot store colours. Save as .xlsx to keep it.', 'الثيم للعرض بس: ملفات CSV / TSV مبتحفظش ألوان. احفظه كـ .xlsx عشان الثيم يتحفظ.')}</p>}
      {ext === 'xlsx' && <p className="ed__hint ed__hint--note xg__note">{tt('Formulas are saved as their values; colours and charts of the original file are not kept.', 'الصيغ بتتحفظ كقيم، وألوان وتنسيقات ورسوم الملف الأصلي مش بتتحفظ.')}</p>}
    </OfficeShell>
  );
}
