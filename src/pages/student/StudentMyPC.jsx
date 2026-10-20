import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrivateParams } from '../../lib/privateParams';
import { unzipSync, zipSync } from 'fflate';
import { errorMessage } from '../../api/client';
import Icon from '../../components/Icon';
import FileViewer from '../../components/FileViewer';
import { useLanguage } from '../../context/LanguageContext';
import { usePageMeta } from '../../context/PageMetaContext';
import { StModal, EmptyState, Skeleton, timeAgo } from '../../components/student/stUi';
import { readDataTransfer, itemsFromFileList } from '../../components/zipbench/zipImport';
import { useBackLayer } from '../../lib/backStack';
import { lockScroll } from '../../lib/scrollLock';
import { saveBlob } from '../../lib/exporter';
import { drive, fetchDriveBlob, fetchFolderZip, fetchDownload } from '../../lib/driveApi';
import { isSystemNode } from '../../desktop/sync';
import { FileGlyph, FolderGlyph } from '../../desktop/OsIcons';
import { extOf, isTextName } from '../../lib/driveFileKinds';
import { useSharedClip } from '../../lib/driveClipboard';
import '../../styles/css/my-pc.css';

const ZipWorkbench = lazy(() => import('../../components/zipbench/ZipWorkbench'));

/**
 * "My PC" (جهازي) — the student's own private file system, Explorer-style: folder tree, breadcrumb, grid / list,
 * drag & drop (upload from the computer, move between folders), copy / cut / paste, zip / extract, recycle bin, search,
 * and every editor the platform already has (image, PDF, video / audio, ZIP + code workbench with the real sandbox).
 *
 * Backend: /api/v1/drive/* (DriveApiController). Isolation is server-side: every query is bound to the token's user.
 * Styles: styles/css/my-pc.css (.mp-*). Texts are inline (en / ar) through tt().
 */

const COLORS = {
  pdf: '#e5484d', doc: '#3b82f6', docx: '#3b82f6', odt: '#3b82f6', rtf: '#3b82f6', txt: '#64748b', md: '#64748b',
  xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a', ppt: '#f97316', pptx: '#f97316',
  zip: '#d4a017', rar: '#d4a017', '7z': '#d4a017', gz: '#d4a017', tar: '#d4a017',
  png: '#8b5cf6', jpg: '#8b5cf6', jpeg: '#8b5cf6', gif: '#8b5cf6', webp: '#8b5cf6', svg: '#8b5cf6', bmp: '#8b5cf6',
  mp4: '#ec4899', mov: '#ec4899', webm: '#ec4899', mkv: '#ec4899', mp3: '#14b8a6', wav: '#14b8a6', ogg: '#14b8a6', m4a: '#14b8a6',
  js: '#eab308', jsx: '#eab308', ts: '#3178c6', tsx: '#3178c6', py: '#3b82f6', php: '#8892bf', html: '#e34f26', css: '#2965f1', json: '#a3a3a3',
};
const TEMPLATES = [
  { key: 'blank', en: 'Blank project', ar: 'مشروع فارغ', icon: 'file' },
  { key: 'web', en: 'Website (HTML / CSS / JS)', ar: 'موقع (HTML / CSS / JS)', icon: 'globe' },
  { key: 'node', en: 'Node.js', ar: 'Node.js', icon: 'terminal' },
  { key: 'python', en: 'Python', ar: 'Python', icon: 'terminal' },
];
const CONCURRENCY = 3;
const DONE_LINGER_MS = 2200;

const colorOf = (n) => COLORS[extOf(n)] || '#64748b';

function NodeIcon({ node, size = 44 }) {
  if (node.type === 'folder') return <span className="mp-ico" style={{ width: size, height: size }}><FolderGlyph size={size} project={node.kind === 'project'} /></span>;
  return <span className="mp-ico" style={{ width: size, height: size }}><FileGlyph size={size} label={extOf(node.name)} color={colorOf(node.name)} /></span>;
}

/** Right-click menu. Rendered in a portal (inside the desktop when there is one) so a window's overflow / animation can never clip or offset it,
 *  and clamped to the screen using its real measured size. */
function CtxMenu({ x, y, rtl, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)), ready: true });
  }, [x, y]);
  return createPortal(
    <ul ref={ref} className="mp-ctx" dir={rtl ? 'rtl' : 'ltr'} role="menu" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </ul>,
    document.querySelector('.os') || document.body,
  );
}

