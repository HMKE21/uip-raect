import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import OfficeShell from './OfficeShell';
import { Btn } from './EditorUI';
import { docxToHtml, htmlToDocx, sanitizeHtml } from '../../lib/officeFmt/docx';
import '../../styles/css/office.css';

const cmd = (c, v) => { document.execCommand(c, false, v); };

/** Read-only page view of a .docx (formatting-preserving HTML) for the file viewer. */
export function DocxPreview({ blob, tt }) {
  const [html, setHtml] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { let d = false; blob.arrayBuffer().then(docxToHtml).then((h) => !d && setHtml(h)).catch((e) => !d && setErr(e?.message || String(e))); return () => { d = true; }; }, [blob]);
  if (err) return <p className="st-fv__empty">{err}</p>;
  if (html === null) return <p className="st-fv__empty">{tt('Loading…', 'جارٍ التحميل…')}</p>;
  return <div className="dx__page" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Word editor: rich text page, saved back as a real .docx. */
export default function DocxView({ blob, fileName, tt, rtl, guardRef, onSave, onClose, draftKey, startDirty = false }) {
  const [status, setStatus] = useState('loading'); const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(startDirty);
  const [ver, setVer] = useState(0);
  const page = useRef(null); const initial = useRef('');

  useEffect(() => {
    let dead = false;
    blob.arrayBuffer().then(docxToHtml).then((h) => { if (!dead) { initial.current = h; setStatus('ready'); } }).catch((e) => { if (!dead) { setErr(e?.message || String(e)); setStatus('error'); } });
    return () => { dead = true; };
  }, [blob]);
  useEffect(() => { if (status === 'ready' && page.current) { page.current.innerHTML = initial.current; page.current.focus(); } }, [status]);

  const build = useCallback(() => htmlToDocx(page.current), []);
  const mark = () => { setDirty(true); setVer((v) => v + 1); };
  const keep = (e) => e.preventDefault(); // keep the selection when clicking toolbar buttons
  const T = (icon, title, fn) => <Btn icon={icon} title={title} onMouseDown={keep} onClick={() => { fn(); page.current?.focus(); mark(); }} />;

  const cell = () => { const s = window.getSelection(); const n = s?.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el?.closest?.('td,th') || null; };
  const insertTable = () => {
    const r = Number(window.prompt(tt('Rows', 'عدد الصفوف'), '3')) || 0; const c = Number(window.prompt(tt('Columns', 'عدد الأعمدة'), '3')) || 0;
    if (r < 1 || c < 1 || r > 50 || c > 12) return;
    cmd('insertHTML', `<table><tbody>${Array.from({ length: r }, () => `<tr>${Array.from({ length: c }, () => '<td><p><br></p></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`);
  };
  const addRow = () => { const td = cell(); if (!td) return; const tr = td.parentElement; const n = tr.cloneNode(true); n.querySelectorAll('td,th').forEach((x) => { x.innerHTML = '<p><br></p>'; }); tr.after(n); };
  const delRow = () => { const td = cell(); if (!td) return; const tr = td.parentElement; const t = tr.closest('table'); tr.remove(); if (!t.querySelector('tr')) t.remove(); };
  const addCol = () => { const td = cell(); if (!td) return; const i = Array.from(td.parentElement.children).indexOf(td); td.closest('table').querySelectorAll('tr').forEach((tr) => { const x = document.createElement(tr.children[i]?.tagName === 'TH' ? 'th' : 'td'); x.innerHTML = '<p><br></p>'; tr.children[i]?.after(x); }); };
  const delCol = () => { const td = cell(); if (!td) return; const i = Array.from(td.parentElement.children).indexOf(td); const t = td.closest('table'); t.querySelectorAll('tr').forEach((tr) => tr.children[i]?.remove()); if (!t.querySelector('td,th')) t.remove(); };
  const link = () => { const u = window.prompt(tt('Link address (https://…)', 'عنوان الرابط (https://…)')); if (u && /^(https?:|mailto:)/i.test(u.trim())) cmd('createLink', u.trim()); };
  const setDir = (d) => { const s = window.getSelection(); const n = s?.anchorNode; const el = (n && (n.nodeType === 1 ? n : n.parentElement))?.closest?.('p,h1,h2,h3,h4,h5,h6,li,td,th,div'); if (el && el !== page.current) { el.setAttribute('dir', d); el.style.textAlign = d === 'rtl' ? 'right' : 'left'; } };
  const image = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/gif,image/webp';
    i.onchange = () => { const f = i.files?.[0]; if (!f) return; if (f.size > 3 * 1048576) { setErr(tt('Picture is larger than 3 MB.', 'الصورة أكبر من 3 ميجا.')); return; } const r = new FileReader(); r.onload = () => { page.current?.focus(); cmd('insertImage', r.result); mark(); }; r.readAsDataURL(f); };
    i.click();
  };
  const onPaste = (e) => {
    const html = e.clipboardData.getData('text/html'); const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (html) cmd('insertHTML', sanitizeHtml(html)); else cmd('insertText', text);
    mark();
  };

  if (status === 'loading') return <div className="ed ed--center"><span className="st-fv-spinner" /><p className="ed__hint">{tt('Opening the document…', 'جارٍ فتح المستند…')}</p></div>;
  if (status === 'error') return <div className="ed ed--center"><p className="ed__err">{err}</p><Btn label={tt('Close', 'إغلاق')} onClick={onClose} /></div>;

  const tools = (
    <div className="ed__top dx__tools">
      {T('ed-undo', tt('Undo', 'تراجع'), () => cmd('undo'))}{T('ed-redo', tt('Redo', 'إعادة'), () => cmd('redo'))}
      <span className="ed__sep" />
      <select aria-label={tt('Style', 'النمط')} defaultValue="P" onChange={(e) => { page.current?.focus(); cmd('formatBlock', e.target.value); mark(); }}>
        <option value="P">{tt('Paragraph', 'فقرة')}</option><option value="H1">{tt('Heading 1', 'عنوان 1')}</option><option value="H2">{tt('Heading 2', 'عنوان 2')}</option><option value="H3">{tt('Heading 3', 'عنوان 3')}</option>
      </select>
      <span className="ed__sep" />
      {T('ed-bold', tt('Bold (Ctrl+B)', 'عريض (Ctrl+B)'), () => cmd('bold'))}{T('ed-italic', tt('Italic (Ctrl+I)', 'مائل (Ctrl+I)'), () => cmd('italic'))}
      {T('ed-underline', tt('Underline (Ctrl+U)', 'تسطير (Ctrl+U)'), () => cmd('underline'))}{T('ed-strike', tt('Strikethrough', 'يتوسطه خط'), () => cmd('strikeThrough'))}
      <input type="color" className="dx__color" aria-label={tt('Text colour', 'لون النص')} defaultValue="#111827" onChange={(e) => { page.current?.focus(); cmd('foreColor', e.target.value); mark(); }} />
      <span className="ed__sep" />
      {T('ed-list', tt('Bullets', 'نقاط'), () => cmd('insertUnorderedList'))}{T('ed-list-ordered', tt('Numbering', 'ترقيم'), () => cmd('insertOrderedList'))}
      {T('ed-align-left', tt('Align left', 'محاذاة يسار'), () => cmd('justifyLeft'))}{T('ed-align-center', tt('Center', 'توسيط'), () => cmd('justifyCenter'))}{T('ed-align-right', tt('Align right', 'محاذاة يمين'), () => cmd('justifyRight'))}
      {T('ed-rtl', tt('Right-to-left paragraph', 'اتجاه الفقرة من اليمين'), () => setDir('rtl'))}
      <Btn label="LTR" title={tt('Left-to-right paragraph', 'اتجاه الفقرة من اليسار')} onMouseDown={keep} onClick={() => { setDir('ltr'); mark(); }} />
      <span className="ed__sep" />
      {T('link', tt('Link', 'رابط'), link)}{T('ed-image-plus', tt('Picture', 'صورة'), image)}{T('ed-table', tt('Table', 'جدول'), insertTable)}
      {T('ed-row-plus', tt('Add row', 'إضافة صف'), addRow)}{T('ed-col-plus', tt('Add column', 'إضافة عمود'), addCol)}
      <Btn icon="trash" label={tt('Row', 'صف')} className="ed__btn--danger" onMouseDown={keep} onClick={() => { delRow(); mark(); }} title={tt('Delete row', 'حذف الصف')} />
      <Btn icon="trash" label={tt('Col', 'عمود')} className="ed__btn--danger" onMouseDown={keep} onClick={() => { delCol(); mark(); }} title={tt('Delete column', 'حذف العمود')} />
    </div>
  );

  return (
    <OfficeShell fileName={fileName} tt={tt} guardRef={guardRef} onSave={onSave} onClose={onClose} dirty={dirty} build={build} onSaved={() => setDirty(false)} draftKey={draftKey} draftToken={ver} tools={tools}
      status={<p className="ed__hint ed__hint--note xg__note">{tt('Saved as a new .docx: headings, text styles, lists, tables, links and pictures are kept; headers, footers and page layout of the original are not.', 'بيتحفظ كملف .docx جديد: العناوين وتنسيق النص والقوائم والجداول والروابط والصور بتتحفظ، لكن الهيدر والفوتر وتخطيط الصفحة الأصلي لأ.')}</p>}>
      <div className="dx"><div className="dx__stage">
        <div ref={page} className="dx__page" contentEditable suppressContentEditableWarning spellCheck dir="auto" onInput={mark} onPaste={onPaste} />
      </div></div>
    </OfficeShell>
  );
}
