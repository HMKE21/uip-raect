import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { errorMessage } from '../api/client';
import { sharedApi } from '../lib/driveApi';
import { saveBlob } from '../lib/exporter';
import { startSharedGuard } from '../lib/sharedGuard';
import { avatarSrc } from '../components/insight/AvatarUploader';
import Icon from '../components/Icon';
import { FileGlyph, FolderGlyph } from '../desktop/OsIcons';
import ProtectedFile, { kindOfName } from '../components/shared/ProtectedFile';
import '../styles/css/drive-share.css';

const BIG_PREVIEW_BYTES = 80 * 1024 * 1024; // non-media files above this are not previewed in the browser

/** Sender's avatar: photo when allowed and loadable, otherwise the first letter of the name on a colour taken from the name. */
function SenderAvatar({ name, src }) {
  const [bad, setBad] = useState(false);
  const letter = (String(name || '').trim().match(/\p{L}|\p{N}/u) || [''])[0].toUpperCase();
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) % 360;
  if (src && !bad) return <img className="shp__avatar" src={src} alt="" draggable={false} onError={() => setBad(true)} />;
  return (
    <span className="shp__avatar shp__avatar--letter" style={{ background: `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${(h + 40) % 360} 62% 42%))` }} aria-hidden="true">
      {letter || <Icon name="user" size={18} />}
    </span>
  );
}

/**
 * Public page for a My PC share link (/s/:token) — no sign-in, protected: no context menu / selection / copy / print /
 * view-source / devtools shortcuts, devtools detection that wipes the content, images and PDFs drawn to canvas with a
 * burned-in watermark. A shared folder can be browsed; downloads only exist when the owner allowed them.
 */