/** Folder tree row (recursive). */
function TreeNode({ node, byParent, depth, openSet, toggle, activeId, onOpen, onDropIds, rtl }) {
  const kids = byParent.get(node.id) || [];
  const open = openSet.has(node.id);
  const [over, setOver] = useState(false);
  return (
    <li>
      <div
        className={`mp-tree__row${activeId === node.id ? ' is-on' : ''}${over ? ' is-over' : ''}`}
        style={{ paddingInlineStart: 8 + depth * 14 }}
        onClick={() => onOpen(node.id)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-drive-ids')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); onDropIds(e, node.id); }}
        role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={activeId === node.id}
      >
        <button
          type="button" className={`mp-tree__chev${kids.length ? '' : ' is-hidden'}`} tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); toggle(node.id); }} aria-label="toggle"
        >
          <Icon name={open ? 'chevron-down' : (rtl ? 'chevron-left' : 'chevron-right')} size={13} />
        </button>
        <Icon name={node.kind === 'project' ? 'terminal' : 'folder'} size={15} />
        <span dir="auto">{node.name}</span>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => (
            <TreeNode key={k.id} node={k} byParent={byParent} depth={depth + 1} openSet={openSet} toggle={toggle}
              activeId={activeId} onOpen={onOpen} onDropIds={onDropIds} rtl={rtl} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Full-screen code / ZIP workbench (a folder, or one text file wrapped as a one-entry ZIP). */
function EditorOverlay({ title, load, onSave, sandboxTokenPath, tt, rtl, onClose }) {
  const [state, setState] = useState({ status: 'loading', blob: null, error: '' });
  const guardRef = useRef(null);
  const close = useCallback(() => { if (guardRef.current && !guardRef.current()) return; onClose(); }, [onClose]);
  useBackLayer(true, close);
  useEffect(() => lockScroll(), []);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const blob = await load();
        if (!dead) setState({ status: 'ready', blob, error: '' });
      } catch (err) {
        if (!dead) setState({ status: 'error', blob: null, error: errorMessage(err) });
      }
    })();
    return () => { dead = true; };
  }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.target?.closest?.('.zb')) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return createPortal(
    <div className="mp-editor" dir={rtl ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={title}>
      <header className="mp-editor__bar">
        <strong dir="auto">{title}</strong>
        <button type="button" className="mp-btn mp-btn--icon" onClick={close} title={tt('Close', 'إغلاق')} aria-label={tt('Close', 'إغلاق')}><Icon name="x" size={18} /></button>
      </header>
      <div className="mp-editor__body">
        {state.status === 'loading' && <div className="mp-editor__msg"><span className="mp-spin" />{tt('Loading…', 'جارٍ التحميل…')}</div>}
        {state.status === 'error' && <div className="mp-editor__msg is-error"><Icon name="alert-triangle" size={22} />{state.error}</div>}
        {state.status === 'ready' && (
          <Suspense fallback={<div className="mp-editor__msg"><span className="mp-spin" /></div>}>
            <ZipWorkbench blob={state.blob} fileName={`${title}.zip`} tt={tt} guardRef={guardRef} onSave={onSave} sandboxTokenPath={sandboxTokenPath} />
          </Suspense>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NameDialog({ dlg, tt, onClose }) {
  const [v, setV] = useState(dlg.value || '');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = v.lastIndexOf('.');
    el.setSelectionRange(0, dlg.selectAll || dot <= 0 ? v.length : dot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => { const val = v.trim(); if (!val) return; onClose(); dlg.onOk(val); };
  return (
    <StModal
      title={dlg.title} onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{tt('Cancel', 'إلغاء')}</button>
          <button type="button" className="btn btn-primary" disabled={!v.trim()} onClick={submit}>{dlg.action}</button>
        </>
      )}
    >
      <label className="mp-field"><span>{dlg.label}</span>
        <input ref={ref} value={v} maxLength={200} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} /></label>
    </StModal>
  );
}

export default function StudentMyPC({ embedded = false, onOpenWindow }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  usePageMeta(embedded ? undefined : (ar ? 'جهازي' : 'My PC'), embedded ? undefined : ar ? 'مساحتك الشخصية: ملفاتك ومشاريعك وأكوادك في مكان واحد.' : 'Your personal space: files, projects and code in one place.');
  const tt = useCallback((en, a) => (ar ? a : en), [ar]);

  const [params, setParams] = usePrivateParams();
  const folderParam = Number(params.get('folder')) || null;
  const inTrash = params.get('view') === 'trash';

  const [data, setData] = useState({ items: [], breadcrumb: [], usage: null });
  const [tree, setTree] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [view, setView] = useState(() => { try { return window.localStorage.getItem('mp-view') || 'grid'; } catch { return 'grid'; } });
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [sel, setSel] = useState(() => new Set());
  const [anchor, setAnchor] = useState(null);
  const [clip, setClip] = useSharedClip(); // { ids, mode: 'copy' | 'cut' } — shared with the desktop icons
  const [menu, setMenu] = useState(null); // { x, y, node? }
  const [newMenu, setNewMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [openTree, setOpenTree] = useState(() => new Set());
  const [side, setSide] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewerState] = useState(null); // { startId }
  const [editor, setEditorState] = useState(null); // { kind: 'folder' | 'text', node }
  // inside the desktop the viewer / code editor are real windows (onOpenWindow) instead of full-screen overlays
  const viewerFilesRef = useRef([]);
  const setViewer = useCallback((v) => { if (v && onOpenWindow) onOpenWindow({ kind: 'viewer', startId: v.startId, files: viewerFilesRef.current }); else setViewerState(v); }, [onOpenWindow]);
  const setEditor = useCallback((e) => { if (e && onOpenWindow) onOpenWindow({ kind: 'editor', editor: e }); else setEditorState(e); }, [onOpenWindow]);
  const [queue, setQueue] = useState([]);

  const rootRef = useRef(null);
  const fileInput = useRef(null);
  const dirInput = useRef(null);
  const area = useRef(null);
  const cursorRef = useRef(null);       // item the keyboard cursor is on
  const typeBuf = useRef({ text: '', t: 0 });
  const suppressClick = useRef(false);  // the click that ends a rubber-band drag must not clear the selection
  const [box, setBox] = useState(null); // rubber-band rectangle, in the scrolled content's coordinates
  const pending = useRef([]);
  const running = useRef(0);
  const queueRef = useRef([]);
  const reloadTimer = useRef(null);
  const toastTimer = useRef(null);

  const flash = useCallback((msg, tone = 'ok') => {
    setToast({ msg, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 5200 : 2600);
  }, []);

  // the layout follows the size of this component (a resizable window), not just the viewport
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const w = e.contentRect.width; el.dataset.size = w < 640 ? 'xs' : w < 900 ? 's' : 'm'; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- data -------------------------------------------------------------------------------------------
  const reload = useCallback(async ({ quiet } = {}) => {
    if (!quiet) setLoading(true);
    try {
      if (inTrash) {
        const r = await drive.trashList();
        setTrash(r.data || []);
      } else {
        const r = await drive.list(folderParam);
        setData(r.data);
      }
      setError('');
    } catch (err) {
      if (err?.status === 404 && folderParam) { setParams({}, { replace: true }); return; }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    drive.tree().then((r) => setTree(r.data || [])).catch(() => {});
  }, [folderParam, inTrash, setParams]);

  useEffect(() => { setSel(new Set()); setAnchor(null); setQuery(''); setResults(null); reload(); }, [reload]);
  useEffect(() => { const h = () => reload({ quiet: true }); window.addEventListener('uip-drive-changed', h); return () => window.removeEventListener('uip-drive-changed', h); }, [reload]);
  useEffect(() => { try { window.localStorage.setItem('mp-view', view); } catch { /* storage unavailable */ } }, [view]);

  // search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return undefined; }
    const h = window.setTimeout(async () => {
      try { setResults((await drive.search(q)).data || []); } catch { setResults([]); }
    }, 280);
    return () => window.clearTimeout(h);
  }, [query]);

  // keep the current folder's ancestors expanded in the tree
  useEffect(() => {
    if (!data.breadcrumb.length) return;
    setOpenTree((s) => { const n = new Set(s); data.breadcrumb.slice(0, -1).forEach((b) => n.add(b.id)); return n; });
  }, [data.breadcrumb]);

  const byParent = useMemo(() => {
    const m = new Map();
    tree.forEach((n) => { const k = n.parent_id ?? 0; if (!m.has(k)) m.set(k, []); m.get(k).push(n); });
    return m;
  }, [tree]);

  const items = useMemo(() => {
    const list = [...(results ?? data.items)].filter((n) => !isSystemNode(n)); // hidden settings files
    const { key, dir } = sort;
    const val = (n) => (key === 'size' ? n.size_bytes : key === 'date' ? Date.parse(n.updated_at || n.created_at || 0) || 0 : key === 'type' ? (n.type === 'folder' ? '' : n.extension) : n.name.toLowerCase());
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      const x = val(a); const y = val(b);
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return (c || a.name.localeCompare(b.name)) * dir;
    });
    return list;
  }, [data.items, results, sort]);

  const selected = useMemo(() => items.filter((n) => sel.has(n.id)), [items, sel]);

  // ---- navigation -------------------------------------------------------------------------------------
  // back / forward history (like a real Explorer): one entry per visited location
  const locKey = inTrash ? 'trash' : String(folderParam || '');
  const hist = useRef({ stack: [locKey], i: 0, skip: false });
  const [, bumpHist] = useState(0);
  useEffect(() => {
    const h = hist.current;
    if (h.skip) { h.skip = false; bumpHist((n) => n + 1); return; }
    if (h.stack[h.i] === locKey) return;
    h.stack = [...h.stack.slice(0, h.i + 1), locKey]; h.i = h.stack.length - 1; bumpHist((n) => n + 1);
  }, [locKey]);
  const goHist = (d) => {
    const h = hist.current; const j = h.i + d;
    if (j < 0 || j >= h.stack.length) return;
    const k = h.stack[j]; h.i = j;
    if (k !== locKey) h.skip = true;
    setParams(k === 'trash' ? { view: 'trash' } : k ? { folder: k } : {}); setSide(false);
  };
  const canBack = hist.current.i > 0; const canFwd = hist.current.i < hist.current.stack.length - 1;
  const openFolder = useCallback((id) => { setParams(id ? { folder: String(id) } : {}); setSide(false); }, [setParams]);
  const goUp = useCallback(() => {
    const bc = data.breadcrumb;
    openFolder(bc.length > 1 ? bc[bc.length - 2].id : null);
  }, [data.breadcrumb, openFolder]);
  const openTrashView = () => { setParams({ view: 'trash' }); setSide(false); };

  // ---- actions ----------------------------------------------------------------------------------------
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) flash(okMsg);
      await reload({ quiet: true });
      return r;
    } catch (err) {
      flash(errorMessage(err), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [flash, reload]);

  const viewerFiles = useMemo(() => items.filter((n) => n.type === 'file' && !isTextName(n.name)).map((n) => ({
    id: n.id, original_name: n.name, url: `drive:${n.id}`, size_bytes: n.size_bytes, size_human: n.size_human, version: 1, driveId: n.id,
  })), [items]);

  viewerFilesRef.current = viewerFiles;

  const openNode = useCallback((n) => {
    if (n.type === 'folder') { openFolder(n.id); return; }
    if (isTextName(n.name)) { setEditor({ kind: 'text', node: n }); return; }
    setViewer({ startId: n.id });
  }, [openFolder, setEditor, setViewer]);

  // ?open=<id> (used by the desktop shell): open that item once its folder has loaded, then drop the param
  const openParam = Number(params.get('open')) || null;
  useEffect(() => {
    if (!openParam || loading || inTrash) return;
    const loadedId = data.breadcrumb.length ? data.breadcrumb[data.breadcrumb.length - 1].id : null;
    if (loadedId !== folderParam) return;
    const n = data.items.find((i) => i.id === openParam);
    const next = new URLSearchParams(params); next.delete('open');
    setParams(next, { replace: true });
    if (n) openNode(n);
  }, [openParam, loading, inTrash, data, folderParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadViewerBlob = useCallback((file, { onProgress } = {}) => fetchDriveBlob(file.driveId ?? file.id, { onProgress }), []);
  const saveViewerFile = useCallback(async (file, blob, opts) => {
    const res = await drive.replace(file.id, blob, opts?.name || file.original_name);
    reload({ quiet: true });
    return { id: res.data.id, original_name: res.data.name };
  }, [reload]);

  // editor loaders
  const editorLoad = useMemo(() => {
    if (!editor) return null;
    if (editor.kind === 'folder') return () => fetchFolderZip(editor.node.id);
    return async () => {
      const blob = await fetchDriveBlob(editor.node.id);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return new Blob([zipSync({ [editor.node.name]: bytes })], { type: 'application/zip' });
    };
  }, [editor]);
  const editorSave = useCallback(async (blob) => {
    if (!editor) return null;
    if (editor.kind === 'folder') {
      const r = await drive.sync(editor.node.id, blob);
      reload({ quiet: true });
      const s = r.data || {};
      return { message: tt(`Saved to My PC — ${s.added || 0} added, ${s.updated || 0} updated, ${s.removed || 0} removed.`, `تم الحفظ في جهازي — ${s.added || 0} مضاف، ${s.updated || 0} معدّل، ${s.removed || 0} محذوف.`) };
    }
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const first = files[editor.node.name] ? editor.node.name : Object.keys(files).find((k) => !k.endsWith('/'));
    if (!first) throw new Error(tt('The file was removed from the editor.', 'تم حذف الملف من المحرر.'));
    await drive.replace(editor.node.id, new Blob([files[first]]), editor.node.name);
    reload({ quiet: true });
    return { message: tt('Saved to My PC.', 'تم الحفظ في جهازي.') };
  }, [editor, reload, tt]);

  const download = useCallback(async (n) => {
    try {
      flash(tt('Preparing download…', 'جارٍ تجهيز التنزيل…'));
      const { blob, name } = await fetchDownload(n);
      saveBlob(blob, name);
    } catch (err) { flash(errorMessage(err), 'error'); }
  }, [flash, tt]);

  const doDelete = useCallback((nodes) => {
    const ids = nodes.map((n) => n.id);
    const days = data.usage?.trash_days || 30;
    setDlg({
      type: 'confirm', danger: true,
      title: tt('Move to recycle bin', 'نقل إلى سلة المحذوفات'),
      text: nodes.length === 1
        ? tt(`Move “${nodes[0].name}” to the recycle bin? You can restore it for ${days} days.`, `نقل «${nodes[0].name}» إلى سلة المحذوفات؟ تقدر تسترجعه خلال ${days} يوم.`)
        : tt(`Move ${nodes.length} items to the recycle bin?`, `نقل ${nodes.length} عنصر إلى سلة المحذوفات؟`),
      action: tt('Delete', 'حذف'),
      onOk: async () => { await run(() => drive.trash(ids), tt('Moved to the recycle bin.', 'تم النقل إلى سلة المحذوفات.')); setSel(new Set()); },
    });
  }, [data.usage, run, tt]);

  const paste = useCallback(async (targetId = folderParam) => {
    if (!clip) return;
    const fn = clip.mode === 'cut' ? () => drive.move(clip.ids, targetId) : () => drive.copy(clip.ids, targetId);
    const r = await run(fn, clip.mode === 'cut' ? tt('Moved.', 'تم النقل.') : tt('Copied.', 'تم النسخ.'));
    if (r && clip.mode === 'cut') setClip(null);
  }, [clip, folderParam, run, tt]);

  const dropIds = useCallback((e, targetId) => {
    e.preventDefault(); e.stopPropagation();
    let ids = [];
    try { ids = JSON.parse(e.dataTransfer.getData('application/x-drive-ids') || '[]'); } catch { /* not ours */ }
    ids = ids.filter((i) => i !== targetId);
    if (ids.length) run(() => drive.move(ids, targetId), tt('Moved.', 'تم النقل.'));
  }, [run, tt]);

  const askName = useCallback((cfg) => setDlg({ type: 'name', ...cfg }), []);
  const newFolder = () => askName({ title: tt('New folder', 'مجلد جديد'), label: tt('Folder name', 'اسم المجلد'), value: tt('New folder', 'مجلد جديد'), selectAll: true, action: tt('Create', 'إنشاء'), onOk: (v) => run(() => drive.createFolder(folderParam, v), tt('Folder created.', 'تم إنشاء المجلد.')) });
  const newFile = () => askName({ title: tt('New text file', 'ملف نصي جديد'), label: tt('File name', 'اسم الملف'), value: 'untitled.txt', action: tt('Create', 'إنشاء'), onOk: (v) => run(() => drive.createFile(folderParam, v), tt('File created.', 'تم إنشاء الملف.')) });
  const newProject = () => setDlg({ type: 'project', value: '', template: 'web' });
  const rename = (n) => askName({ title: tt('Rename', 'إعادة تسمية'), label: tt('New name', 'الاسم الجديد'), value: n.name, selectAll: n.type === 'folder', action: tt('Rename', 'تسمية'), onOk: (v) => run(() => drive.rename(n.id, v), tt('Renamed.', 'تمت إعادة التسمية.')) });
  const zipSelected = (nodes) => askName({
    title: tt('Compress to ZIP', 'ضغط إلى ZIP'), label: tt('Archive name', 'اسم الأرشيف'),
    value: nodes.length === 1 ? `${nodes[0].name}.zip` : 'Archive.zip', action: tt('Compress', 'ضغط'),
    onOk: (v) => run(() => drive.zip(nodes.map((n) => n.id), folderParam, v), tt('Archive created.', 'تم إنشاء الأرشيف.')),
  });
  const extract = (n) => run(() => drive.unzip(n.id, n.parent_id), tt('Extracted.', 'تم فك الضغط.'));

  // ---- upload -----------------------------------------------------------------------------------------
  const setQ = (fn) => { queueRef.current = fn(queueRef.current); setQueue(queueRef.current); };
  const patchQ = (uid, patch) => setQ((q) => q.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  const maxMb = data.usage?.max_file_mb || 100;

  const pump = useCallback(() => {
    const nested = queueRef.current.some((x) => x.rel.includes('/') && ['queued', 'uploading'].includes(x.status));
    const limit = nested ? 1 : CONCURRENCY; // folder uploads go one by one so the same new folder is never created twice
    while (running.current < limit && pending.current.length) {
      const uid = pending.current.shift();
      const item = queueRef.current.find((x) => x.uid === uid);
      if (!item || item.status !== 'queued') continue; // eslint-disable-line no-continue
      running.current += 1;
      patchQ(uid, { status: 'uploading', pct: 0 });
      drive.upload(item.parent, item.file, item.rel, (p) => patchQ(uid, { pct: p }))
        .then(() => { patchQ(uid, { status: 'done', pct: 100 }); window.setTimeout(() => setQ((q) => q.filter((x) => x.uid !== uid)), DONE_LINGER_MS); })
        .catch((err) => patchQ(uid, { status: 'error', error: errorMessage(err) }))
        .finally(() => {
          running.current -= 1;
          window.clearTimeout(reloadTimer.current);
          reloadTimer.current = window.setTimeout(() => reload({ quiet: true }), 350);
          pump();
        });
    }
  }, [reload]);

  const enqueue = useCallback(async (picked, parent) => {
    const files = picked.filter((i) => !i.dir && i.file);
    const dirs = picked.filter((i) => i.dir).map((i) => i.rel.replace(/\/$/, ''));
    const tooBig = (f) => f.size > maxMb * 1048576;
    const rows = files.map((i, k) => ({
      uid: `${Date.now()}-${k}-${Math.random().toString(36).slice(2, 7)}`, file: i.file, rel: i.rel, name: i.file.name, parent,
      size: i.file.size, status: tooBig(i.file) ? 'error' : 'queued', pct: 0,
      error: tooBig(i.file) ? tt(`Larger than ${maxMb} MB`, `أكبر من ${maxMb} ميجابايت`) : '',
    }));
    // empty folders from a drag & drop (mkdir -p), best effort
    const emptyDirs = dirs.filter((d) => !files.some((f) => f.rel.startsWith(`${d}/`)));
    for (const d of emptyDirs) { try { await drive.ensurePath(parent, d); } catch { /* ignore */ } } // eslint-disable-line no-await-in-loop
    if (!rows.length) { if (emptyDirs.length) reload({ quiet: true }); return; }
    setQ((q) => [...q, ...rows]);
    pending.current.push(...rows.filter((r) => r.status === 'queued').map((r) => r.uid));
    pump();
  }, [maxMb, pump, reload, tt]);

  const onPick = (e, keepFolders) => {
    const { items: picked } = itemsFromFileList(e.target.files || [], keepFolders);
    e.target.value = '';
    enqueue(picked, folderParam);
  };

  const onDropFiles = async (e, targetId) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if (!e.dataTransfer.types.includes('Files')) return;
    const { items: picked } = await readDataTransfer(e.dataTransfer);
    enqueue(picked, targetId === undefined ? folderParam : targetId);
  };

  const busyUploading = queue.some((x) => ['queued', 'uploading'].includes(x.status));
  useEffect(() => {
    if (!busyUploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busyUploading]);

  // ---- selection / keyboard ---------------------------------------------------------------------------
  const clickItem = (e, n) => {
    e.stopPropagation();
    cursorRef.current = n.id;
    if (e.shiftKey && anchor != null) {
      const a = items.findIndex((x) => x.id === anchor); const b = items.findIndex((x) => x.id === n.id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSel(new Set(items.slice(lo, hi + 1).map((x) => x.id)));
    } else if (e.ctrlKey || e.metaKey) {
      setSel((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; });
      setAnchor(n.id);
    } else { setSel(new Set([n.id])); setAnchor(n.id); }
  };

  // number of icons per row (grid view) — measured, because it depends on the window width
  const columns = () => {
    if (view !== 'grid') return 1;
    const els = area.current?.querySelectorAll('.mp-item');
    if (!els || !els.length) return 1;
    const top = els[0].offsetTop; let c = 0;
    for (const el of els) { if (el.offsetTop === top) c += 1; else break; }
    return Math.max(1, c);
  };
  const focusItem = (id) => {
    window.requestAnimationFrame(() => {
      const el = [...(area.current?.querySelectorAll('.mp-item[data-id]') || [])].find((x) => x.dataset.id === String(id));
      if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.focus({ preventScroll: true }); }
    });
  };
  // move the cursor to items[idx]; Shift extends the selection from the anchor, Ctrl only moves the cursor
  const goTo = (idx, e) => {
    const n = items[Math.max(0, Math.min(items.length - 1, idx))];
    if (!n) return;
    cursorRef.current = n.id;
    if (e.shiftKey && anchor != null) {
      const a = items.findIndex((x) => x.id === anchor); const b = items.findIndex((x) => x.id === n.id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSel(new Set(items.slice(lo, hi + 1).map((x) => x.id)));
    } else if (!(e.ctrlKey || e.metaKey)) { setSel(new Set([n.id])); setAnchor(n.id); }
    focusItem(n.id);
  };

  const onKey = (e) => {
    if (dlg || menu || e.target.closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    if (key === 'F5' || (mod && key.toLowerCase() === 'r')) { e.preventDefault(); reload(); return; }
    if (inTrash) return;

    // arrows / Home / End — move between items (grid: left-right and up-down, list: up-down). In RTL the row runs right→left.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key) && !e.altKey && items.length) {
      e.preventDefault();
      let cur = items.findIndex((x) => x.id === cursorRef.current);
      if (cur < 0 && selected.length) cur = items.findIndex((x) => x.id === selected[selected.length - 1].id);
      const cols = columns();
      const fwd = ar ? 'ArrowLeft' : 'ArrowRight'; const back = ar ? 'ArrowRight' : 'ArrowLeft';
      let next = cur;
      if (cur < 0) next = key === 'End' || key === 'ArrowUp' ? items.length - 1 : 0;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = items.length - 1;
      else if (key === 'ArrowDown') next = cur + cols;
      else if (key === 'ArrowUp') next = cur - cols;
      else if (key === 'PageDown') next = cur + cols * 4;
      else if (key === 'PageUp') next = cur - cols * 4;
      else if (view === 'grid' && key === fwd) next = cur + 1;
      else if (view === 'grid' && key === back) next = cur - 1;
      goTo(next, e);
      return;
    }
    if (key === 'Delete' && selected.length) { e.preventDefault(); doDelete(selected); }
    else if (key === 'F2' && selected.length === 1) { e.preventDefault(); rename(selected[0]); }
    else if (key === 'Enter' && selected.length === 1) { e.preventDefault(); openNode(selected[0]); }
    else if (key === 'Backspace' || (e.altKey && key === 'ArrowUp') || (e.altKey && key === (ar ? 'ArrowRight' : 'ArrowLeft'))) { e.preventDefault(); goUp(); }
    else if (mod && e.shiftKey && key.toLowerCase() === 'n') { e.preventDefault(); newFolder(); }
    else if (mod && key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(items.map((n) => n.id))); }
    else if (mod && key.toLowerCase() === 'i') { e.preventDefault(); setSel(new Set(items.filter((n) => !sel.has(n.id)).map((n) => n.id))); }
    else if (mod && key.toLowerCase() === 'c' && selected.length) { e.preventDefault(); setClip({ ids: selected.map((n) => n.id), mode: 'copy' }); flash(tt('Copied to clipboard.', 'تم النسخ للحافظة.')); }
    else if (mod && key.toLowerCase() === 'x' && selected.length) { e.preventDefault(); setClip({ ids: selected.map((n) => n.id), mode: 'cut' }); flash(tt('Cut.', 'تم القص.')); }
    else if (mod && key.toLowerCase() === 'v' && clip) { e.preventDefault(); paste(); }
    else if (key === 'Escape') setSel(new Set());
    else if (key.length === 1 && !mod && !e.altKey && key !== ' ') {
      // type the first letters of a name to jump to it
      const t = typeBuf.current; const now = Date.now();
      t.text = now - t.t > 800 ? key.toLowerCase() : t.text + key.toLowerCase(); t.t = now;
      const start = Math.max(0, items.findIndex((x) => x.id === cursorRef.current)) + (t.text.length === 1 ? 1 : 0);
      const order = [...items.slice(start), ...items.slice(0, start)];
      const hit = order.find((x) => x.name.toLowerCase().startsWith(t.text));
      if (hit) { e.preventDefault(); goTo(items.indexOf(hit), { shiftKey: false, ctrlKey: false, metaKey: false }); }
    }
  };

  // ---- rubber-band (mouse drag) selection on the empty area ---------------------------------------------
  const onMainPointerDown = (e) => {
    if (e.button !== 0 || inTrash || loading || e.target.closest('.mp-item, .mp-head, button, a, input, .mp-dropmsg')) return;
    const main = area.current; if (!main) return;
    const rect = main.getBoundingClientRect();
    const local = (ev) => ({ x: ev.clientX - rect.left + main.scrollLeft, y: ev.clientY - rect.top + main.scrollTop });
    const start = local(e);
    const base = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(sel) : new Set();
    const byId = new Map(items.map((n) => [String(n.id), n.id]));
    let dragging = false;
    rootRef.current?.focus({ preventScroll: true }); // keep keyboard focus on the explorer so Delete / Ctrl+A work right after a drag
    const move = (ev) => {
      const p = local(ev);
      if (!dragging) { if (Math.hypot(p.x - start.x, p.y - start.y) < 4) return; dragging = true; }
      if (ev.clientY > rect.bottom - 24) main.scrollTop += 14; else if (ev.clientY < rect.top + 24) main.scrollTop -= 14; // auto-scroll near an edge
      const x1 = Math.min(start.x, p.x); const x2 = Math.max(start.x, p.x);
      const y1 = Math.min(start.y, p.y); const y2 = Math.max(start.y, p.y);
      setBox({ x1, y1, x2, y2 });
      const next = new Set(base);
      main.querySelectorAll('.mp-item[data-id]').forEach((el) => {
        const b = el.getBoundingClientRect();
        const ix1 = b.left - rect.left + main.scrollLeft; const ix2 = b.right - rect.left + main.scrollLeft;
        const iy1 = b.top - rect.top + main.scrollTop; const iy2 = b.bottom - rect.top + main.scrollTop;
        if (ix1 < x2 && ix2 > x1 && iy1 < y2 && iy2 > y1) { const id = byId.get(el.dataset.id); if (id !== undefined) next.add(id); }
      });
      setSel(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setBox(null);
      if (dragging) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  useEffect(() => {
    if (!newMenu && !sortMenu) return undefined;
    const close = () => { setNewMenu(false); setSortMenu(false); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [newMenu, sortMenu]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('click', close); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [menu]);

  const showMenu = (e, n) => {
    e.preventDefault(); e.stopPropagation();
    if (n && !sel.has(n.id)) { setSel(new Set([n.id])); setAnchor(n.id); }
    setMenu({ x: e.clientX, y: e.clientY, node: n || null });
  };

  const menuItems = () => {
    const n = menu?.node;
    const group = n ? (sel.has(n.id) ? selected : [n]) : [];
    const one = group.length === 1 ? group[0] : null;
    const out = [];
    if (one) out.push({ icon: one.type === 'folder' ? 'folder' : 'eye', label: tt('Open', 'فتح'), run: () => openNode(one) });
    if (one && one.type === 'folder') out.push({ icon: 'terminal', label: tt('Open in code editor', 'فتح في محرر الأكواد'), run: () => setEditor({ kind: 'folder', node: one }) });
    if (one && one.type === 'file' && isTextName(one.name)) out.push({ icon: 'edit', label: tt('Edit', 'تعديل'), run: () => setEditor({ kind: 'text', node: one }) });
    if (one && one.type === 'file' && extOf(one.name) === 'zip') out.push({ icon: 'archive', label: tt('Extract here', 'فك الضغط هنا'), run: () => extract(one) });
    if (group.length) {
      out.push({ icon: 'download', label: tt('Download', 'تنزيل'), run: () => group.forEach(download), disabled: group.length > 1 });
      out.push({ sep: true });
      out.push({ icon: 'copy', label: tt('Copy', 'نسخ'), hint: 'Ctrl+C', run: () => setClip({ ids: group.map((x) => x.id), mode: 'copy' }) });
      out.push({ icon: 'ed-crop', label: tt('Cut', 'قص'), hint: 'Ctrl+X', run: () => setClip({ ids: group.map((x) => x.id), mode: 'cut' }) });
    }
    if (clip) out.push({ icon: 'file-plus', label: tt('Paste', 'لصق'), hint: 'Ctrl+V', run: () => paste(one && one.type === 'folder' ? one.id : folderParam) });
    if (group.length) {
      out.push({ icon: 'archive', label: tt('Compress to ZIP', 'ضغط إلى ZIP'), run: () => zipSelected(group) });
      if (one) out.push({ icon: 'edit', label: tt('Rename', 'إعادة تسمية'), hint: 'F2', run: () => rename(one) });
      out.push({ sep: true });
      out.push({ icon: 'trash', label: tt('Delete', 'حذف'), hint: 'Del', danger: true, run: () => doDelete(group) });
    }
    if (!n) {
      out.push({ icon: 'folder-plus', label: tt('New folder', 'مجلد جديد'), run: newFolder });
      out.push({ icon: 'file-plus', label: tt('New text file', 'ملف نصي جديد'), run: newFile });
      out.push({ icon: 'terminal', label: tt('New project', 'مشروع جديد'), run: newProject });
      out.push({ icon: 'file-up', label: tt('Upload files', 'رفع ملفات'), run: () => fileInput.current?.click() });
      if (data.breadcrumb.length) out.push({ icon: 'terminal', label: tt('Open this folder in code editor', 'فتح هذا المجلد في محرر الأكواد'), run: () => setEditor({ kind: 'folder', node: data.breadcrumb[data.breadcrumb.length - 1] }) });
    }
    return out;
  };

  // ---- recycle bin actions ----------------------------------------------------------------------------
  const emptyBin = () => setDlg({
    type: 'confirm', danger: true, title: tt('Empty recycle bin', 'تفريغ سلة المحذوفات'),
    text: tt('Everything in the recycle bin will be deleted permanently. This cannot be undone.', 'كل ما في السلة هيتحذف نهائيًا ومش هتقدر ترجعه.'),
    action: tt('Empty', 'تفريغ'), onOk: () => run(() => drive.emptyTrash(), tt('Recycle bin emptied.', 'تم تفريغ السلة.')),
  });

  // ---- render -----------------------------------------------------------------------------------------
  const usage = data.usage;
  const crumbs = data.breadcrumb;
  const locationName = inTrash ? tt('Recycle bin', 'سلة المحذوفات') : (crumbs.length ? crumbs[crumbs.length - 1].name : tt('My PC', 'جهازي'));
  const currentFolder = crumbs.length ? crumbs[crumbs.length - 1] : null;
  const sortLabels = { name: tt('Name', 'الاسم'), date: tt('Modified', 'آخر تعديل'), size: tt('Size', 'الحجم'), type: tt('Type', 'النوع') };
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  const startViewerIndex = viewer ? Math.max(0, viewerFiles.findIndex((f) => f.id === viewer.startId)) : 0;
  const chevron = ar ? 'chevron-left' : 'chevron-right';

  return (
    <div ref={rootRef} className={`mp${embedded ? ' mp--embedded' : ''}`} dir={ar ? 'rtl' : 'ltr'} tabIndex={-1} onKeyDown={onKey}
      onPointerDownCapture={(e) => { if (!e.target.closest('input, textarea, select, .mp-item, [contenteditable]')) window.setTimeout(() => { if (!rootRef.current?.contains(document.activeElement) || document.activeElement === document.body) rootRef.current?.focus({ preventScroll: true }); }, 0); }}>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => onPick(e, false)} />
      <input ref={dirInput} type="file" multiple hidden webkitdirectory="" directory="" onChange={(e) => onPick(e, true)} />

      <div className="mp-top" data-os-drag>
        <button type="button" className="mp-ib mp-side-toggle" onClick={() => setSide((v) => !v)} aria-label={tt('Folders', 'المجلدات')}><Icon name="panel-left" size={18} /></button>
        <div className="mp-nav">
          <button type="button" className="mp-ib" onClick={() => goHist(-1)} disabled={!canBack} title={tt('Back', 'رجوع')} aria-label={tt('Back', 'رجوع')}><Icon name={ar ? 'arrow-right' : 'arrow-left'} size={17} /></button>
          <button type="button" className="mp-ib" onClick={() => goHist(1)} disabled={!canFwd} title={tt('Forward', 'للأمام')} aria-label={tt('Forward', 'للأمام')}><Icon name={ar ? 'arrow-left' : 'arrow-right'} size={17} /></button>
          <button type="button" className="mp-ib" onClick={goUp} disabled={inTrash || !crumbs.length} title={tt('Up (Backspace)', 'للأعلى (Backspace)')} aria-label={tt('Up', 'للأعلى')}><Icon name="arrow-up" size={17} /></button>
          <button type="button" className="mp-ib" onClick={() => reload()} title={tt('Refresh', 'تحديث')} aria-label={tt('Refresh', 'تحديث')}><Icon name="refresh" size={16} /></button>
        </div>
        <nav className="mp-crumbs" aria-label="breadcrumb">
          <button type="button" className="mp-crumb" onClick={() => openFolder(null)}><Icon name="monitor" size={15} /> {tt('My PC', 'جهازي')}</button>
          {inTrash && <span className="mp-crumb-wrap"><Icon name={chevron} size={13} /><span className="mp-crumb is-last">{tt('Recycle bin', 'سلة المحذوفات')}</span></span>}
          {!inTrash && crumbs.map((c, i) => (
            <span key={c.id} className="mp-crumb-wrap">
              <Icon name={chevron} size={13} />
              <button
                type="button" className={`mp-crumb${i === crumbs.length - 1 ? ' is-last' : ''}`} onClick={() => openFolder(c.id)}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-drive-ids')) e.preventDefault(); }}
                onDrop={(e) => dropIds(e, c.id)}
              ><span dir="auto">{c.name}</span></button>
            </span>
          ))}
        </nav>
        <label className="mp-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt('Search My PC', 'ابحث في جهازي')} disabled={inTrash} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={tt('Clear', 'مسح')}><Icon name="x" size={13} /></button>}
        </label>
      </div>

      <div className="mp-bar" data-os-drag>
        {!inTrash ? (
          <>
            <div className="mp-menu-wrap">
              <button type="button" className="mp-btn mp-btn--primary" onClick={(e) => { e.stopPropagation(); setSortMenu(false); setNewMenu((v) => !v); }} aria-haspopup="menu" aria-expanded={newMenu}>
                <Icon name="plus" size={16} /> <span>{tt('New', 'جديد')}</span> <Icon name="chevron-down" size={12} />
              </button>
              {newMenu && (
                <div className="mp-pop" role="menu" onClick={(e) => e.stopPropagation()}>
                  <button type="button" role="menuitem" onClick={() => { setNewMenu(false); newFolder(); }}><Icon name="folder-plus" size={16} />{tt('Folder', 'مجلد')}</button>
                  <button type="button" role="menuitem" onClick={() => { setNewMenu(false); newFile(); }}><Icon name="file-plus" size={16} />{tt('Text file', 'ملف نصي')}</button>
                  <button type="button" role="menuitem" onClick={() => { setNewMenu(false); newProject(); }}><Icon name="terminal" size={16} />{tt('Project', 'مشروع')}</button>
                </div>
              )}
            </div>
            <span className="mp-sep" />
            <button type="button" className="mp-btn" onClick={() => fileInput.current?.click()} title={tt('Upload files', 'رفع ملفات')}><Icon name="file-up" size={16} /> <span className="mp-lbl">{tt('Upload files', 'رفع ملفات')}</span></button>
            <button type="button" className="mp-btn" onClick={() => dirInput.current?.click()} title={tt('Upload folder', 'رفع مجلد')}><Icon name="folder-up" size={16} /> <span className="mp-lbl">{tt('Upload folder', 'رفع مجلد')}</span></button>
            {currentFolder && <button type="button" className="mp-btn" onClick={() => setEditor({ kind: 'folder', node: currentFolder })} title={tt('Code editor', 'محرر الأكواد')}><Icon name="terminal" size={16} /> <span className="mp-lbl">{tt('Code editor', 'محرر الأكواد')}</span></button>}
            <span className="mp-sep" />
            <button type="button" className="mp-ib" disabled={!selected.length} onClick={() => setClip({ ids: selected.map((n) => n.id), mode: 'copy' })} title={tt('Copy (Ctrl+C)', 'نسخ (Ctrl+C)')} aria-label={tt('Copy', 'نسخ')}><Icon name="copy" size={16} /></button>
            <button type="button" className="mp-ib" disabled={!selected.length} onClick={() => setClip({ ids: selected.map((n) => n.id), mode: 'cut' })} title={tt('Cut (Ctrl+X)', 'قص (Ctrl+X)')} aria-label={tt('Cut', 'قص')}><Icon name="ed-crop" size={16} /></button>
            <button type="button" className="mp-ib" disabled={!clip} onClick={() => paste()} title={tt('Paste (Ctrl+V)', 'لصق (Ctrl+V)')} aria-label={tt('Paste', 'لصق')}><Icon name="file-plus" size={16} /></button>
            <button type="button" className="mp-ib" disabled={selected.length !== 1} onClick={() => rename(selected[0])} title={tt('Rename (F2)', 'إعادة تسمية (F2)')} aria-label={tt('Rename', 'إعادة تسمية')}><Icon name="edit" size={16} /></button>
            <button type="button" className="mp-ib" disabled={!selected.length} onClick={() => zipSelected(selected)} title={tt('Compress to ZIP', 'ضغط إلى ZIP')} aria-label={tt('Compress to ZIP', 'ضغط إلى ZIP')}><Icon name="archive" size={16} /></button>
            <button type="button" className="mp-ib mp-danger" disabled={!selected.length} onClick={() => doDelete(selected)} title={tt('Delete (Del)', 'حذف (Del)')} aria-label={tt('Delete', 'حذف')}><Icon name="trash" size={16} /></button>
          </>
        ) : (
          <>
            <button type="button" className="mp-btn" onClick={() => openFolder(null)}><Icon name={ar ? 'arrow-right' : 'arrow-left'} size={16} /> {tt('Back to My PC', 'العودة إلى جهازي')}</button>
            <button type="button" className="mp-btn mp-danger" disabled={!trash.length} onClick={emptyBin}><Icon name="trash" size={16} /> {tt('Empty recycle bin', 'تفريغ السلة')}</button>
          </>
        )}
        <span className="mp-grow" />
        {!inTrash && (
          <div className="mp-menu-wrap">
            <button type="button" className="mp-btn" onClick={(e) => { e.stopPropagation(); setNewMenu(false); setSortMenu((v) => !v); }} aria-haspopup="menu" aria-expanded={sortMenu}>
              <Icon name={sort.dir > 0 ? 'arrow-up' : 'arrow-down'} size={14} /> <span className="mp-lbl">{tt('Sort', 'ترتيب')}: {sortLabels[sort.key]}</span> <Icon name="chevron-down" size={12} />
            </button>
            {sortMenu && (
              <div className="mp-pop mp-pop--end" role="menu" onClick={(e) => e.stopPropagation()}>
                {Object.entries(sortLabels).map(([k, v]) => (
                  <button key={k} type="button" role="menuitemradio" aria-checked={sort.key === k} className={sort.key === k ? 'is-on' : ''} onClick={() => { setSort((x) => ({ key: k, dir: x.key === k ? x.dir : 1 })); setSortMenu(false); }}>
                    <span className="mp-pop__tick">{sort.key === k && <Icon name="check" size={14} />}</span>{v}
                  </button>
                ))}
                <div className="mp-ctx__sep" />
                {[[1, tt('Ascending', 'تصاعدي')], [-1, tt('Descending', 'تنازلي')]].map(([d, l]) => (
                  <button key={d} type="button" role="menuitemradio" aria-checked={sort.dir === d} className={sort.dir === d ? 'is-on' : ''} onClick={() => { setSort((x) => ({ ...x, dir: d })); setSortMenu(false); }}>
                    <span className="mp-pop__tick">{sort.dir === d && <Icon name="check" size={14} />}</span>{l}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mp-body">
        <aside className={`mp-side${side ? ' is-open' : ''}`}>
          {embedded && <div className="mp-side__drag" data-os-drag aria-hidden="true" />}
          <p className="mp-side__head">{tt('Favorites', 'المفضلة')}</p>
          <ul className="mp-tree" role="tree">
            <li>
              <div className={`mp-tree__row mp-tree__root${!folderParam && !inTrash ? ' is-on' : ''}`} onClick={() => openFolder(null)}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-drive-ids')) e.preventDefault(); }} onDrop={(e) => dropIds(e, null)}>
                <Icon name="monitor" size={16} /><span>{tt('My PC', 'جهازي')}</span>
              </div>
              <ul role="group">
                {(byParent.get(0) || []).map((n) => (
                  <TreeNode key={n.id} node={n} byParent={byParent} depth={1} openSet={openTree} activeId={inTrash ? null : folderParam}
                    toggle={(id) => setOpenTree((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; })}
                    onOpen={openFolder} onDropIds={dropIds} rtl={ar} />
                ))}
              </ul>
            </li>
          </ul>
          <button type="button" className={`mp-bin${inTrash ? ' is-on' : ''}`} onClick={openTrashView}><Icon name="trash" size={16} /> {tt('Recycle bin', 'سلة المحذوفات')}</button>
          {usage && (
            <div className="mp-usage" title={`${usage.percent}%`}>
              <div className="mp-usage__top"><Icon name="monitor" size={15} /><strong>{tt('Local storage', 'مساحة التخزين')}</strong></div>
              <div className="mp-usage__bar"><i style={{ width: `${Math.max(1.5, Math.min(100, usage.percent))}%` }} className={usage.percent > 90 ? 'is-hot' : ''} /></div>
              <small>{tt(`${usage.used_human} of ${usage.quota_human} used`, `${usage.used_human} من ${usage.quota_human} مستخدمة`)}</small>
            </div>
          )}
        </aside>
        {side && <button type="button" className="mp-scrim" aria-label="close" onClick={() => setSide(false)} />}

        <main
          ref={area} className={`mp-main${dragOver ? ' is-drop' : ''}${box ? ' is-marquee' : ''}`}
          onPointerDown={onMainPointerDown}
          onClick={() => { if (suppressClick.current) return; setSel(new Set()); cursorRef.current = null; rootRef.current?.focus({ preventScroll: true }); }}
          onContextMenu={(e) => { if (!inTrash) showMenu(e, null); }}
          onDragOver={(e) => { if (!inTrash && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (!area.current?.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => (inTrash ? undefined : onDropFiles(e))}
        >
          {box && <div className="mp-marquee" aria-hidden="true" style={{ left: box.x1, top: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 }} />}
          {dragOver && <div className="mp-dropmsg"><Icon name="upload" size={30} /><strong>{tt(`Drop to upload to “${locationName}”`, `أفلت هنا للرفع إلى «${locationName}»`)}</strong></div>}
          {loading && <div className="mp-pad"><Skeleton h={64} count={5} /></div>}
          {!loading && error && <div className="mp-pad"><EmptyState icon="alert-triangle" title={tt('Could not load', 'تعذّر التحميل')} text={error}><button type="button" className="mp-btn mp-btn--primary" onClick={() => reload()}>{tt('Retry', 'إعادة المحاولة')}</button></EmptyState></div>}

          {!loading && !error && inTrash && (
            trash.length === 0
              ? <div className="mp-pad"><EmptyState icon="trash" title={tt('The recycle bin is empty', 'سلة المحذوفات فاضية')} text={tt('Deleted items stay here before they are removed for good.', 'العناصر المحذوفة بتفضل هنا قبل ما تتمسح نهائيًا.')} /></div>
              : (
                <ul className="mp-trash">
                  {trash.map((n) => (
                    <li key={n.id}>
                      <NodeIcon node={n} size={38} />
                      <div className="mp-trash__meta">
                        <strong dir="auto">{n.name}</strong>
                        <small>{[n.type === 'folder' ? tt(`${n.contains || 0} items inside`, `${n.contains || 0} عنصر بالداخل`) : n.size_human, n.deleted_at && timeAgo(n.deleted_at, locale)].filter(Boolean).join(' · ')}</small>
                      </div>
                      <button type="button" className="mp-btn" onClick={() => run(() => drive.restore([n.id]), tt('Restored.', 'تم الاسترجاع.'))}><Icon name="refresh" size={15} /> {tt('Restore', 'استرجاع')}</button>
                      <button
                        type="button" className="mp-btn mp-danger"
                        onClick={() => setDlg({ type: 'confirm', danger: true, title: tt('Delete permanently', 'حذف نهائي'), text: tt(`Delete “${n.name}” permanently? This cannot be undone.`, `حذف «${n.name}» نهائيًا؟ مش هتقدر ترجعه.`), action: tt('Delete forever', 'حذف نهائي'), onOk: () => run(() => drive.purge([n.id]), tt('Deleted permanently.', 'تم الحذف نهائيًا.')) })}
                      ><Icon name="trash" size={15} /> {tt('Delete forever', 'حذف نهائي')}</button>
                    </li>
                  ))}
                </ul>
              )
          )}

          {!loading && !error && !inTrash && (
            items.length === 0
              ? (
                <div className="mp-pad">
                  <EmptyState
                    icon={results ? 'search' : 'folder'}
                    title={results ? tt('No matches', 'لا توجد نتائج') : tt('This folder is empty', 'المجلد فاضي')}
                    text={results ? tt('Try another name.', 'جرّب اسمًا آخر.') : tt('Drop files here, or create a folder or a project.', 'أفلت ملفات هنا، أو أنشئ مجلدًا أو مشروعًا.')}
                  />
                </div>
              )
              : (
                <div className={`mp-items is-${view}`} role="listbox" aria-multiselectable="true">
                  {view === 'list' && (
                    <div className="mp-head">
                      {['name', 'date', 'type', 'size'].map((k) => (
                        <button key={k} type="button" onClick={(e) => { e.stopPropagation(); toggleSort(k); }} className={`mp-head__${k}`}>
                          {sortLabels[k]} {sort.key === k && <Icon name={sort.dir > 0 ? 'arrow-up' : 'arrow-down'} size={11} />}
                        </button>
                      ))}
                    </div>
                  )}
                  {items.map((n) => (
                    <div
                      key={n.id} data-id={n.id} role="option" aria-selected={sel.has(n.id)} tabIndex={0}
                      className={`mp-item${sel.has(n.id) ? ' is-sel' : ''}${clip?.mode === 'cut' && clip.ids.includes(n.id) ? ' is-cut' : ''}`}
                      draggable
                      onClick={(e) => clickItem(e, n)}
                      onDoubleClick={(e) => { e.stopPropagation(); openNode(n); }}
                      onContextMenu={(e) => showMenu(e, n)}
                      onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); clickItem({ ctrlKey: true, shiftKey: false, stopPropagation: () => {} }, n); } }}
                      onDragStart={(e) => { const ids = sel.has(n.id) ? [...sel] : [n.id]; e.dataTransfer.setData('application/x-drive-ids', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { if (n.type === 'folder' && (e.dataTransfer.types.includes('application/x-drive-ids') || e.dataTransfer.types.includes('Files'))) { e.preventDefault(); e.currentTarget.classList.add('is-over'); } }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
                      onDrop={(e) => { e.currentTarget.classList.remove('is-over'); if (n.type !== 'folder') return; if (e.dataTransfer.types.includes('application/x-drive-ids')) dropIds(e, n.id); else onDropFiles(e, n.id); }}
                    >
                      <NodeIcon node={n} size={view === 'grid' ? 56 : 28} />
                      <span className="mp-item__name" dir="auto" title={n.name}>{n.name}{results && n.path ? <small>{n.path}</small> : null}</span>
                      {view === 'list' && (
                        <>
                          <span className="mp-item__date">{timeAgo(n.updated_at || n.created_at, locale)}</span>
                          <span className="mp-item__type">{n.type === 'folder' ? (n.kind === 'project' ? tt('Project', 'مشروع') : tt('Folder', 'مجلد')) : (n.extension || '—').toUpperCase()}</span>
                          <span className="mp-item__size">{n.type === 'folder' ? '' : n.size_human}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )
          )}
        </main>
      </div>

      <footer className="mp-status">
        <span>{inTrash ? tt(`${trash.length} items`, `${trash.length} عنصر`) : tt(`${items.length} items`, `${items.length} عنصر`)}{selected.length ? ` · ${tt(`${selected.length} selected`, `${selected.length} محدد`)}` : ''}{selected.length && selected.every((n) => n.type === 'file') ? ` · ${selected.reduce((t, n) => t + (n.size_bytes || 0), 0) > 1048576 ? `${(selected.reduce((t, n) => t + (n.size_bytes || 0), 0) / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(selected.reduce((t, n) => t + (n.size_bytes || 0), 0) / 1024))} KB`}` : ''}</span>
        {clip && <span className="mp-status__clip">{clip.mode === 'cut' ? tt('Ready to move — paste where you want', 'جاهز للنقل — الصق في المكان المطلوب') : tt('Copied — paste where you want', 'تم النسخ — الصق في المكان المطلوب')}</span>}
        {busy && <span className="mp-spin" />}
        <span className="mp-grow" />
        {!inTrash && (
          <div className="mp-seg" role="group" aria-label={tt('View', 'العرض')}>
            <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')} title={tt('Details', 'تفاصيل')} aria-label={tt('Details', 'تفاصيل')}><Icon name="menu" size={15} /></button>
            <button type="button" className={view === 'grid' ? 'is-on' : ''} onClick={() => setView('grid')} title={tt('Large icons', 'أيقونات كبيرة')} aria-label={tt('Large icons', 'أيقونات كبيرة')}><Icon name="grid" size={15} /></button>
          </div>
        )}
      </footer>

      {queue.length > 0 && (
        <div className="mp-queue" role="status">
          <div className="mp-queue__head"><strong>{busyUploading ? tt('Uploading…', 'جارٍ الرفع…') : tt('Uploads', 'الرفع')}</strong>
            <button type="button" onClick={() => { pending.current = []; setQ((q) => q.filter((x) => x.status === 'uploading')); }} aria-label={tt('Clear', 'مسح')}><Icon name="x" size={14} /></button></div>
          <ul>
            {queue.slice(-30).map((q) => (
              <li key={q.uid} className={`is-${q.status}`}>
                <span dir="auto" title={q.rel}>{q.rel}</span>
                <em>{q.status === 'error' ? q.error : q.status === 'done' ? '✓' : q.status === 'queued' ? tt('Waiting', 'في الانتظار') : `${q.pct}%`}</em>
                {q.status === 'uploading' && <i style={{ width: `${q.pct}%` }} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && <div className={`mp-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">{toast.msg}</div>}

      {menu && (
        <CtxMenu x={menu.x} y={menu.y} rtl={ar}>
          {menuItems().map((m, i) => (m.sep
            ? <li key={`s${i}`} className="mp-ctx__sep" role="separator" />
            : (
              <li key={m.label} role="none">
                <button type="button" role="menuitem" disabled={m.disabled} className={m.danger ? 'mp-danger' : ''} onClick={() => { setMenu(null); m.run(); }}>
                  <Icon name={m.icon} size={15} /><span>{m.label}</span>{m.hint && <kbd>{m.hint}</kbd>}
                </button>
              </li>
            )))}
        </CtxMenu>
      )}

      {dlg?.type === 'name' && <NameDialog dlg={dlg} tt={tt} onClose={() => setDlg(null)} />}
      {dlg?.type === 'confirm' && (
        <StModal
          title={dlg.title} onClose={() => setDlg(null)}
          actions={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDlg(null)}>{tt('Cancel', 'إلغاء')}</button>
              <button type="button" autoFocus className={`btn ${dlg.danger ? 'btn-danger st-btn-danger st-btn-solid mp-confirm-danger' : 'btn-primary'}`} onClick={() => { const f = dlg.onOk; setDlg(null); f(); }}>{dlg.danger && <Icon name="trash" size={15} />}<span>{dlg.action}</span></button>
            </>
          )}
        ><p>{dlg.text}</p></StModal>
      )}
      {dlg?.type === 'project' && (
        <StModal
          title={tt('New project', 'مشروع جديد')} onClose={() => setDlg(null)}
          actions={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDlg(null)}>{tt('Cancel', 'إلغاء')}</button>
              <button
                type="button" className="btn btn-primary" disabled={!dlg.value.trim()}
                onClick={async () => { const d = dlg; setDlg(null); const r = await run(() => drive.createProject(folderParam, d.value.trim(), d.template), tt('Project created.', 'تم إنشاء المشروع.')); if (r?.data) setEditor({ kind: 'folder', node: r.data }); }}
              >{tt('Create & open', 'إنشاء وفتح')}</button>
            </>
          )}
        >
          <label className="mp-field"><span>{tt('Project name', 'اسم المشروع')}</span>
            <input autoFocus value={dlg.value} onChange={(e) => setDlg({ ...dlg, value: e.target.value })} maxLength={120} /></label>
          <div className="mp-tpl">
            {TEMPLATES.map((x) => (
              <button key={x.key} type="button" className={dlg.template === x.key ? 'is-on' : ''} onClick={() => setDlg({ ...dlg, template: x.key })}>
                <Icon name={x.icon} size={18} /><span>{ar ? x.ar : x.en}</span>
              </button>
            ))}
          </div>
        </StModal>
      )}

      {viewer && viewerFiles.length > 0 && (
        <FileViewer
          files={viewerFiles} startIndex={startViewerIndex} locale={locale} onClose={() => setViewer(null)}
          loadBlob={loadViewerBlob} onSaveFile={saveViewerFile}
          sandboxTokenPathOf={(f) => drive.sandboxTokenPath(f.driveId ?? f.id)}
        />
      )}
      {editor && editorLoad && (
        <EditorOverlay
          title={editor.node.name} load={editorLoad} onSave={editorSave} tt={tt} rtl={ar} onClose={() => setEditor(null)}
          sandboxTokenPath={editor.kind === 'folder' ? drive.sandboxTokenPath(editor.node.id) : undefined}
        />
      )}
    </div>
  );
}
