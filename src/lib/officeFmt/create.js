/**
 * "New file" factory — creates a brand-new file of (almost) any type from nothing, so the user never needs to own a file first.
 *   NEW_TYPES                      -> the catalogue shown by <NewFileDialog> (Word, Excel, PowerPoint, PDF, CSV, Markdown, image, code…)
 *   createFile({ type, template, name, locale }) -> Promise<File>   (the bytes + a clean file name with the right extension)
 *   withExt(name, ext)             -> "Report" -> "Report.docx"
 * Word / Excel / PowerPoint / PDF / PNG are real binary files built in the browser (libraries load on demand);
 * everything else is plain text. The result opens straight in the existing viewer / editors (FileViewer, code editor).
 */
import { buildPptx } from './newPptx';

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', png: 'image/png', csv: 'text/csv', tsv: 'text/tab-separated-values', md: 'text/markdown', txt: 'text/plain',
  json: 'application/json', html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', xml: 'application/xml',
};

const L = (en, ar) => ({ en, ar });

/** Starter templates per type: `id` is passed to createFile; the first one is the blank file. */
export const NEW_TYPES = [
  { id: 'docx', ext: 'docx', group: 'office', color: '#2b6cdf', label: L('Word document', 'مستند Word'), hint: L('Letters, reports, CVs', 'خطابات، تقارير، سيرة ذاتية'),
    templates: [{ id: 'blank', label: L('Blank document', 'مستند فارغ') }, { id: 'report', label: L('Report', 'تقرير') }, { id: 'letter', label: L('Letter', 'خطاب رسمي') }, { id: 'minutes', label: L('Meeting minutes', 'محضر اجتماع') }] },
  { id: 'xlsx', ext: 'xlsx', group: 'office', color: '#16a34a', label: L('Excel workbook', 'جدول Excel'), hint: L('Tables, lists, grades', 'جداول، قوائم، درجات'),
    templates: [{ id: 'blank', label: L('Blank workbook', 'جدول فارغ') }, { id: 'tasks', label: L('Task tracker', 'متابعة مهام') }, { id: 'attendance', label: L('Attendance sheet', 'كشف حضور') }, { id: 'grades', label: L('Grades sheet', 'كشف درجات') }] },
  { id: 'pptx', ext: 'pptx', group: 'office', color: '#ea580c', label: L('PowerPoint presentation', 'عرض PowerPoint'), hint: L('Slides for a talk or a project', 'شرائح لعرض أو مشروع'),
    templates: [{ id: 'blank', label: L('Title slide only', 'شريحة عنوان فقط') }, { id: 'outline', label: L('Presentation outline (5 slides)', 'هيكل عرض (٥ شرائح)') }, { id: 'empty', label: L('Empty slide', 'شريحة فاضية') }] },
  { id: 'pdf', ext: 'pdf', group: 'office', color: '#e5484d', label: L('PDF document', 'ملف PDF'), hint: L('Blank pages you can annotate / fill', 'صفحات فاضية تكتب وترسم عليها'),
    templates: [{ id: 'blank', label: L('Blank A4 page', 'صفحة A4 فارغة') }, { id: 'landscape', label: L('Blank A4 landscape', 'صفحة A4 أفقية') }, { id: 'lined', label: L('Lined paper (A4)', 'ورقة مسطّرة (A4)') }, { id: 'grid', label: L('Grid paper (A4)', 'ورقة مربعات (A4)') }] },
  { id: 'csv', ext: 'csv', group: 'data', color: '#0d9488', label: L('CSV table', 'جدول CSV'), hint: L('Plain table for data tools', 'جدول بسيط لأدوات البيانات'), templates: [{ id: 'blank', label: L('Empty table', 'جدول فارغ') }] },
  { id: 'tsv', ext: 'tsv', group: 'data', color: '#0d9488', label: L('TSV table', 'جدول TSV'), hint: L('Tab-separated table', 'جدول مفصول بـ Tab'), templates: [{ id: 'blank', label: L('Empty table', 'جدول فارغ') }] },
  { id: 'json', ext: 'json', group: 'data', color: '#ca8a04', label: L('JSON data', 'بيانات JSON'), hint: L('Structured data', 'بيانات منظّمة'), templates: [{ id: 'blank', label: L('Empty object', 'كائن فارغ') }, { id: 'list', label: L('Empty list', 'قائمة فارغة') }] },
  { id: 'md', ext: 'md', group: 'text', color: '#64748b', label: L('Markdown note', 'ملاحظة Markdown'), hint: L('Notes, README, docs', 'ملاحظات، README، توثيق'), templates: [{ id: 'blank', label: L('Heading only', 'عنوان فقط') }, { id: 'readme', label: L('README', 'README') }] },
  { id: 'txt', ext: 'txt', group: 'text', color: '#64748b', label: L('Text file', 'ملف نصي'), hint: L('Plain text', 'نص عادي'), templates: [{ id: 'blank', label: L('Empty', 'فارغ') }] },
  { id: 'png', ext: 'png', group: 'image', color: '#8b5cf6', label: L('Image (PNG)', 'صورة (PNG)'), hint: L('Blank canvas to draw on', 'لوحة فاضية ترسم عليها'),
    templates: [{ id: 'white', label: L('White canvas 1280×720', 'لوحة بيضاء ١٢٨٠×٧٢٠') }, { id: 'square', label: L('White square 1024×1024', 'مربع أبيض ١٠٢٤×١٠٢٤') }, { id: 'transparent', label: L('Transparent 1280×720', 'شفافة ١٢٨٠×٧٢٠') }, { id: 'dark', label: L('Dark canvas 1280×720', 'لوحة داكنة ١٢٨٠×٧٢٠') }] },
  { id: 'html', ext: 'html', group: 'code', color: '#e34c26', label: L('HTML page', 'صفحة HTML'), hint: L('A starter web page', 'صفحة ويب جاهزة للبدء'), templates: [{ id: 'blank', label: L('Starter page', 'صفحة بداية') }] },
  { id: 'css', ext: 'css', group: 'code', color: '#2563eb', label: L('CSS stylesheet', 'ملف CSS'), hint: L('Styles', 'تنسيقات'), templates: [{ id: 'blank', label: L('Empty', 'فارغ') }] },
  { id: 'js', ext: 'js', group: 'code', color: '#eab308', label: L('JavaScript', 'JavaScript'), hint: L('Script', 'سكربت'), templates: [{ id: 'blank', label: L('Empty', 'فارغ') }] },
  { id: 'py', ext: 'py', group: 'code', color: '#3b82f6', label: L('Python', 'Python'), hint: L('Script', 'سكربت'), templates: [{ id: 'blank', label: L('Empty', 'فارغ') }] },
];
export const NEW_GROUPS = [
  { id: 'office', label: L('Office & PDF', 'مستندات و PDF') }, { id: 'data', label: L('Data', 'بيانات') }, { id: 'text', label: L('Text', 'نصوص') },
  { id: 'image', label: L('Image', 'صور') }, { id: 'code', label: L('Code', 'أكواد') },
];