export default function SharedItem() {
  const { token } = useParams();
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const t = useCallback((en, a) => (ar ? a : en), [ar]);

  const [nodeId, setNodeId] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { id, name, kind, blob?, url?, text?, loading?, failed? }
  const [locked, setLocked] = useState(false);
  const [away, setAway] = useState(() => typeof document !== 'undefined' && !document.hasFocus());
  const [shot, setShot] = useState(false);
  const shotT = useRef(0);
  const viewId = useMemo(() => Math.random().toString(36).slice(2, 8).toUpperCase(), []);
  const stamp = useMemo(() => new Date().toLocaleString(ar ? 'ar-EG' : undefined, { dateStyle: 'medium', timeStyle: 'short' }), [ar]);
  const mark = `${t('Protected', 'محتوى محمي')} · ${stamp} · #${viewId}`;

  const clearPreview = useCallback(() => {
    setPreview(null);
  }, []);

  // protection: shortcuts / menus / devtools. Once devtools are seen, every file is dropped and the page stays locked.
  useEffect(() => {
    const stopGuard = startSharedGuard({
      onLock: (on) => { if (on) { setLocked(true); setData(null); clearPreview(); } },
      // a screenshot shortcut hides the content for a few seconds (view-only links)
      onCapture: () => { setShot(true); clearTimeout(shotT.current); shotT.current = setTimeout(() => setShot(false), 3500); },
    });
    const onVis = () => setAway(document.hidden || !document.hasFocus());
    document.addEventListener('visibilitychange', onVis);
    const onBlur = () => setAway(true);
    const onFocus = () => setAway(false);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.documentElement.classList.add('shp-lock');
    return () => {
      stopGuard();
      clearTimeout(shotT.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.documentElement.classList.remove('shp-lock');
    };
  }, [clearPreview]);

  useEffect(() => {
    if (locked) return undefined;
    let live = true;
    setLoading(true);
    sharedApi.view(token, nodeId).then((d) => { if (live) { setData(d); setErr(null); } })
      .catch((e) => { if (live) setErr({ status: e?.status || 0, message: errorMessage(e) }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [token, nodeId, locked]);

  const node = data?.node;
  const share = data?.share;
  const canDl = !!share?.can_download;
  const isFolder = node?.type === 'folder';

  const openPreview = useCallback(async (file) => {
    clearPreview();
    const kind = kindOfName(file.name);
    const media = kind === 'video' || kind === 'audio';
    if (kind === 'none') { setPreview({ id: file.id, name: file.name, none: true }); return; }
    if (!media && Number(file.size_bytes) > BIG_PREVIEW_BYTES) { setPreview({ id: file.id, name: file.name, big: true }); return; }
    setPreview({ id: file.id, name: file.name, loading: true });
    try {
      const blob = await sharedApi.file(token, file.id === share?.root?.id ? null : file.id);
      setPreview({ id: file.id, name: file.name, blob });
    } catch { setPreview({ id: file.id, name: file.name, failed: true }); }
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
  const owner = share?.owner_name || '';
  const wmStyle = { '--shp-mark': `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='180' y='100' transform='rotate(-22 180 100)' text-anchor='middle' font-family='sans-serif' font-size='14' font-weight='600' fill='#6b7280' fill-opacity='.16'>${mark.replace(/[<>&'"]/g, '')}</text></svg>`)}")` };

  if (locked) {
    return (
      <div className="shp shp--center" dir={ar ? 'rtl' : 'ltr'}>
        <div className="shp__state" role="alert">
          <span className="shp__state-ico"><Icon name="shield" size={30} /></span>
          <h1>{t('This page is protected', 'الصفحة دي محمية')}</h1>
          <p>{t('Developer tools were detected, so the content was removed. Close them and reload to continue.', 'اتكشفت أدوات المطوّر فاتشال المحتوى. اقفلها وأعد تحميل الصفحة عشان تكمّل.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('Reload', 'إعادة التحميل')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`shp${(away || shot) && !canDl ? ' is-away' : ''}`} dir={ar ? 'rtl' : 'ltr'} onContextMenu={(e) => e.preventDefault()}>
      {data && (
        <header className="shp__top">
          <div className="shp__who">
            <SenderAvatar name={owner} src={avatarSrc(share.owner_avatar)} />
            {owner && <span className="shp__who-name">{owner}</span>}
          </div>
        </header>
      )}

      <main className="shp__main">
        {loading && !data && <div className="shp__state"><span className="lp2-spinner" aria-hidden="true" /><p>{t('Loading…', 'جارِ التحميل…')}</p></div>}

        {dead && (
          <div className="shp__state" role="alert">
            <span className="shp__state-ico"><Icon name={err.status === 410 ? 'clock' : 'lock'} size={30} /></span>
            <h1>{err.status === 410 ? t('This link is no longer available', 'الرابط ده مبقاش متاح') : t('Link not found', 'الرابط مش موجود')}</h1>
            <p>{err.message}</p>
          </div>
        )}

        {data && (
          <>
            <section className="shp__card shp__hero">
              <span className="shp__hero-ico">{isFolder ? <FolderGlyph size={44} /> : <FileGlyph size={44} label={node.extension} />}</span>
              <div className="shp__hero-txt">
                <h1 className="shp__title">{share.root.name}</h1>
                <div className="shp__chips">
                  {!isFolder && node.size_human && <span className="shp__chip">{node.size_human}</span>}
                  {share.expires_at && <span className="shp__chip"><Icon name="clock" size={12} />{t('Available until ', 'متاح لحد ')}{fmtDate(share.expires_at)}</span>}
                  {!canDl && <span className="shp__chip shp__chip--lock"><Icon name="eye" size={12} />{t('View only', 'عرض فقط')}</span>}
                </div>
              </div>
              {canDl && (
                <div className="shp__actions">
                  {isFolder
                    ? <button type="button" className="btn btn-primary" disabled={busy} onClick={downloadZip}><Icon name="download" size={15} /><span>{t('Download as ZIP', 'تنزيل كـ ZIP')}</span></button>
                    : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => download(node)}><Icon name="download" size={15} /><span>{t('Download', 'تنزيل')}</span></button>}
                </div>
              )}
              {err?.soft && <div className="mp-share__err shp__hero-err" role="alert">{err.message}</div>}
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
                        <button type="button" className={`shp__item${preview?.id === it.id ? ' is-on' : ''}`} onClick={() => (it.type === 'folder' ? go(it.id) : openPreview(it))}>
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
              <section className="shp__card shp__viewer">
                {isFolder && (
                  <div className="shp__head">
                    <strong className="shp__vtitle">{preview.name}</strong>
                    <div className="shp__actions">
                      {canDl && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => download({ id: preview.id, name: preview.name })}><Icon name="download" size={14} /><span>{t('Download', 'تنزيل')}</span></button>}
                      <button type="button" className="btn btn-ghost" onClick={clearPreview}><Icon name="x" size={14} /><span>{t('Close', 'إغلاق')}</span></button>
                    </div>
                  </div>
                )}
                <div className={`shp__preview${preview.blob ? " has-file" : ""}`} style={wmStyle}>
                  {preview.loading && <span className="lp2-spinner" aria-hidden="true" />}
                  {preview.failed && <p className="shp__note">{t('Could not load the preview.', 'تعذّر تحميل المعاينة.')}</p>}
                  {preview.big && <p className="shp__note">{canDl ? t('This file is too large to preview — download it to open it.', 'الملف كبير على المعاينة — نزّله عشان تفتحه.') : t('This file is too large to preview.', 'الملف كبير على المعاينة.')}</p>}
                  {preview.none && <p className="shp__note">{canDl ? t('No preview for this file type — download it to open it.', 'مفيش معاينة لنوع الملف ده — نزّله عشان تفتحه.') : t('No preview is available for this file type.', 'مفيش معاينة متاحة لنوع الملف ده.')}</p>}
                  {preview.blob && <ProtectedFile key={preview.id} name={preview.name} blob={preview.blob} mark={mark} tt={t} rtl={ar} onFail={() => setPreview((p) => p && { ...p, blob: null, failed: true })} />}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      {(away || shot) && !canDl && data && (
        <div className="shp__veil" role="status"><Icon name="eye-off" size={26} /><p>{t('Content is hidden while the window is not in focus.', 'المحتوى مخفي طول ما النافذة مش في التركيز.')}</p></div>
      )}
    </div>
  );
}
