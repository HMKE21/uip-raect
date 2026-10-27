import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { NUM_FORMATS } from '../../lib/sheet/format.js';
import { FUNCS } from '../../lib/sheet/funcs.js';

const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Tahoma', 'Verdana', 'Segoe UI', 'Georgia', 'Noto Sans Arabic'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const SWATCHES = ['#000000', '#7f7f7f', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#ffffff', '#eeece1', '#fce4d6', '#fff2cc', '#e2efda', '#ddebf7', '#d9d2e9', '#f8cbad'];
const CATS = {
  Math: 'SUM PRODUCT ABS ROUND ROUNDUP ROUNDDOWN INT MOD POWER SQRT SUMIF SUMIFS SUMPRODUCT CEILING FLOOR MROUND RAND RANDBETWEEN PI EXP LN LOG LOG10 FACT SIGN TRUNC SUBTOTAL',
  Statistical: 'AVERAGE AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS MAX MIN MAXIFS MINIFS MEDIAN MODE LARGE SMALL RANK STDEV VAR PERCENTILE QUARTILE CORREL SLOPE INTERCEPT FORECAST',
  Logical: 'IF IFS IFERROR IFNA AND OR NOT XOR SWITCH TRUE FALSE ISBLANK ISNUMBER ISTEXT ISERROR ISNA',
  Text: 'LEN LEFT RIGHT MID UPPER LOWER PROPER TRIM CONCAT CONCATENATE TEXTJOIN FIND SEARCH SUBSTITUTE REPLACE REPT TEXT VALUE EXACT CHAR CODE TEXTBEFORE TEXTAFTER TEXTSPLIT',
  'Lookup & Reference': 'VLOOKUP HLOOKUP XLOOKUP LOOKUP MATCH XMATCH INDEX OFFSET INDIRECT ROW COLUMN ROWS COLUMNS CHOOSE TRANSPOSE ADDRESS',
  'Dynamic arrays': 'SORT SORTBY FILTER UNIQUE SEQUENCE TAKE DROP HSTACK VSTACK TOCOL TOROW CHOOSECOLS CHOOSEROWS',
  'Date & Time': 'TODAY NOW DATE YEAR MONTH DAY HOUR MINUTE SECOND WEEKDAY WEEKNUM EDATE EOMONTH DATEDIF DAYS NETWORKDAYS WORKDAY DATEVALUE TIME',
  Financial: 'PMT IPMT PPMT FV PV NPER NPV IRR RATE SLN',
};

