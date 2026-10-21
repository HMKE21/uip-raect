import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { errorMessage } from '../api/client';
import { sharedApi } from '../lib/driveApi';
import { saveBlob } from '../lib/exporter';
import { extOf, isTextName } from '../lib/driveFileKinds';
import Icon from '../components/Icon';
import { FileGlyph, FolderGlyph } from '../desktop/OsIcons';
import '../styles/css/drive-share.css';

const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const VID = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUD = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const TEXT_PREVIEW_MAX = 1024 * 1024;

const kindOf = (name) => {
  const e = extOf(name);
  if (IMG.has(e)) return 'image';
  if (VID.has(e)) return 'video';
  if (AUD.has(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (isTextName(name) || e === 'json') return 'text';
  return 'none';
};

/** Safe blob type for the preview (the server sends the file's own MIME, which we don't trust for iframes). */
const typed = (blob, kind, name) => {
  if (kind === 'pdf') return new Blob([blob], { type: 'application/pdf' });
  if (kind === 'image' && extOf(name) === 'svg') return new Blob([blob], { type: 'image/svg+xml' });
  return blob;
};

/**
 * Public page for a My PC share link (/s/:token) — no sign-in. A shared folder can be browsed; files are previewed
 * in place and downloaded only when the owner allowed it ("view only" hides every download button).
 */
export default function SharedItem() {
  const { token } = useParams();
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const t = useCallback((en, a) => (ar ? a : en), [ar]);

  const [nodeId, setNodeId] = useState(null);   // null = the shared item itself
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);         // { status, message }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { id, name, kind, url?, text?, loading?, failed? }
  const urlRef = useRef(null);

  const clearPreview = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setPreview(null);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    sharedApi.view(token, nodeId).then((d) => { if (live) { setData(d); setErr(null); } })
      .catch((e) => { if (live) setErr({ status: e?.status || 0, message: errorMessage(e) }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [token, nodeId]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const node = data?.node;
  const share = data?.share;
  const canDl = !!share?.can_download;
  const isFolder = node?.type === 'folder';

  // a shared single file previews right away
  const openPreview = useCallback(async (file) => {
    clearPreview();
    const kind = kindOf(file.name);
    setPreview({ id: file.id, name: file.name, kind, loading: kind !== 'none' });
    if (kind === 'none') return;
    try {
      const raw = await sharedApi.file(token, file.id === share?.root?.id ? null : file.id);
      if (kind === 'text') {
        const text = await raw.slice(0, TEXT_PREVIEW_MAX).text();
        setPreview({ id: file.id, name: file.name, kind, text: raw.size > TEXT_PREVIEW_MAX ? `${text}\n…` : text });
      } else {
        const url = URL.createObjectURL(typed(raw, kind, file.name));
        urlRef.current = url;
        setPreview({ id: file.id, name: file.name, kind, url });
      }
    } catch { setPreview({ id: file.id, name: file.name, kind, failed: true }); }
  }, [token, share, clearPreview]);

  useEffect(() => {
    if (node && node.type === 'file' && nodeId === null) openPreview(node);
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id) => { clearPreview(); setNodeId(id && id !== share?.root?.id ? id : null); };

  const download = async (file) => {
    setBusy(true);
    try {
      const blob = await sharedApi.file(token, file.id === share?.root?.id ? null : file.id, { download: true });
      saveBlob(blob, file.name);
    } catch (e) { setErr({ status: e?.status || 0, message: errorMessage(e), soft: true }); } finally { setBusy(false); }
  };
  const downloadZip = async () => {
    setBusy(true);
    try {
      const blob = await sharedApi.zip(token, node.id === share?.root?.id ? null : node.id);
      saveBlob(blob, `${node.name}.zip`);
    } catch (e) { setErr({ status: e?.status || 0, message: errorMessage(e), soft: true }); } finally { setBusy(false); }
  };

  const dead = err && !err.soft && !data;
  const fmtDate = (v) => { const d = new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(ar ? 'ar-EG' : undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

  return (
    <div className="shp" dir={ar ? 'rtl' : 'ltr'}>
      <header className="shp__top">
        <Link to="/" className="shp__brand"><Icon name="folder" size={18} /><span>{t('My PC — shared item', 'جهازي — عنصر مشارَك')}</span></Link>
      </header>

      <main className="shp__main">
        {loading && !data && <div className="shp__state"><span className="lp2-spinner" aria-hidden="true" /><p>{t('Loading…', 'جارِ التحميل…')}</p></div>}

        {dead && (
          <div className="shp__state" role="alert">
            <Icon name={err.status === 410 ? 'clock' : 'lock'} size={34} />
            <h1>{err.status === 410 ? t('This link is no longer available', 'الرابط ده مبقاش متاح') : t('Link not found', 'الرابط مش موجود')}</h1>
            <p>{err.message}</p>
          </div>
        )}

        {data && (
          <>
            <section className="shp__card">
              <div className="shp__head">
                <div style={{ minWidth: 0 }}>
                  <h1 className="shp__title">{share.root.name}</h1>
                  <p className="shp__sub">
                    {share.owner_name && <span>{t('Shared by ', 'شاركه معاك ')}{share.owner_name}</span>}
                    {share.expires_at && <span>{t('Available until ', 'متاح لحد ')}{fmtDate(share.expires_at)}</span>}
                    {!canDl && <span>{t('View only', 'عرض فقط')}</span>}
                  </p>
                </div>
                {canDl && (
                  <div className="shp__actions">
                    {isFolder
                      ? <button type="button" className="btn btn-primary" disabled={busy} onClick={downloadZip}><Icon name="download" size={15} /><span>{t('Download as ZIP', 'تنزيل كـ ZIP')}</span></button>
                      : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => download(node)}><Icon name="download" size={15} /><span>{t('Download', 'تنزيل')}</span></button>}
                  </div>
                )}
              </div>
              {err?.soft && <div className="mp-share__err" role="alert" style={{ marginTop: 10 }}>{err.message}</div>}
            </section>

            {isFolder && (
              <section className="shp__card">
                <nav className="shp__crumbs" aria-label={t('Path', 'المسار')}>
                  {data.breadcrumb.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && <span aria-hidden="true"> / </span>}
                      <button type="button" disabled={i === data.breadcrumb.length - 1} onClick={() => go(c.id)}>{c.name}</button>
                    </span>
                  ))}
                </nav>
                {data.items.length === 0 ? <p className="shp__note">{t('This folder is empty.', 'المجلد فاضي.')}</p> : (
                  <ul className="shp__list">
                    {data.items.map((it) => (
                      <li key={it.id}>
                        <button type="button" className="shp__item" onClick={() => (it.type === 'folder' ? go(it.id) : openPreview(it))}>
                          {it.type === 'folder' ? <FolderGlyph size={28} /> : <FileGlyph size={28} label={it.extension} />}
                          <span className="shp__item-name">{it.name}</span>
                          {it.type === 'file' && <span className="shp__item-size">{it.size_human}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {preview && (
              <section className="shp__card">
                <div className="shp__head" style={{ marginBottom: 12 }}>
                  <strong style={{ wordBreak: 'break-word' }}>{preview.name}</strong>
                  <div className="shp__actions">
                    {canDl && isFolder && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => download({ id: preview.id, name: preview.name })}><Icon name="download" size={14} /><span>{t('Download', 'تنزيل')}</span></button>}
                    {isFolder && <button type="button" className="btn btn-ghost" onClick={clearPreview}><Icon name="x" size={14} /><span>{t('Close', 'إغلاق')}</span></button>}
                  </div>
                </div>
                <div className="shp__preview">
                  {preview.loading && <span className="lp2-spinner" aria-hidden="true" />}
                  {preview.failed && <p className="shp__note">{t('Could not load the preview.', 'تعذّر تحميل المعاينة.')}</p>}
                  {preview.kind === 'none' && <p className="shp__note">{canDl ? t('No preview for this file type — download it to open it.', 'مفيش معاينة لنوع الملف ده — نزّله عشان تفتحه.') : t('No preview is available for this file type.', 'مفيش معاينة متاحة لنوع الملف ده.')}</p>}
                  {preview.url && preview.kind === 'image' && <img src={preview.url} alt={preview.name} />}
                  {preview.url && preview.kind === 'video' && <video src={preview.url} controls controlsList={canDl ? undefined : 'nodownload'} />}
                  {preview.url && preview.kind === 'audio' && <audio src={preview.url} controls controlsList={canDl ? undefined : 'nodownload'} />}
                  {preview.url && preview.kind === 'pdf' && <iframe src={preview.url} title={preview.name} />}
                  {preview.kind === 'text' && preview.text !== undefined && <pre dir="auto">{preview.text}</pre>}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