export const typeById = (id) => NEW_TYPES.find((t) => t.id === id);
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const bad = /[\\/:*?"<>|]+/g;
export const cleanName = (n) => String(n || '').replace(bad, ' ').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);
/** "Report" + docx -> "Report.docx"; an already-correct extension is kept. */
export function withExt(name, ext) {
  const base = cleanName(name) || 'Untitled';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.[a-z0-9]{1,5}$/i, (m) => (typeById(m.slice(1).toLowerCase()) ? '' : m))}.${ext}`;
}
export const defaultName = (type, locale) => {
  const t = typeById(type); const ar = locale === 'ar';
  const base = { docx: ['Document', 'مستند'], xlsx: ['Workbook', 'جدول'], pptx: ['Presentation', 'عرض تقديمي'], pdf: ['Document', 'ملف'], png: ['Image', 'صورة'], csv: ['Table', 'جدول'], tsv: ['Table', 'جدول'], md: ['Note', 'ملاحظة'], txt: ['Untitled', 'بدون عنوان'], json: ['data', 'data'], html: ['index', 'index'], css: ['style', 'style'], js: ['script', 'script'], py: ['main', 'main'] }[type] || ['Untitled', 'بدون عنوان'];
  return `${base[ar ? 1 : 0]}.${t?.ext || type}`;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = (locale) => new Date().toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

/* ------------------------------------------------------------------ Word */
function docxHtml(template, title, ar) {
  const t = esc(title);
  if (template === 'report') {
    return ar
      ? `<h1 style="text-align:center">${t}</h1><p style="text-align:center">${today('ar')}</p><h2>الملخص</h2><p><br></p><h2>المقدمة</h2><p><br></p><h2>المحتوى</h2><p><br></p><h2>الخلاصة</h2><p><br></p>`
      : `<h1 style="text-align:center">${t}</h1><p style="text-align:center">${today('en')}</p><h2>Summary</h2><p><br></p><h2>Introduction</h2><p><br></p><h2>Body</h2><p><br></p><h2>Conclusion</h2><p><br></p>`;
  }
  if (template === 'letter') {
    return ar
      ? `<p>${today('ar')}</p><p><br></p><p>السيد / السيدة ..................</p><p>تحية طيبة وبعد،</p><p><br></p><p>أكتب إليكم بخصوص ..................</p><p><br></p><p>وتفضلوا بقبول فائق الاحترام والتقدير،</p><p><br></p><p>الاسم: ..................</p>`
      : `<p>${today('en')}</p><p><br></p><p>Dear ..................,</p><p><br></p><p>I am writing to you regarding ..................</p><p><br></p><p>Kind regards,</p><p><br></p><p>..................</p>`;
  }
  if (template === 'minutes') {
    const th = (x) => `<th style="background-color:#E8ECFF">${x}</th>`;
    const row = (n) => `<tr>${Array.from({ length: n }, () => '<td><br></td>').join('')}</tr>`;
    return ar
      ? `<h1>${t}</h1><p>التاريخ: ${today('ar')}</p><p>الحضور: ..................</p><h2>جدول الأعمال</h2><ol><li><br></li></ol><h2>القرارات والمهام</h2><table><tbody><tr>${th('القرار / المهمة')}${th('المسؤول')}${th('الموعد')}</tr>${row(3)}${row(3)}${row(3)}</tbody></table><p><br></p>`
      : `<h1>${t}</h1><p>Date: ${today('en')}</p><p>Attendees: ..................</p><h2>Agenda</h2><ol><li><br></li></ol><h2>Decisions &amp; actions</h2><table><tbody><tr>${th('Decision / action')}${th('Owner')}${th('Due')}</tr>${row(3)}${row(3)}${row(3)}</tbody></table><p><br></p>`;
  }
  return '<p><br></p>';
}
async function makeDocx(template, title, locale) {
  const { htmlToDocx, sanitizeHtml } = await import('./docx');
  const ar = locale === 'ar';
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(docxHtml(template, title.replace(/\.docx$/i, ''), ar));
  if (ar) root.setAttribute('dir', 'rtl');
  return htmlToDocx(root, { defaults: { rtl: ar, font: ar ? 'Arial' : 'Calibri' } });
}

/* ----------------------------------------------------------------- Excel */
function sheetRows(template, ar) {
  if (template === 'tasks') return ar ? [['المهمة', 'المسؤول', 'الأولوية', 'الحالة', 'الموعد'], ['', '', '', '', ''], ['', '', '', '', '']] : [['Task', 'Owner', 'Priority', 'Status', 'Due date'], ['', '', '', '', ''], ['', '', '', '', '']];
  if (template === 'attendance') return ar ? [['الاسم', 'رقم الطالب', 'المحاضرة ١', 'المحاضرة ٢', 'المحاضرة ٣', 'المحاضرة ٤', 'ملاحظات']] : [['Name', 'Student ID', 'Lecture 1', 'Lecture 2', 'Lecture 3', 'Lecture 4', 'Notes']];
  if (template === 'grades') return ar ? [['الاسم', 'رقم الطالب', 'أعمال السنة', 'الميد', 'النهائي', 'المجموع']] : [['Name', 'Student ID', 'Coursework', 'Midterm', 'Final', 'Total']];
  return [['']];
}
async function makeXlsx(template, title, locale) {
  const { buildSheets } = await import('./xlsx');
  const ar = locale === 'ar';
  return buildSheets([{ name: ar ? 'ورقة1' : 'Sheet1', cells: sheetRows(template, ar) }], 'xlsx', { rtl: ar });
}

/* ------------------------------------------------------------ PowerPoint */
function makePptx(template, title, locale) {
  const ar = locale === 'ar'; const name = title.replace(/\.pptx$/i, '');
  if (template === 'empty') return buildPptx({ slides: [{ layout: 'blank' }], rtl: ar, title: name });
  if (template === 'outline') {
    return buildPptx({
      rtl: ar, title: name,
      slides: ar
        ? [{ layout: 'title', title: name, body: [today('ar')] }, { layout: 'content', title: 'المحتوى', body: ['النقطة الأولى', 'النقطة الثانية', 'النقطة الثالثة'] }, { layout: 'content', title: 'المشكلة والحل', body: ['المشكلة', 'الحل المقترح'] }, { layout: 'content', title: 'النتائج', body: ['النتيجة الأولى', 'النتيجة الثانية'] }, { layout: 'title', title: 'شكرًا لكم', body: ['أسئلة؟'] }]
        : [{ layout: 'title', title: name, body: [today('en')] }, { layout: 'content', title: 'Agenda', body: ['First point', 'Second point', 'Third point'] }, { layout: 'content', title: 'Problem & solution', body: ['The problem', 'The proposed solution'] }, { layout: 'content', title: 'Results', body: ['First result', 'Second result'] }, { layout: 'title', title: 'Thank you', body: ['Questions?'] }],
    });
  }
  return buildPptx({ slides: [{ layout: 'title', title: name, body: [''] }], rtl: ar, title: name });
}

/* ------------------------------------------------------------------- PDF */
async function makePdf(template) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setCreator('UIP'); doc.setProducer('UIP');
  const [w, h] = template === 'landscape' ? [841.89, 595.28] : [595.28, 841.89];
  const page = doc.addPage([w, h]);
  if (template === 'lined') for (let y = h - 90; y > 50; y -= 26) page.drawLine({ start: { x: 50, y }, end: { x: w - 50, y }, thickness: 0.6, color: rgb(0.72, 0.76, 0.85) });
  if (template === 'grid') {
    for (let x = 40; x <= w - 40; x += 20) page.drawLine({ start: { x, y: 40 }, end: { x, y: h - 40 }, thickness: 0.4, color: rgb(0.8, 0.83, 0.9) });
    for (let y = 40; y <= h - 40; y += 20) page.drawLine({ start: { x: 40, y }, end: { x: w - 40, y }, thickness: 0.4, color: rgb(0.8, 0.83, 0.9) });
  }
  return new Blob([await doc.save()], { type: MIME.pdf });
}

/* ----------------------------------------------------------------- image */
function makePng(template) {
  const [w, h] = template === 'square' ? [1024, 1024] : [1280, 720];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (template !== 'transparent') { ctx.fillStyle = template === 'dark' ? '#111827' : '#ffffff'; ctx.fillRect(0, 0, w, h); }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
}

/* ------------------------------------------------------------------ text */
function makeText(type, template, title) {
  const base = title.replace(/\.[a-z0-9]+$/i, '');
  if (type === 'md') return template === 'readme' ? `# ${base}\n\n## About\n\n## Getting started\n\n## Usage\n\n## License\n` : `# ${base}\n\n`;
  if (type === 'json') return template === 'list' ? '[]\n' : '{}\n';
  if (type === 'html') return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${esc(base)}</title>\n</head>\n<body>\n  <h1>${esc(base)}</h1>\n</body>\n</html>\n`;
  if (type === 'csv' || type === 'tsv' || type === 'txt' || type === 'css' || type === 'js' || type === 'py') return '';
  return '';
}

/** @returns {Promise<File>} */
export async function createFile({ type, template, name, locale = 'en' }) {
  const t = typeById(type);
  if (!t) throw new Error('Unknown file type.');
  const tpl = template || t.templates[0].id;
  const fileName = withExt(name || defaultName(type, locale).replace(/\.[^.]+$/, ''), t.ext);
  let body;
  if (type === 'docx') body = await makeDocx(tpl, fileName, locale);
  else if (type === 'xlsx') body = await makeXlsx(tpl, fileName, locale);
  else if (type === 'pptx') body = makePptx(tpl, fileName, locale);
  else if (type === 'pdf') body = await makePdf(tpl);
  else if (type === 'png') body = await makePng(tpl);
  else body = new Blob([type === 'csv' || type === 'tsv' ? '' : makeText(type, tpl, fileName)], { type: `${MIME[type] || 'text/plain'};charset=utf-8` });
  return new File([body], fileName, { type: MIME[type] || body.type || 'application/octet-stream' });
}
export const isRtlText = (s) => RTL_RE.test(String(s || ''));