function useOutside(ref, close) {
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); }; window.addEventListener('pointerdown', h, true); return () => window.removeEventListener('pointerdown', h, true); }, [ref, close]);
}
function Drop({ label, icon, title, children, wide, disabled }) {
  const [open, setOpen] = useState(false); const ref = useRef(null); useOutside(ref, () => setOpen(false));
  return (
    <div className="sx__drop" ref={ref}>
      <button type="button" className="sx__rb" title={title || label} aria-label={title || label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} size={17} />}{label && <span>{label}</span>}<Icon name="chevron-down" size={11} />
      </button>
      {open && <div className={`sx__pop${wide ? ' sx__pop--wide' : ''}`} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
const RB = ({ icon, label, title, on, onClick, disabled, children }) => (
  <button type="button" className={`sx__rb${on ? ' is-on' : ''}`} title={title || label} aria-label={title || label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onClick={onClick}>
    {icon && <Icon name={icon} size={17} />}{label && <span>{label}</span>}{children}
  </button>
);
const Item = ({ children, onClick, disabled }) => <button type="button" className="sx__it" disabled={disabled} onClick={onClick}>{children}</button>;
function Colors({ value, onPick, tt, none }) {
  return (
    <div className="sx__sw">
      {none && <button type="button" className="sx__swn" onClick={() => onPick(null)}>{none}</button>}
      <div className="sx__swg">{SWATCHES.map((c) => <button key={c} type="button" className="sx__swc" style={{ background: c }} aria-label={c} onClick={() => onPick(c)} />)}</div>
      <label className="sx__swn">{tt('More colors…', 'ألوان أخرى…')}<input type="color" value={value || '#000000'} onChange={(e) => onPick(e.target.value)} /></label>
    </div>
  );
}
const decimals = (nf, d) => {
  const code = !nf || nf === 'General' ? '0' : nf; const m = /^(.*?)(0)(\.(0*))?(.*)$/.exec(code.split(';')[0]); if (!m) return nf;
  const cur = m[4] ? m[4].length : 0; const next = Math.max(0, Math.min(15, cur + d)); if (!nf || nf === 'General') { if (d < 0) return nf; }
  return `${m[1]}0${next ? `.${'0'.repeat(next)}` : ''}${m[5]}`;
};

export default function SheetRibbon({ A, tt, state }) {
  const [tab, setTab] = useState('home'); const { ast, canUndo, canRedo } = state;
  const nf = ast.nf || 'General';
  const cur = NUM_FORMATS.find((f) => f.code === nf);
  const sz = ast.fs || 10.5;
  return (
    <div className="sx__rib">
      <div className="sx__tabsrow" role="tablist">
        {[['home', 'Home', 'الرئيسية'], ['formulas', 'Formulas', 'الصيغ'], ['data', 'Data', 'البيانات'], ['view', 'View', 'عرض']].map(([id, en, ar]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{tt(en, ar)}</button>)}
        <span className="sx__sp" />
        <RB icon="ed-undo" title={tt('Undo (Ctrl+Z)', 'تراجع (Ctrl+Z)')} onClick={A.undo} disabled={!canUndo} />
        <RB icon="ed-redo" title={tt('Redo (Ctrl+Y)', 'إعادة (Ctrl+Y)')} onClick={A.redo} disabled={!canRedo} />
      </div>
      <div className="sx__tools" role="tabpanel">
        {tab === 'home' && (
          <>
            <div className="sx__grp">
              <RB icon="ed-paste" label={tt('Paste', 'لصق')} onClick={() => A.paste('all')} />
              <Drop title={tt('Paste special', 'لصق خاص')}>
                <Item onClick={() => A.paste('values')}>{tt('Values', 'القيم')}</Item><Item onClick={() => A.paste('formulas')}>{tt('Formulas', 'الصيغ')}</Item><Item onClick={() => A.paste('formats')}>{tt('Formatting', 'التنسيق')}</Item>
              </Drop>
              <RB icon="ed-cut" title={tt('Cut (Ctrl+X)', 'قص (Ctrl+X)')} onClick={() => A.copy(true)} /><RB icon="copy" title={tt('Copy (Ctrl+C)', 'نسخ (Ctrl+C)')} onClick={() => A.copy(false)} />
            </div>
            <div className="sx__grp">
              <select className="sx__sel" aria-label={tt('Font', 'الخط')} value={ast.font || 'Calibri'} onChange={(e) => A.style({ font: e.target.value === 'Calibri' ? null : e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
              <select className="sx__sel sx__sel--s" aria-label={tt('Font size', 'حجم الخط')} value={sz} onChange={(e) => A.style({ fs: +e.target.value === 10.5 ? null : +e.target.value })}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
              <RB icon="ed-bold" title={tt('Bold (Ctrl+B)', 'غامق (Ctrl+B)')} on={!!ast.b} onClick={() => A.toggle('b')} /><RB icon="ed-italic" title={tt('Italic (Ctrl+I)', 'مائل (Ctrl+I)')} on={!!ast.i} onClick={() => A.toggle('i')} />
              <RB icon="ed-underline" title={tt('Underline (Ctrl+U)', 'تسطير (Ctrl+U)')} on={!!ast.u} onClick={() => A.toggle('u')} /><RB icon="ed-strike" title={tt('Strikethrough (Ctrl+5)', 'يتوسطه خط')} on={!!ast.st} onClick={() => A.toggle('st')} />
              <Drop icon="ed-outline" title={tt('Borders', 'الحدود')}>
                <Item onClick={() => A.borders('all')}>{tt('All borders', 'كل الحدود')}</Item><Item onClick={() => A.borders('outer')}>{tt('Outside borders', 'حدود خارجية')}</Item><Item onClick={() => A.borders('inner')}>{tt('Inside borders', 'حدود داخلية')}</Item>
                <Item onClick={() => A.borders('thickBox')}>{tt('Thick box', 'إطار سميك')}</Item><Item onClick={() => A.borders('bottom')}>{tt('Bottom', 'سفلي')}</Item><Item onClick={() => A.borders('top')}>{tt('Top', 'علوي')}</Item><Item onClick={() => A.borders('left')}>{tt('Left', 'أيسر')}</Item><Item onClick={() => A.borders('right')}>{tt('Right', 'أيمن')}</Item><Item onClick={() => A.borders('none')}>{tt('No border', 'بدون حدود')}</Item>
              </Drop>
              <Drop icon="ed-fill" title={tt('Fill color', 'لون التعبئة')}><Colors value={ast.bg} tt={tt} none={tt('No fill', 'بدون تعبئة')} onPick={(c) => A.style({ bg: c })} /></Drop>
              <Drop icon="ed-font-color" title={tt('Font color', 'لون الخط')}><Colors value={ast.color} tt={tt} none={tt('Automatic', 'تلقائي')} onPick={(c) => A.style({ color: c })} /></Drop>
            </div>
            <div className="sx__grp">
              <RB icon="ed-valign-top" title={tt('Top align', 'محاذاة علوية')} on={ast.va === 'top'} onClick={() => A.style({ va: ast.va === 'top' ? null : 'top' })} /><RB icon="ed-valign-mid" title={tt('Middle align', 'محاذاة وسطية')} on={ast.va === 'center'} onClick={() => A.style({ va: ast.va === 'center' ? null : 'center' })} /><RB icon="ed-valign-bottom" title={tt('Bottom align', 'محاذاة سفلية')} on={!ast.va || ast.va === 'bottom'} onClick={() => A.style({ va: null })} />
              <RB icon="ed-align-left" title={tt('Align left', 'يسار')} on={ast.al === 'left'} onClick={() => A.style({ al: ast.al === 'left' ? null : 'left' })} /><RB icon="ed-align-center" title={tt('Center', 'توسيط')} on={ast.al === 'center'} onClick={() => A.style({ al: ast.al === 'center' ? null : 'center' })} /><RB icon="ed-align-right" title={tt('Align right', 'يمين')} on={ast.al === 'right'} onClick={() => A.style({ al: ast.al === 'right' ? null : 'right' })} />
              <RB icon="ed-indent" title={tt('Increase indent', 'زيادة المسافة')} onClick={() => A.style({ ind: (ast.ind || 0) + 1, al: ast.al || 'left' })} /><RB icon="ed-outdent" title={tt('Decrease indent', 'تقليل المسافة')} onClick={() => A.style({ ind: Math.max(0, (ast.ind || 0) - 1) || null })} />
              <RB label={tt('Wrap', 'التفاف')} on={!!ast.wrap} onClick={() => A.toggle('wrap')} />
              <RB icon="ed-merge" label={tt('Merge', 'دمج')} title={tt('Merge & center', 'دمج وتوسيط')} onClick={() => { A.merge(true); A.style({ al: 'center' }); }} /><RB icon="ed-split" title={tt('Unmerge', 'إلغاء الدمج')} onClick={() => A.merge(false)} />
            </div>
            <div className="sx__grp">
              <select className="sx__sel sx__sel--n" aria-label={tt('Number format', 'تنسيق الرقم')} value={cur ? cur.id : 'custom'} onChange={(e) => { const f = NUM_FORMATS.find((x) => x.id === e.target.value); if (f) A.style({ nf: f.code === 'General' ? null : f.code }); }}>
                {!cur && <option value="custom">{nf}</option>}{NUM_FORMATS.map((f) => <option key={f.id} value={f.id}>{tt(f.en, f.ar)}</option>)}
              </select>
              <RB label="$" title={tt('Currency', 'عملة')} onClick={() => A.style({ nf: '"$"#,##0.00' })} /><RB label="%" title={tt('Percent', 'نسبة')} onClick={() => A.style({ nf: '0%' })} /><RB label="," title={tt('Comma style', 'فواصل')} onClick={() => A.style({ nf: '#,##0.00' })} />
              <RB label=".0→" title={tt('Increase decimals', 'زيادة الكسور')} onClick={() => A.style({ nf: decimals(ast.nf, 1) })} /><RB label="←.0" title={tt('Decrease decimals', 'تقليل الكسور')} onClick={() => A.style({ nf: decimals(ast.nf, -1) })} />
            </div>
            <div className="sx__grp">
              <Drop icon="ed-row-plus" label={tt('Insert', 'إدراج')}><Item onClick={A.insertRows}>{tt('Insert rows', 'إدراج صفوف')}</Item><Item onClick={A.insertCols}>{tt('Insert columns', 'إدراج أعمدة')}</Item></Drop>
              <Drop icon="ed-row-minus" label={tt('Delete', 'حذف')}><Item onClick={A.deleteRows}>{tt('Delete rows', 'حذف صفوف')}</Item><Item onClick={A.deleteCols}>{tt('Delete columns', 'حذف أعمدة')}</Item></Drop>
              <Drop label={tt('Format', 'تنسيق')}>
                <Item onClick={() => { const v = window.prompt(tt('Row height (px)', 'ارتفاع الصف (بكسل)'), '24'); if (v && +v > 0) { const s = A.sel; A.ctl.setRowH(A.sheet, Array.from({ length: s.r2 - s.r1 + 1 }, (_, i) => s.r1 + i), +v); } }}>{tt('Row height…', 'ارتفاع الصف…')}</Item>
                <Item onClick={() => { const v = window.prompt(tt('Column width (px)', 'عرض العمود (بكسل)'), '80'); if (v && +v > 0) { const s = A.sel; A.ctl.setColW(A.sheet, Array.from({ length: s.c2 - s.c1 + 1 }, (_, i) => s.c1 + i), +v); } }}>{tt('Column width…', 'عرض العمود…')}</Item>
                <Item onClick={() => A.hide('r', true)}>{tt('Hide rows', 'إخفاء الصفوف')}</Item><Item onClick={() => A.hide('c', true)}>{tt('Hide columns', 'إخفاء الأعمدة')}</Item><Item onClick={A.unhideAll}>{tt('Unhide all', 'إظهار الكل')}</Item>
              </Drop>
            </div>
            <div className="sx__grp">
              <RB label="Σ" title={tt('AutoSum (Alt+=)', 'جمع تلقائي (Alt+=)')} onClick={A.autoSum} />
              <Drop icon="ed-fill" label={tt('Fill', 'تعبئة')}><Item onClick={A.fillDown}>{tt('Down (Ctrl+D)', 'لأسفل (Ctrl+D)')}</Item><Item onClick={A.fillRight}>{tt('Right (Ctrl+R)', 'لليمين (Ctrl+R)')}</Item></Drop>
              <Drop icon="ed-clear" label={tt('Clear', 'مسح')}><Item onClick={() => A.clear('all')}>{tt('Clear all', 'مسح الكل')}</Item><Item onClick={() => A.clear('formats')}>{tt('Clear formats', 'مسح التنسيق')}</Item><Item onClick={() => A.clear('contents')}>{tt('Clear contents', 'مسح المحتوى')}</Item></Drop>
              <Drop label={tt('Sort', 'ترتيب')}><Item onClick={() => A.sort(true)}>{tt('Sort A → Z', 'تصاعدي')}</Item><Item onClick={() => A.sort(false)}>{tt('Sort Z → A', 'تنازلي')}</Item></Drop>
              <RB icon="ed-find" label={tt('Find', 'بحث')} title={tt('Find & replace (Ctrl+F / Ctrl+H)', 'بحث واستبدال')} onClick={() => A.openFind(false)} />
            </div>
          </>
        )}
        {tab === 'formulas' && (
          <>
            <div className="sx__grp"><RB label="fx" title={tt('Insert function', 'إدراج دالة')} onClick={() => A.startEdit('=', 'edit')} /><RB label="Σ" title="AutoSum" onClick={A.autoSum} /></div>
            <div className="sx__grp">
              {Object.entries(CATS).map(([cat, list]) => (
                <Drop key={cat} label={tt(cat, { Math: 'رياضيات', Statistical: 'إحصاء', Logical: 'منطقية', Text: 'نص', 'Lookup & Reference': 'بحث ومراجع', 'Dynamic arrays': 'مصفوفات ديناميكية', 'Date & Time': 'تاريخ ووقت', Financial: 'مالية' }[cat])} wide>
                  <div className="sx__fnl">{list.split(' ').filter((n) => FUNCS[n]).map((n) => <Item key={n} onClick={() => A.insertFn(n)}>{n}</Item>)}</div>
                </Drop>
              ))}
            </div>
            <div className="sx__grp">
              <RB label={tt('Show formulas', 'إظهار الصيغ')} title="Ctrl+`" on={A.view.showF} onClick={() => A.setView({ showF: !A.view.showF })} />
              <RB label={tt('Define name', 'تعريف اسم')} onClick={() => { const n = window.prompt(tt('Name for the selection:', 'اسم للتحديد:')); if (n && /^[A-Za-z_][\w.]*$/.test(n)) A.defineName(n); }} />
            </div>
          </>
        )}
        {tab === 'data' && (
          <div className="sx__grp">
            <RB label={tt('Sort A→Z', 'تصاعدي')} onClick={() => A.sort(true)} /><RB label={tt('Sort Z→A', 'تنازلي')} onClick={() => A.sort(false)} />
            <RB icon="ed-find" label={tt('Find & replace', 'بحث واستبدال')} onClick={() => A.openFind(true)} />
            <RB label={tt('Fill down', 'تعبئة لأسفل')} onClick={A.fillDown} /><RB label={tt('Fill right', 'تعبئة لليمين')} onClick={A.fillRight} />
          </div>
        )}
        {tab === 'view' && (
          <div className="sx__grp">
            <RB label={tt('Gridlines', 'خطوط الشبكة')} on={A.view.grid} onClick={() => A.setView({ grid: !A.view.grid })} />
            <RB label={tt('Headings', 'العناوين')} on={A.view.head} onClick={() => A.setView({ head: !A.view.head })} />
            <RB label={tt('Formula bar', 'شريط الصيغة')} on={A.view.bar} onClick={() => A.setView({ bar: !A.view.bar })} />
            <Drop label={tt('Freeze panes', 'تجميد')}><Item onClick={() => A.freeze(A.sel.ar, A.sel.ac)}>{tt('Freeze at selection', 'تجميد عند التحديد')}</Item><Item onClick={() => A.freeze(1, 0)}>{tt('Top row', 'الصف العلوي')}</Item><Item onClick={() => A.freeze(0, 1)}>{tt('First column', 'العمود الأول')}</Item><Item onClick={() => A.freeze(0, 0)}>{tt('Unfreeze', 'إلغاء التجميد')}</Item></Drop>
            <RB label={A.theme === 'dark' ? tt('Light', 'فاتح') : tt('Dark', 'داكن')} onClick={() => A.setTheme(A.theme === 'dark' ? 'light' : 'dark')} />
            <RB label="100%" onClick={() => A.setView({ z: 1 })} />
          </div>
        )}
      </div>
    </div>
  );
}
