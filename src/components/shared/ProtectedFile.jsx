import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import Icon from '../Icon';
import { ProtectedImage, ProtectedPdf } from './ProtectedViewers';
import { THEMES } from '../zipbench/themePalettes';
import { buildTree, badgeOf, extOf, fmtBytes, isBinary, languageName, IMAGE_MIME } from '../zipbench/zipUtils';
import { themeById, themeVars } from '../zipbench/zipThemes';
import { TEXT_EXT, TEXT_NAMES, JSON_EXT } from '../../lib/driveFileKinds';
import '../../styles/css/file-viewer.css';
import '../../styles/css/editor.css';
import '../../styles/css/zip-workbench.css';
import '../../styles/css/theme-menu.css';
import '../../styles/css/zip-markdown.css';

const CodeEditor = lazy(() => import('../zipbench/CodeEditor'));
const JsonViewer = lazy(() => import('../admin/JsonViewer'));
const MarkdownView = lazy(() => import('../zipbench/MarkdownView'));
const DocxPreview = lazy(() => import('../editor/DocxView').then((m) => ({ default: m.DocxPreview })));
const XlsxPreview = lazy(() => import('../editor/XlsxView').then((m) => ({ default: m.XlsxPreview })));
const PptxPreview = lazy(() => import('../editor/PptxView').then((m) => ({ default: m.PptxPreview })));

const VID = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUD = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const SHEET = new Set(['xlsx', 'csv', 'tsv']);
const ZIPS = new Set(['zip', 'jar', 'war']);
const MD = new Set(['md', 'markdown', 'mdown', 'mkd']);
// formats we know are binary and have no viewer
const NO_VIEW = new Set(['rar', '7z', 'gz', 'tar', 'tgz', 'exe', 'dll', 'so', 'class', 'bin', 'dat', 'iso', 'psd', 'sqlite', 'db', 'pyc', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'doc', 'xls', 'ppt', 'odt', 'ods', 'odp', 'rtf', 'avi', 'mkv', 'apk', 'dmg', 'msi', 'ico']);

const MAX_TEXT_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_ENTRIES = 20000;
const MAX_UNPACKED = 600 * 1024 * 1024;

