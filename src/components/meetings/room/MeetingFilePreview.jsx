import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../Icon';
import { BlobPreviewModal, extOf, TEXT_EXT } from '../../FilePreviewButton';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];
const VID = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const AUD = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'oga', 'opus', 'weba'];

const INSPECTABLE = ['pdf', 'csv', 'xlsx', 'docx', ...TEXT_EXT];

/** image | video | audio | file — by extension first, then by mime type. */
export function fileKind(file) {
  const ext = (file?.extension || extOf(file?.original_name || file?.name) || '').toLowerCase();
  const mime = String(file?.mime_type || file?.mime || '').toLowerCase();
  if (IMG.includes(ext) || mime.startsWith('image/')) return 'image';
  if (VID.includes(ext) || mime.startsWith('video/')) return 'video';
  if (AUD.includes(ext) || mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Uploaded files are served from the Laravel host. The page itself only talks to its own origin (CSP + Vercel rewrite), so any
 * `.../uploads/...` URL is turned into the same-origin `/uploads/...` path — the same bytes, no cross-origin request.
 */
export function sameOriginUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.origin);
    const i = u.pathname.indexOf('/uploads/');
    if (i !== -1) return u.pathname.slice(i) + u.search;
    return u.href;
  } catch { return url; }
}

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Small file-type icon name for the file cards. */
export function fileIcon(file) {
  const k = fileKind(file);
  if (k === 'image') return 'image';
  if (k === 'video') return 'video';
  if (k === 'audio') return 'mic';
  return 'file';
}

/** Full-screen preview of one shared file. `file` = { original_name, download_url, extension?, mime_type?, size_bytes? }. */
export default function MeetingFilePreview({ file, onClose }) {
  const t = useTranslations(translations);
  const url = sameOriginUrl(file.download_url);
  const name = file.original_name || file.name || 'file';
  const kind = fileKind(file);
  const ext = (file?.extension || extOf(name) || '').toLowerCase();
  // only download the bytes for types the previewer can actually render (a 200 MB zip is not fetched just to say "no preview")
  const inspectable = kind === 'file' && INSPECTABLE.includes(ext);
  const [blob, setBlob] = useState(null);
  const [err, setErr] = useState(null);

  // documents / sheets / text / PDF go through the platform's own previewer (pdf.js canvas, mammoth, table view…) which needs the bytes
  useEffect(() => {
    if (!inspectable) return undefined;
    let cancelled = false;
    fetch(url, { credentials: 'omit' })
      .then((res) => { if (!res.ok) throw new Error(`Request failed (${res.status})`); return res.blob(); })
      .then((b) => { if (!cancelled) setBlob(b); })
      .catch((e) => { if (!cancelled) setErr(e?.message || 'Could not load this file.'); });
    return () => { cancelled = true; };
  }, [inspectable, url]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (inspectable && blob) {
    return <BlobPreviewModal blob={blob} filename={name} title={name} onClose={onClose} />;
  }

  const body = (
    <div className="meeting-preview" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="meeting-preview__box" onClick={(e) => e.stopPropagation()}>
        <div className="meeting-preview__head">
          <strong title={name}>{name}</strong>
          {file.size_bytes != null && <span className="meeting-preview__size">{formatSize(file.size_bytes)}</span>}
          <a className="meeting-preview__btn" href={url} download={name} title={t('Download')} aria-label={t('Download')}><Icon name="download" size={16} /></a>
          <button type="button" className="meeting-preview__btn" onClick={onClose} title={t('Close')} aria-label={t('Close')}><Icon name="x" size={16} /></button>
        </div>
        <div className="meeting-preview__body">
          {kind === 'image' && <img src={url} alt={name} />}
          {kind === 'video' && <video src={url} controls autoPlay playsInline />}
          {kind === 'audio' && <audio src={url} controls autoPlay />}
          {inspectable && !err && <p className="meeting-preview__msg">{t('Loading…')}</p>}
          {inspectable && err && <p className="meeting-preview__msg">{err}</p>}
          {kind === 'file' && !inspectable && (
            <div className="meeting-preview__msg">
              <Icon name="file" size={36} />
              <p>{t('Preview is not available for this file type in the browser. Download it to open it.')}</p>
              <a className="btn btn-primary" href={url} download={name}><Icon name="download" size={16} /> {t('Download')}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(body, document.body) : body;
}