/** What a file name is shown as: image | video | audio | pdf | docx | pptx | sheet | zip | json | md | text | none | unknown (sniffed). */
export function kindOfName(name) {
  const e = extOf(name);
  if (IMAGE_MIME[e] && e !== 'ico') return 'image';
  if (VID.has(e)) return 'video';
  if (AUD.has(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (e === 'pptx') return 'pptx';
  if (SHEET.has(e)) return 'sheet';
  if (ZIPS.has(e)) return 'zip';
  if (JSON_EXT.has(e)) return 'json';
  if (MD.has(e)) return 'md';
  if (NO_VIEW.has(e)) return 'none';
  if (TEXT_EXT.has(e) || TEXT_NAMES.test(String(name || '').split('/').pop())) return 'text';
  return 'unknown';
}

const Spin = () => <div className="shp__state shp__state--sm"><span className="lp2-spinner" aria-hidden="true" /></div>;
const Note = ({ children }) => <p className="shp__note shp__note--pad">{children}</p>;

/** Object URL for a media element, created and revoked here — never exposed to the page. */
function ProtectedMedia({ blob, kind, mark }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  if (!url) return <Spin />;
  if (kind === 'audio') return <audio src={url} controls controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} />;
  return (
    <div className="shp__media">
      <video src={url} controls playsInline controlsList="nodownload noplaybackrate" disablePictureInPicture disableRemotePlayback onContextMenu={(e) => e.preventDefault()} />
      <span className="shp__mark" aria-hidden="true" title={mark} />
    </div>
  );
}

/** Reads the first MAX bytes of a blob as text. */
function useText(blob, max) {
  const [s, setS] = useState({ text: null, cut: false });
  useEffect(() => {
    let live = true;
    blob.slice(0, max).text().then((text) => { if (live) setS({ text, cut: blob.size > max }); }).catch(() => { if (live) setS({ text: '', cut: false }); });
    return () => { live = false; };
  }, [blob, max]);
  return s;
}

const siteDark = () => { try { return document.documentElement.getAttribute('data-theme') === 'dark'; } catch { return false; } };
const systemTheme = () => (siteDark() ? 'dark' : 'github-light');
/** Re-renders when the page's light / dark switch changes. */
function useSiteTheme() {
  const [v, setV] = useState(systemTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setV(systemTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return v;
}

/** Read-only code view: the platform's CodeMirror (highlighting, folding, line numbers, search) with a theme picker. */
/** Theme picker as a real menu (the browser's own <select> popup cannot be styled and has the default scrollbar). */
function ThemeMenu({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const list = useRef(null);
  const cur = THEMES.find((x) => x.id === value) || THEMES[0];
  useEffect(() => {
    if (!open) return undefined;
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = 210; const maxH = Math.min(340, window.innerHeight - 24);
      const below = window.innerHeight - r.bottom - 8 >= Math.min(maxH, 220);
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)),
        top: below ? r.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 6, width: w,
        maxH: below ? Math.min(maxH, window.innerHeight - r.bottom - 14) : Math.min(maxH, r.top - 14),
      });
    }
    const down = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    const away = (e) => { if (!list.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    window.addEventListener('resize', away); window.addEventListener('scroll', away, true);
    return () => {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', away); window.removeEventListener('scroll', away, true);
    };
  }, [open]);
  useEffect(() => { if (open && pos) list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, [open, pos]);
  return (
    <>
      <button ref={btn} type="button" className={`shp-theme${open ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <span>{cur.name}</span><Icon name="chevron-down" size={13} />
      </button>
      {open && pos && createPortal(
        <div ref={list} className="shp-theme__menu" role="listbox" aria-label={label} dir="ltr"
          style={{ ...themeVars(value), position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}>
          {THEMES.map((th) => (
            <button key={th.id} type="button" role="option" aria-selected={th.id === value} className={th.id === value ? 'is-on' : ''} onClick={() => { onChange(th.id); setOpen(false); }}>
              <span>{th.name}</span>{th.id === value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}

function ProtectedCode({ name, text, cut, tt }) {
  const site = useSiteTheme();
  const [theme, setTheme] = useState(site);
  useEffect(() => { setTheme(site); }, [site]);
  const [wrap, setWrap] = useState(false);
  const [size, setSize] = useState(13.5);
  const lines = useMemo(() => (text.match(/\n/g) || []).length + 1, [text]);
  return (
    <div className="shp-code" style={themeVars(theme)} dir="ltr">
      <div className="shp-code__bar">
        <strong title={name}>{name.split('/').pop()}</strong>
        <span>{languageName(name)} · {lines.toLocaleString()} {tt('lines', 'سطر')}</span>
        <i />
        <button type="button" className={wrap ? 'is-on' : ''} onClick={() => setWrap((w) => !w)}>{tt('Wrap', 'التفاف')}</button>
        <button type="button" onClick={() => setSize((s) => Math.max(10, s - 1))} aria-label="A−">A−</button>
        <button type="button" onClick={() => setSize((s) => Math.min(22, s + 1))} aria-label="A+">A+</button>
        <ThemeMenu value={theme} onChange={setTheme} label={tt('Theme', 'الثيم')} />
      </div>
      <div className="shp-code__body">
        <div className="zb-cm-wrap">
          <Suspense fallback={<Spin />}>
            <CodeEditor docId={`${name}:${text.length}`} path={name} initialText={text} readOnly wrap={wrap} fontSize={size} theme={theme} />
          </Suspense>
        </div>
      </div>
      {cut && <div className="shp-code__cut">{tt('Showing the first part of a large file.', 'معروض الجزء الأول من ملف كبير.')}</div>}
    </div>
  );
}

function TextKind({ name, blob, tt, kind, rtl, mark }) {
  const site = useSiteTheme();
  const limit = kind === 'json' ? MAX_JSON_BYTES : MAX_TEXT_BYTES;
  const { text, cut } = useText(blob, limit);
  const e = extOf(name);
  const parsed = useMemo(() => {
    if (kind !== 'json' || text === null || cut) return null;
    try {
      const value = e === 'jsonl' || e === 'ndjson' ? text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(text);
      return { value };
    } catch (err) { return { error: String(err?.message || err) }; }
  }, [kind, text, cut, e]);
  if (text === null) return <Spin />;
  if (kind === 'json' && parsed?.value !== undefined) {
    return (
      <div className="shp-sheet shp-sheet--json">
        <Suspense fallback={<Spin />}>
          <JsonViewer locked value={parsed.value} text={text} filename={name} meta={e === 'jsonl' || e === 'ndjson' ? 'JSON Lines' : undefined}
            labels={{ tree: tt('Tree', 'شجرة'), outline: tt('Outline', 'هيكل'), theme: tt('Theme', 'الثيم'), dark: tt('Dark', 'داكن'), light: tt('Light', 'فاتح'), code: tt('Code', 'كود'), search: tt('Search keys & values…', 'ابحث في المفاتيح والقيم…'), expand: tt('Expand all', 'فتح الكل'), collapse: tt('Collapse all', 'طي الكل'), full: tt('Full screen', 'ملء الشاشة'), exit: tt('Exit full screen', 'إنهاء ملء الشاشة'), nodes: tt('nodes', 'عقدة'), lines: tt('lines', 'سطر'), path: tt('Click a node to see its path', 'اضغط على عقدة لعرض مسارها'), matches: tt('matches', 'نتيجة'), wrap: tt('Wrap', 'التفاف') }} />
        </Suspense>
      </div>
    );
  }
  if (kind === 'md') {
    const th = themeById(site);
    return (
      <div className="shp-sheet shp-sheet--md">
        <Suspense fallback={<Spin />}><MarkdownView locked text={text} path={name} tt={tt} themeEd={th.ed} rtl={rtl} /></Suspense>
      </div>
    );
  }
  if (!text) return <Note>{tt('This file is empty.', 'الملف فارغ.')}</Note>;
  const shown = kind === 'json' && e === 'json' && parsed?.value !== undefined ? JSON.stringify(parsed.value, null, 2) : text;
  return <ProtectedCode name={name} text={shown} cut={cut} tt={tt} />;
}

/** Sniffs files with an unknown extension: text -> code view, otherwise no preview. */
function Sniffed({ name, blob, ...rest }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    let live = true;
    blob.slice(0, 8000).arrayBuffer().then((b) => { if (live) setT(isBinary(name, new Uint8Array(b)) ? 'none' : 'text'); }).catch(() => { if (live) setT('none'); });
    return () => { live = false; };
  }, [blob, name]);
  if (!t) return <Spin />;
  if (t === 'none') return <Note>{rest.tt('No preview is available for this file type.', 'مفيش معاينة متاحة لنوع الملف ده.')}</Note>;
  return <TextKind name={name} blob={blob} kind="text" {...rest} />;
}

/**
 * One file, shown with the platform's own viewer for its type — images / PDF (canvas + watermark), video / audio,
 * Word / Excel / PowerPoint, JSON (tree / outline / code), Markdown, source code (CodeMirror) and ZIP (browsable tree).
 * Everything is read-only and `locked`: no copy / download buttons are rendered.
 */
export default function ProtectedFile({ name, blob, mark, tt, rtl, depth = 0, onFail }) {
  const kind = kindOfName(name);
  const e = extOf(name);
  const fail = () => onFail?.();
  switch (kind) {
    case 'image': return <ProtectedImage blob={e === 'svg' ? new Blob([blob], { type: 'image/svg+xml' }) : blob} mark={mark} onFail={fail} />;
    case 'pdf': return <ProtectedPdf blob={new Blob([blob], { type: 'application/pdf' })} mark={mark} onFail={fail} />;
    case 'video': case 'audio': return <ProtectedMedia blob={blob} kind={kind} mark={mark} />;
    case 'docx': return <div className="shp-sheet shp-sheet--doc"><Suspense fallback={<Spin />}><DocxPreview blob={blob} tt={tt} /></Suspense></div>;
    case 'pptx': return <div className="shp-sheet shp-sheet--doc"><Suspense fallback={<Spin />}><PptxPreview blob={blob} tt={tt} /></Suspense></div>;
    case 'sheet': return <div className="shp-sheet shp-sheet--grid"><Suspense fallback={<Spin />}><XlsxPreview blob={blob} ext={e} tt={tt} rtl={rtl} /></Suspense></div>;
    case 'zip': return depth >= 2 ? <Note>{tt('Nested archive.', 'أرشيف متداخل.')}</Note> : <ProtectedZip name={name} blob={blob} mark={mark} tt={tt} rtl={rtl} depth={depth} />;
    case 'json': case 'md': case 'text': return <TextKind name={name} blob={blob} kind={kind} tt={tt} rtl={rtl} mark={mark} />;
    case 'unknown': return <Sniffed name={name} blob={blob} tt={tt} rtl={rtl} mark={mark} kind="text" />;
    default: return <Note>{tt('No preview is available for this file type.', 'مفيش معاينة متاحة لنوع الملف ده.')}</Note>;
  }
}

function TreeRows({ node, depth, open, toggle, sel, pick }) {
  return node.list.map((n) => {
    const isOpen = open.has(n.path);
    const [label, color] = badgeOf(n.name);
    return (
      <div key={n.path}>
        <div role="button" tabIndex={0} className={`zb-row${sel === n.path ? ' is-active' : ''}`} style={{ '--d': depth }} title={n.path}
          onClick={() => (n.dir ? toggle(n.path) : pick(n.path))}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (n.dir) toggle(n.path); else pick(n.path); } }}>
          <div className="zb-row__main">
            {n.dir ? (
              <>
                <span className={`zb-chev${isOpen ? ' is-open' : ''}`}><Icon name="chevron-right" size={12} /></span>
                <span className="zb-folder"><Icon name="folder" size={15} /></span>
              </>
            ) : <><span className="zb-chev zb-chev--none" /><span className="zb-badge" style={{ '--k': color }}>{label}</span></>}
            <span className="zb-name">{n.name}</span>
          </div>
        </div>
        {n.dir && isOpen && <TreeRows node={n} depth={depth + 1} open={open} toggle={toggle} sel={sel} pick={pick} />}
      </div>
    );
  });
}

/** Browse an archive in memory: file tree + the right viewer for the selected entry. Nothing can be extracted or saved. */
function ProtectedZip({ name, blob, mark, tt, rtl, depth }) {
  const siteT = useSiteTheme();
  const [state, setState] = useState({ status: 'loading' });
  const [open, setOpen] = useState(() => new Set());
  const [sel, setSel] = useState(null);
  const [entry, setEntry] = useState(null); // { path, blob?, error?, big? }
  const [q, setQ] = useState('');
  const [view, setView] = useState('tree'); // phones: 'tree' (file list) | 'file' (viewer) — desktop shows both
  const bytes = useRef(null);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    (async () => {
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const list = [];
        let total = 0;
        unzipSync(buf, { filter: (f) => { list.push({ name: f.name, size: f.originalSize }); total += f.originalSize; if (list.length > MAX_ENTRIES || total > MAX_UNPACKED) throw new Error('big'); return false; } });
        if (!live) return;
        bytes.current = buf;
        const clean = list.filter((f) => !f.name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(f.name));
        const sizes = new Map(clean.map((f) => [f.name, f.size]));
        const tree = buildTree(clean.map((f) => f.name));
        const files = clean.filter((f) => !f.name.endsWith('/'));
        setState({ status: 'ok', tree, sizes, files, total });
        // open the first level and jump to a README when there is one
        setOpen(new Set(tree.list.filter((n) => n.dir).map((n) => n.path)));
        const readme = files.find((f) => /^readme(\.md|\.txt)?$/i.test(f.name.split('/').pop()) && f.name.split('/').length <= 2);
        if (readme) setSel(readme.name);
      } catch (err) {
        if (live) setState({ status: 'error', big: String(err?.message) === 'big' });
      }
    })();
    return () => { live = false; bytes.current = null; };
  }, [blob]);

  useEffect(() => {
    if (!sel || !bytes.current || state.status !== 'ok') { setEntry(null); return undefined; }
    const size = state.sizes.get(sel) || 0;
    if (size > MAX_ENTRY_BYTES) { setEntry({ path: sel, big: true }); return undefined; }
    let live = true;
    setEntry({ path: sel, loading: true });
    // decompress just this one entry, off the click handler's tick
    const id = setTimeout(() => {
      try {
        const out = unzipSync(bytes.current, { filter: (f) => f.name === sel })[sel];
        if (live) setEntry({ path: sel, blob: new Blob([out || new Uint8Array()]) });
      } catch { if (live) setEntry({ path: sel, error: true }); }
    }, 0);
    return () => { live = false; clearTimeout(id); };
  }, [sel, state]);

  const pickFile = (p) => { setSel(p); setView('file'); };
  const toggle = (p) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  if (state.status === 'loading') return <Spin />;
  if (state.status === 'error') return <Note>{state.big ? tt('This archive is too large to preview.', 'الأرشيف كبير على المعاينة.') : tt('Could not open this archive (it may be encrypted or damaged).', 'تعذّر فتح الأرشيف (ممكن يكون مشفّر أو تالف).')}</Note>;

  const needle = q.trim().toLowerCase();
  const hits = needle ? state.files.filter((f) => f.name.toLowerCase().includes(needle)).slice(0, 300) : null;
  return (
    <div className={`shp-zip is-${view}`} style={themeVars(siteT)} dir="ltr">
      <aside className="shp-zip__side">
        <div className="shp-zip__head">
          <span className="shp-zip__title" title={name}><Icon name="folder" size={14} />{name.split('/').pop()}</span>
          <small>{state.files.length.toLocaleString()} {tt('files', 'ملف')} · {fmtBytes(state.total)}</small>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Search files…', 'ابحث في الملفات…')} aria-label={tt('Search files', 'ابحث في الملفات')} />
        </div>
        <div className="shp-zip__tree">
          {hits ? (
            hits.length ? hits.map((f) => {
              const [label, color] = badgeOf(f.name);
              return (
                <div key={f.name} role="button" tabIndex={0} className={`zb-row${sel === f.name ? ' is-active' : ''}`} title={f.name} onClick={() => pickFile(f.name)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') pickFile(f.name); }}>
                  <div className="zb-row__main"><span className="zb-badge" style={{ '--k': color }}>{label}</span><span className="zb-name">{f.name}</span></div>
                </div>
              );
            }) : <p className="shp-zip__empty">{tt('No matches.', 'مفيش نتائج.')}</p>
          ) : <TreeRows node={state.tree} depth={0} open={open} toggle={toggle} sel={sel} pick={pickFile} />}
        </div>
      </aside>
      <section className="shp-zip__pane" dir={rtl ? 'rtl' : 'ltr'}>
        <div className="shp-zip__crumb" dir="ltr">
          <button type="button" className="shp-zip__back" onClick={() => setView('tree')}><Icon name="chevron-left" size={16} /><span>{tt('Files', 'الملفات')}</span></button>
          <span className="shp-zip__path" title={sel || ''}>{sel ? sel.split('/').slice(-2).join(' / ') : ''}</span>
        </div>
        <div className="shp-zip__body">
        {!sel && <div className="shp-zip__hint"><Icon name="file" size={28} /><p>{tt('Select a file to preview it.', 'اختار ملف عشان تعاينه.')}</p></div>}
        {sel && (!entry || entry.path !== sel || entry.loading) && <Spin />}
        {sel && entry?.path === sel && entry.big && <Note>{tt('This file is too large to preview.', 'الملف كبير على المعاينة.')}</Note>}
        {sel && entry?.path === sel && entry.error && <Note>{tt('Could not read this file (it may be encrypted).', 'تعذّر قراءة الملف (ممكن يكون مشفّر).')}</Note>}
        {sel && entry?.path === sel && entry.blob && <ProtectedFile key={entry.path} name={entry.path} blob={entry.blob} mark={mark} tt={tt} rtl={rtl} depth={depth + 1} />}
        </div>
      </section>
    </div>
  );
}
