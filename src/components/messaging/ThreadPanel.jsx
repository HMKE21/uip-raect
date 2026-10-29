import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { portalPrefix } from '../../config/navConfig';
import { publicOrigin } from '../../config/siteUrl';
import Icon from '../Icon';
import VideoPlayer from '../VideoPlayer';
import ChatFile from './ChatFile';
import PollBubble from './PollBubble';
import MsgIcon from './msgIcons';
import { Avatar } from './ConversationRail';
import { fmtTime, fmtDayLabel, fmtBytes, fmtDuration, fmtClock, peerLabel, renderBody, roleLabel, avatarUrl } from './format';
import { bgCss } from './stories/storyUtils';
import { parseServerDate } from '../../utils/serverDate';
import { useLanguage } from '../../context/LanguageContext';
import MediaEditorModal, { isEditableMedia } from './MediaEditorModal';
import VoiceMessage, { isVoiceAttachment } from './VoiceMessage';
import { createVoiceEngine, voiceConstraints, LIVE_PROCESSING } from './voiceEngine';
import { warmRnnoise } from '../../lib/rnnoise';
import { saveAttachmentsToPhone, isAutoSaveOn } from '../../lib/autoSaveMedia';
import { useCachedVideo } from '../../lib/mediaCache';
import { useProtectedSrc, useSignedMediaUrl } from '../../lib/chatMedia';
import { isNative, canCacheNatively } from '../../native';
import { systemLine, fileKind, typeLabel } from './groupText';
import CallBubble from '../calls/CallBubble';
import { useCall } from '../../context/callCtx';
import EmojiPicker from './EmojiPicker';
import AttachMenu from './AttachMenu';
import CameraCaptureModal from './CameraCaptureModal';
import ViewOnceMedia from './ViewOnceMedia';
import LinkCard, { firstUrl } from './LinkCard';
import { LocationBubble, LiveLocationBubble, LocationShareModal } from './LocationMessage';
import '../../styles/css/messaging-pro.css';

/** Sent / delivered / read ticks (WhatsApp style): ✓ grey, ✓✓ grey, ✓✓ blue. */

/** Small card above a reply that was sent from someone's story (metadata.story_reply from the stories API). */
function StoryReplyCard({ info, ar }) {
  const thumb = info.thumb ? avatarUrl(info.thumb) : null;
  const kind = info.type === 'video' ? (ar ? 'فيديو' : 'Video') : info.type === 'image' ? (ar ? 'صورة' : 'Photo') : (ar ? 'نص' : 'Text');
  return (
    <div className="msg-story-card">
      <span className="msg-story-card__thumb" style={info.type === 'text' && info.bg ? { background: bgCss(info.bg) } : undefined}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span aria-hidden="true">{info.type === 'text' ? 'Aa' : '▶'}</span>}
      </span>
      <span className="msg-story-card__tx">
        <strong>{ar ? 'ردّ على استوري' : 'Replied to a story'} · {kind}</strong>
        {info.snippet ? <span>{info.snippet}</span> : null}
      </span>
    </div>
  );
}

function Ticks({ status }) {
  if (!status) return null;
  const read = status === 'read';
  const two = status === 'delivered' || read;
  return (
    <svg className={`msg-ticks${read ? ' is-read' : ''}`} width="17" height="11" viewBox="0 0 17 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-label={status}>
      <path d="M1 5.8 4.2 9 10.2 1.6" />
      {two && <path d="M6.6 8.4 7.2 9 13.2 1.6" />}
    </svg>
  );
}

/** Scroll to a message in the thread and flash it (used by reply quotes). */
function jumpToMessage(id) {
  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('msg-row--flash');
  setTimeout(() => el.classList.remove('msg-row--flash'), 1600);
  return true;
}

/** Inline bilingual picker: const t = useT(); t('English', 'عربي'). */
function useT() {
  const { locale } = useLanguage();
  return (en, ar) => (locale === 'ar' ? ar : en);
}

// Mirrors config/messaging.php: how long "Cancel" (undo send) is offered, and how long "delete for everyone" works.
const UNDO_WINDOW_S = 60;
const DELETE_ALL_WINDOW_MIN = 15;

function sentAtOf(m) {
  if (m._sentAt) return m._sentAt;
  const ts = m.created_at ? parseServerDate(m.created_at).getTime() : NaN;
  return Number.isNaN(ts) ? 0 : ts;
}

function copyToClipboard(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(fallback);
  fallback();
  return Promise.resolve();
}

/** The text of a message that "Copy" puts on the clipboard (text, or a poll's question + options). */
function copyableText(m) {
  if (m.message_type === 'poll' && m.metadata) return [m.metadata.question, ...(m.metadata.options || []).map((o, i) => `${i + 1}. ${o}`)].join('\n');
  return m.body || '';
}

const EMOJI_SET = [
  '😀', '😂', '🥰', '😎', '🤔', '😢', '😮', '😡', '👍', '👎',
  '🙏', '👏', '🔥', '🎉', '❤️', '💯', '✅', '❌', '🚀', '⭐',
  '😴', '🤝', '👀', '💡', '📌', '⚡', '🙌', '😅', '🤯', '🥳',
];

/**
 * Floating panel anchored to a button (message "More" menu / reaction picker).
 * Rendered fixed + in a portal so it is never clipped by the thread's
 * overflow (it used to be cut off for short bubbles near the left edge), and
 * it is clamped to the viewport / flipped above when there is no room below.
 * Closes on outside click, Escape, scroll and resize — before, it stayed open
 * until the same button was clicked again.
 */
/** Side-panel glyph: an outlined window with a divider; the panel area is shaded while that panel is showing. */
function PanelIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
      <path d="M9.5 4.5v15" />
      {filled && <path d="M6.5 4.5h3v15h-3A3.5 3.5 0 0 1 3 16V8a3.5 3.5 0 0 1 3.5-3.5z" fill="currentColor" stroke="none" opacity=".3" />}
    </svg>
  );
}

function FloatingPanel({ anchorRef, onClose, className, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  const host = anchorRef.current?.closest('.app-shell') || document.body;

  useLayoutEffect(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    const p = panelRef.current?.getBoundingClientRect();
    if (!a || !p) return;
    const M = 8;
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl' || document.dir === 'rtl';
    let left = rtl ? a.left : a.right - p.width;
    left = Math.max(M, Math.min(left, window.innerWidth - p.width - M));
    let top = a.bottom + 6;
    if (top + p.height > window.innerHeight - M) top = Math.max(M, a.top - p.height - 6);
    setPos({ left, top });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    // Mouse users: the popover goes away once the pointer has clearly left it (and the button that opened it).
    const canHover = window.matchMedia?.('(hover: hover)').matches;
    const near = (r, e, m) => r && e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m;
    const onMove = (e) => {
      const p = panelRef.current?.getBoundingClientRect();
      const a = anchorRef.current?.getBoundingClientRect();
      if (!p || !p.width) return;
      if (!near(p, e, 64) && !near(a, e, 64)) onClose();
    };
    if (canHover) document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      style={{
        position: 'fixed',
        left: pos ? pos.left : 0,
        top: pos ? pos.top : 0,
        bottom: 'auto',
        margin: 0,
        zIndex: 2000,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    host
  );
}

function MessageBubble({ m, myUserId, showAvatar, others, onCallBack, onOpenVideo, onRetryUpload, onDiscardUpload, onCancelUpload, onUndoSend, onReply, onEdit, onDelete, onReact, onPin, onVote, onStopLive, onOpenLightbox, onForward, onReport, editingId, onStartEdit, onSaveEdit, onCancelEdit, selectMode, selected, onToggleSelect, onStartSelect, savedChat }) {
  const t = useT();
  const navigate = useNavigate();
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phone / touch: the action bar is NOT shown by a tap or touch, only by a long press (~0.45 s) on the bubble.
  const [touchOpen, setTouchOpen] = useState(false);
  const rowRef = useRef(null);
  const pressRef = useRef({ timer: 0, x: 0, y: 0 });
  const touchMode = () => window.matchMedia('(hover: none), (max-width: 760px)').matches;
  const cancelPress = () => { clearTimeout(pressRef.current.timer); pressRef.current.timer = 0; };
  // Things that keep their own touch behaviour (links, players, inputs, buttons). Photos and the video tile are NOT
  // in this list any more: a long press anywhere on a photo/video must open the action bar, not only on its edge.
  const pressBlocked = (el) => {
    if (!el || !el.closest) return false;
    // file chips and voice / audio notes: a long press opens the action bar too (Save to phone); a tap still opens / plays
    if (el.closest('.msg-attach-file, .msg-voice') && !el.closest('input,textarea,.msg-hover-actions')) return false;
    if (el.closest('a,audio,input,textarea,.msg-hover-actions,.msg-attach-video--inline')) return true;
    const btn = el.closest('button');
    // the video tile and the small "full screen" corner button sit on top of the photo: a long press there
    // must open the action bar too (a plain tap on them still plays / enlarges as before)
    return !!btn && !btn.classList.contains('msg-attach-video--tile') && !btn.classList.contains('msg-attach-img__full');
  };
  // After a long press the finger is lifted over the photo: that must not count as a tap (enlarge / play).
  const swallowClickRef = useRef(0);
  const onPressStart = (e) => {
    if (selectMode || !touchMode() || m.pending || m.failed || e.touches?.length > 1) return;
    if (pressBlocked(e.target)) return;
    cancelPress();
    pressRef.current.x = e.touches[0].clientX; pressRef.current.y = e.touches[0].clientY;
    pressRef.current.timer = setTimeout(() => {
      pressRef.current.timer = 0;
      swallowClickRef.current = Date.now();
      setTouchOpen(true);
      try { navigator.vibrate?.(15); } catch { /* no haptics */ }
    }, 450);
  };
  const onPressEnd = (e) => {
    cancelPress();
    if (swallowClickRef.current && Date.now() - swallowClickRef.current < 1500 && e.cancelable) e.preventDefault();
  };
  const onClickCapture = (e) => {
    if (selectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(m);
      return;
    }
    if (swallowClickRef.current && Date.now() - swallowClickRef.current < 1500) {
      swallowClickRef.current = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onPressMove = (e) => {
    if (!pressRef.current.timer) return;
    const t0 = e.touches[0];
    if (Math.abs(t0.clientX - pressRef.current.x) > 10 || Math.abs(t0.clientY - pressRef.current.y) > 10) cancelPress();
  };
  useEffect(() => () => clearTimeout(pressRef.current.timer), []);
  // tapping anywhere outside this message hides the bar again
  useEffect(() => {
    if (!touchOpen) return undefined;
    const away = (ev) => { if (rowRef.current && !rowRef.current.contains(ev.target)) setTouchOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [touchOpen]);
  const reactBtnRef = useRef(null);
  const moreBtnRef = useRef(null);
  const [editValue, setEditValue] = useState(m.body || '');
  const isEditing = editingId === m.id;

  // Group events ("Sara added Omar", "Only admins can send now"...) are centred notices, not bubbles.
  if (m.message_type === 'system') {
    const line = systemLine(m.metadata, myUserId);
    return line ? (
      <div className="msg-system" data-msg-id={m.id}>
        <span>{line}</span>
      </div>
    ) : null;
  }

  if (m.is_deleted) {
    return (
      <div className={`msg-row${m.is_mine ? ' is-mine' : ' show-avatar'}`} data-msg-id={m.id}>
        {showAvatar && !m.is_mine ? <Avatar name={m.sender_name} size="sm" src={m.sender_avatar} /> : null}
        <div className="msg-bubble-col">
          <div className="msg-bubble msg-bubble--deleted">
            <Icon name="trash" size={13} />{' '}
            {m.is_mine
              ? t('You deleted this message', 'لقد حذفت هذه الرسالة')
              : (m.sender_name
                ? t(`${m.sender_name} sent a message and deleted it`, `${m.sender_name} أرسل رسالة وحذفها`)
                : t('This message was deleted', 'تم حذف هذه الرسالة'))}
          </div>
        </div>
      </div>
    );
  }

  // Photo / video with a caption: media on top (fills the bubble), caption underneath - like WhatsApp.
  const captioned = (!m.message_type || m.message_type === 'text') && !!m.body
    && !!(m.attachments && m.attachments.length > 0)
    && m.attachments.every((a) => a.kind === 'image' || (a.kind === 'video' && !isVoiceAttachment(a)));
  let isMedia = false;
  let body = null;
  const gcm = typeof m.body === 'string' ? m.body.match(/^(📹|📞)([^\n]*)\n\S*\/join\/([A-Za-z0-9_-]+)\s*$/) : null;
  const groupCall = gcm ? { video: gcm[1] === '📹', head: gcm[1] + gcm[2], token: gcm[3] } : null;
  if (m.message_type === 'call' && m.metadata) {
    body = <CallBubble m={m} myUserId={myUserId} onCallBack={onCallBack} canCall={!!onCallBack} />;
  } else if (m.message_type === 'poll' && m.metadata) {
    body = <PollBubble m={m} onVote={onVote} />;
  } else if (m.message_type === 'location' && m.metadata) {
    isMedia = true;
    body = <LocationBubble m={m} />;
  } else if (m.message_type === 'live_location' && m.metadata) {
    isMedia = true;
    body = <LiveLocationBubble m={m} onStop={onStopLive} />;
  } else if (m.message_type === 'gif' && m.metadata) {
    isMedia = true;
    body = <img className="msg-gif-img" src={m.metadata.url} alt={m.metadata.title || 'GIF'} loading="lazy" />;
  } else if (m.message_type === 'sticker' && m.metadata) {
    isMedia = true;
    body = <img className="msg-sticker-img" src={m.metadata.url} alt={m.metadata.label || t('Sticker', 'ملصق')} loading="lazy" />;
  } else {
    body = (
      <>
        {m.parent_message_id && (
          <div className="msg-reply-quote is-link" role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); jumpToMessage(m.parent_message_id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') jumpToMessage(m.parent_message_id); }}>
            <strong>{m.parent_sender_name || ''}</strong>
            <span>{(m.parent_body || t('Attachment', 'مرفق')).slice(0, 80)}</span>
          </div>
        )}
        {m.metadata?.story_reply && <StoryReplyCard info={m.metadata.story_reply} ar={t('a', 'b') === 'b'} />}
        {m.forwarded_from_id && (
          <div className="msg-forward-tag">
            <MsgIcon name="forward" size={11} /> {t('Forwarded', 'معاد توجيهها')}
          </div>
        )}
        {groupCall ? (
          <div className="msg-group-call">
            <div className="msg-group-call__head">{groupCall.head}</div>
            <button type="button" className="msg-group-call__join" onClick={() => navigate(`/join/${groupCall.token}`)}>
              <Icon name={groupCall.video ? 'video' : 'phone'} size={16} /> {t('Join call', 'انضم للمكالمة')}
            </button>
          </div>
        ) : null}
        {m.body && !captioned && !groupCall ? <div>{renderBody(m.body, others)}</div> : null}
        {m.body && !captioned && !groupCall && !m.pending && firstUrl(m.body) ? <LinkCard url={firstUrl(m.body)} ar={t('a', 'b') === 'b'} /> : null}
        {m.attachments && m.attachments.length > 0 && (
          m.pending || m.failed
            ? <PendingAttachments attachments={m.attachments} pct={m.upload_progress || 0} uploading={!!m.pending} />
            : <MessageAttachments attachments={m.attachments} onOpenLightbox={onOpenLightbox} onOpenVideo={onOpenVideo} autoCache={isRecentMessage(m)} mine={!!m.is_mine} ar={t('en','ar') === 'ar'} />
        )}
        {m.body && captioned ? <div className="msg-caption">{renderBody(m.body, others)}</div> : null}
      </>
    );
  }

  // Attachment-only message (no text / reply quote / forward tag): tight frame
  // around the media instead of the full text-bubble padding.
  const attachOnly =
    !isMedia &&
    (!m.message_type || m.message_type === 'text') &&
    !m.body &&
    !m.parent_message_id &&
    !m.forwarded_from_id &&
    !!(m.attachments && m.attachments.length > 0);

  // Photos / videos only: no coloured frame around them (the 4px bubble padding looked like a border and
  // swallowed the long press). Files and voice notes keep the bubble because their styling depends on it.
  const visualOnly = attachOnly && !m.pending && !m.failed
    && m.attachments.every((a) => a.kind === 'image' || (a.kind === 'video' && !isVoiceAttachment(a)));

  const canSave = !m.pending && !m.failed && !!(m.attachments && m.attachments.some((a) => a && a.url && !a.local));
  const canEdit = m.is_mine && (!m.message_type || m.message_type === 'text');
  const textToCopy = copyableText(m);
  const doCopy = () => {
    copyToClipboard(textToCopy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  };

  return (
    <div
      ref={rowRef}
      className={`msg-row${m.is_mine ? ' is-mine' : ''}${showAvatar ? ' show-avatar' : ''}${selectMode ? ' is-selecting' : ''}${selected ? ' is-selected' : ''}`}
      data-msg-id={m.id}
      onTouchStart={onPressStart}
      onTouchMove={onPressMove}
      onTouchEnd={onPressEnd}
      onTouchCancel={cancelPress}
      onClickCapture={onClickCapture}
      onContextMenu={(e) => { if (touchMode() && !m.pending && !m.failed && !pressBlocked(e.target)) { e.preventDefault(); setTouchOpen(true); } }}
    >
      {selectMode ? (
        <span className={`msg-sel-dot msg-sel-dot--row${selected ? ' is-on' : ''}`} aria-hidden="true">{selected ? <Icon name="check" size={13} /> : null}</span>
      ) : null}
      {!m.is_mine ? <Avatar name={m.sender_name} size="sm" src={m.sender_avatar} /> : null}
      <div className="msg-bubble-col">
        {showAvatar && !m.is_mine ? <span className="msg-sender-name">{m.sender_name}</span> : null}
        <div className={`msg-bubble${isMedia ? ' msg-bubble--media' : ''}${attachOnly ? ' msg-bubble--attach' : ''}${visualOnly ? ' msg-bubble--visual' : ''}${captioned ? ' msg-bubble--captioned' : ''}`} style={{ position: 'relative' }}>
          <div
            className={`msg-hover-actions${showReactPicker || showMoreMenu || touchOpen ? ' is-open' : ''}`}
            hidden={!!(m.pending || m.failed || selectMode)}
            onClick={(e) => { if (e.target.closest('button') && !e.target.closest('[aria-label="تفاعل"],[aria-label="React"],[aria-label="المزيد"],[aria-label="More"]')) setTouchOpen(false); }}
          >
            <button type="button" aria-label={t('React', 'تفاعل')} ref={reactBtnRef} onClick={() => { setShowMoreMenu(false); setShowReactPicker((s) => !s); }}>
              <MsgIcon name="react" size={14} />
            </button>
            <button type="button" aria-label={t('Reply', 'رد')} onClick={() => onReply(m)}>
              <MsgIcon name="reply" size={14} />
            </button>
            <button type="button" aria-label={t('Forward', 'إعادة توجيه')} onClick={() => onForward(m.id)}>
              <MsgIcon name="forward" size={14} />
            </button>
            {onStartSelect && (
              <button type="button" aria-label={t('Select', 'تحديد')} title={t('Select', 'تحديد')} onClick={() => onStartSelect(m)}>
                <Icon name="check" size={14} />
              </button>
            )}
            {textToCopy && (
              <button type="button" aria-label={copied ? t('Copied', 'تم النسخ') : t('Copy', 'نسخ')} title={copied ? t('Copied', 'تم النسخ') : t('Copy', 'نسخ')} onClick={doCopy}>
                <Icon name={copied ? 'check' : 'copy'} size={14} />
              </button>
            )}
            {canEdit && (
              <button type="button" aria-label={t('Edit', 'تعديل')} onClick={() => onStartEdit(m.id)}>
                <Icon name="edit" size={14} />
              </button>
            )}
            <button type="button" aria-label={m.is_pinned ? t('Unpin', 'إلغاء التثبيت') : t('Pin', 'تثبيت')} onClick={() => onPin(m)}>
              <MsgIcon name="pin" size={14} />
            </button>
            {canSave && (
              <button type="button" aria-label={t('Save to phone', 'حفظ على الموبايل')} title={t('Save to phone', 'حفظ على الموبايل')} onClick={() => saveAttachmentsToPhone(m.attachments)}>
                <Icon name="download" size={14} />
              </button>
            )}
            <button type="button" aria-label={t('More', 'المزيد')} ref={moreBtnRef} onClick={() => { setShowReactPicker(false); setShowMoreMenu((s) => !s); }}>
              <MsgIcon name="more" size={14} />
            </button>
          </div>

          {showReactPicker && (
            <FloatingPanel anchorRef={reactBtnRef} className="msg-reaction-picker" onClose={() => setShowReactPicker(false)}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => {
                    onReact(m.id, e);
                    setShowReactPicker(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </FloatingPanel>
          )}

          {showMoreMenu && (
            <FloatingPanel anchorRef={moreBtnRef} className="msg-menu__panel is-open" onClose={() => setShowMoreMenu(false)}>
              {textToCopy && (
                <button type="button" className="msg-menu__item" onClick={() => { doCopy(); setShowMoreMenu(false); }}>
                  <Icon name="copy" size={15} />
                  {t('Copy text', 'نسخ النص')}
                </button>
              )}
              {canSave && (
                <button type="button" className="msg-menu__item" onClick={() => { saveAttachmentsToPhone(m.attachments); setShowMoreMenu(false); }}>
                  <Icon name="download" size={15} />
                  {t('Save to phone', 'حفظ على الموبايل')}
                </button>
              )}
              {m.is_mine && (
                <button
                  type="button"
                  className="msg-menu__item msg-menu__item--danger"
                  onClick={() => {
                    onDelete(m.id, 'for-everyone');
                    setShowMoreMenu(false);
                  }}
                >
                  <Icon name="trash" size={15} />
                  {t('Delete for everyone', 'حذف للجميع')}
                </button>
              )}
              <button
                type="button"
                className="msg-menu__item"
                onClick={() => {
                  onDelete(m.id, 'for-me');
                  setShowMoreMenu(false);
                }}
              >
                <Icon name="eye-off" size={15} />
                {t('Delete for me', 'حذف عندي')}
              </button>
              {!m.is_mine && onReport && m.message_type !== 'system' && (
                <button
                  type="button"
                  className="msg-menu__item msg-menu__item--danger"
                  onClick={() => {
                    onReport(m);
                    setShowMoreMenu(false);
                  }}
                >
                  <Icon name="alert" size={15} />
                  {t('Report message', 'الإبلاغ عن الرسالة')}
                </button>
              )}
            </FloatingPanel>
          )}

          {isEditing ? (
            <div>
              <textarea
                className="msg-edit-textarea"
                style={{ width: '100%', minHeight: 60, background: 'transparent', border: '1px solid currentColor', borderRadius: 8, padding: 6, color: 'inherit', font: 'inherit' }}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={onCancelEdit}>{t('Cancel', 'إلغاء')}</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onSaveEdit(m.id, editValue.trim())}>{t('Save', 'حفظ')}</button>
              </div>
            </div>
          ) : (
            body
          )}
        </div>

        {m.reactions && m.reactions.length > 0 && (
          <div className="msg-reactions">
            {m.reactions.map((r) => (
              <button
                type="button"
                key={r.emoji}
                className="msg-reaction-pill"
                title={(r.users || []).map((u) => u.full_name).join(', ')}
                onClick={() => onReact(m.id, r.emoji)}
              >
                {r.emoji} <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="msg-meta-row">
          {m.is_pinned ? <MsgIcon name="pin" size={11} /> : null}
          {m.pending ? (
            <>
              <span>{(m.upload_progress || 0) >= 100 ? t('Processing…', 'جارٍ المعالجة…') : `${t('Uploading…', 'جارٍ الرفع…')} ${m.upload_progress || 0}%`}</span>
              <button type="button" className="msg-undo-btn" onClick={() => onCancelUpload(m.id)} title={t('Cancel sending', 'إلغاء الإرسال')}>
                <Icon name="x" size={11} /> {t('Cancel', 'إلغاء')}
              </button>
            </>
          ) : m.failed ? (
            <span className="msg-upload-failed">
              {m.upload_error || t('Upload failed.', 'فشل الرفع.')}{' '}
              <button type="button" className="msg-link-btn" onClick={() => onRetryUpload(m.id)}>{t('Retry', 'إعادة المحاولة')}</button>
              {' · '}
              <button type="button" className="msg-link-btn" onClick={() => onDiscardUpload(m.id)}>{t('Remove', 'إزالة')}</button>
            </span>
          ) : (
            <span>
              {fmtTime(m.created_at)}
              {m.is_edited ? <span className="msg-edited-tag">{t('(edited)', '(معدّلة)')}</span> : null}
            </span>
          )}
          {m.is_mine && !m.pending && !m.failed && !isEditing && !m.is_tmp && !savedChat && <Ticks status={m.receipt_status || 'sent'} />}
          {m.is_mine && !m.pending && !m.failed && !isEditing && <SentActions m={m} onUndo={onUndoSend} onDelete={onDelete} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Small button next to every message I sent. For the first UNDO_WINDOW_S seconds it is "Cancel" (a live countdown) and
 * the message disappears for everyone with no trace; after that it becomes "Delete" (delete for everyone / for me).
 */
function SentActions({ m, onUndo, onDelete }) {
  const t = useT();
  const sentAt = sentAtOf(m);
  const secsLeft = () => (sentAt ? Math.max(0, UNDO_WINDOW_S - Math.floor((Date.now() - sentAt) / 1000)) : 0);
  const [secs, setSecs] = useState(secsLeft);
  const [menu, setMenu] = useState(false);
  const btnRef = useRef(null);
  const active = secs > 0;
  useEffect(() => {
    if (!active) return undefined;
    const h = setInterval(() => setSecs(secsLeft()), 1000);
    return () => clearInterval(h);
  }, [active, sentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (active) {
    return (
      <button type="button" className="msg-undo-btn" onClick={() => onUndo(m.id)} title={t('Cancel sending — the message disappears for everyone', 'إلغاء الإرسال — الرسالة بتختفي عند الجميع')}>
        <Icon name="x" size={11} /> {t('Cancel', 'إلغاء')} <span className="msg-undo-btn__n">{secs}</span>
      </button>
    );
  }
  const canAll = !sentAt || Date.now() - sentAt < DELETE_ALL_WINDOW_MIN * 60000;
  return (
    <>
      <button type="button" ref={btnRef} className="msg-undo-btn msg-undo-btn--del" onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu}>
        <Icon name="trash" size={11} /> {t('Delete', 'حذف')}
      </button>
      {menu && (
        <FloatingPanel anchorRef={btnRef} className="msg-menu__panel is-open" onClose={() => setMenu(false)}>
          {canAll && (
            <button type="button" className="msg-menu__item msg-menu__item--danger" onClick={() => { onDelete(m.id, 'for-everyone'); setMenu(false); }}>
              <Icon name="trash" size={15} /> {t('Delete for everyone', 'حذف للجميع')}
            </button>
          )}
          <button type="button" className="msg-menu__item" onClick={() => { onDelete(m.id, 'for-me'); setMenu(false); }}>
            <Icon name="eye-off" size={15} /> {t('Delete for me', 'حذف عندي')}
          </button>
        </FloatingPanel>
      )}
    </>
  );
}

/** Circular progress ring shown over an attachment while it uploads. */
function UploadRing({ pct }) {
  const t = useT();
  const r = 24;
  const c = 2 * Math.PI * r;
  const processing = pct >= 100; // bytes are all sent, server is still working
  return (
    <div className="msg-upload-overlay" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('Uploading', 'جارٍ الرفع')}>
      <div className={`msg-upload-ring${processing ? ' is-processing' : ''}`}>
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle className="track" cx="28" cy="28" r={r} />
          <circle className="bar" cx="28" cy="28" r={r} strokeDasharray={c} strokeDashoffset={processing ? c * 0.75 : c * (1 - pct / 100)} />
        </svg>
        <span>{processing ? '…' : `${pct}%`}</span>
      </div>
    </div>
  );
}

/** Local (not-yet-uploaded) attachments: previews from the picked files. */
function PendingAttachments({ attachments, pct, uploading }) {
  return (
    <div className={`msg-upload-wrap${uploading ? ' is-uploading' : ''}`}>
      <div className="msg-attachments">
        {attachments.map((a, i) => {
          if (a.kind === 'image') {
            return (
              <div className="msg-attach-image-grid single" key={i}>
                <img src={a.url} alt={a.original_name} />
              </div>
            );
          }
          if (a.kind === 'video' && !isVoiceAttachment(a)) {
            return (
              <div className="msg-attach-video msg-attach-video--tile" key={i}>
                <VideoFace src={a.url} />
              </div>
            );
          }
          if (isVoiceAttachment(a)) {
            return (
              <div className="msg-voice" key={i}>
                <VoiceMessage src={a.url} disabled={!!uploading} />
              </div>
            );
          }
          return (
            <div className="msg-attach-file" key={i}>
              <span className="msg-attach-file__icon"><Icon name="file" size={16} /></span>
              <span className="msg-attach-file__meta">
                <span className="msg-attach-file__name">{a.original_name}</span>
                <span className="msg-attach-file__size">{fmtBytes(a.size_bytes)}</span>
              </span>
            </div>
          );
        })}
      </div>
      {uploading && <UploadRing pct={pct} />}
    </div>
  );
}

/**
 * The picture of a video in a chat bubble. Takes the real aspect ratio of the clip (a fixed 4:3 box with object-fit: cover
 * cropped portrait phone videos into an unreadable zoomed-in slice) and nudges the player to paint a first frame, which
 * Android's WebView does not do on its own for preload="metadata".
 */
// 1x1 transparent GIF: with no poster the Android WebView paints ITS OWN placeholder (a grey picture with a black ring and a play
// triangle) until a frame is decoded - that is the "video sign instead of the video picture" people saw. A transparent poster hides it.
const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function VideoFace({ src, poster }) {
  const [ratio, setRatio] = useState(null);
  const [shot, setShot] = useState(null);   // first frame, drawn to a canvas (only possible for same-origin / local files)
  const grab = (v) => {
    if (poster || shot || !v.videoWidth || !v.videoHeight) return;
    try {
      const k = Math.min(1, 480 / v.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.72);
      if (url.length > 2000) setShot(url);
    } catch { /* cross-origin video: the canvas is tainted, the server thumbnail / first-frame nudge is all we have */ }
  };
  const onMeta = (e) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
    try { if (!poster && v.currentTime === 0) v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { /* not seekable yet */ }
  };
  return (
    <video
      src={src}
      poster={poster || shot || BLANK_POSTER}
      preload="metadata"
      muted
      playsInline
      tabIndex={-1}
      onLoadedMetadata={onMeta}
      onSeeked={(e) => grab(e.currentTarget)}
      onLoadedData={(e) => grab(e.currentTarget)}
      data-ratio={ratio ? (ratio < 0.9 ? 'portrait' : ratio > 1.2 ? 'landscape' : 'square') : undefined}
      style={ratio ? { aspectRatio: String(Math.min(2, Math.max(0.5, ratio))) } : undefined}
    />
  );
}

/** Recent messages download their videos by themselves (old history never floods the phone). */
function isRecentMessage(m) {
  const at = m && m.created_at ? parseServerDate(m.created_at).getTime() : 0;
  return !!at && Date.now() - at < 3 * 86400000 && isAutoSaveOn();
}

/**
 * Video attachment: tile that turns into an in-place player on tap.
 * In the app the clip is downloaded once into the phone (src/lib/mediaCache.js) and then plays / paints its thumbnail from
 * that local file: instant start, no re-download. While it is still coming down the tile shows a progress ring and a tap
 * plays the stream right away, so nobody waits.
 */
/** <img> for a chat file: protected files are fetched with the Bearer token and shown from a blob: URL. */
function ProtectedImg({ url, alt, ...rest }) {
  const { src } = useProtectedSrc(url);
  return <img src={src || BLANK_POSTER} alt={alt} {...rest} />;
}

/** Voice note: the audio is fetched with the token (small), then handed to the player as a blob: URL. */
function ProtectedVoice({ attachment: a }) {
  const t = useT();
  const { src, error } = useProtectedSrc(a.url);
  if (!src) {
    return <span className="msg-voice__loading" style={{ fontSize: 12, opacity: 0.7 }}>{error ? t('Could not load the voice note', 'تعذّر تحميل الرسالة الصوتية') : '…'}</span>;
  }
  return <VoiceMessage src={src} duration={a.duration_seconds} name={a.original_name} />;
}

function InlineVideo({ attachment, url, thumbUrl, name, duration, auto }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const cache = useCachedVideo(attachment, { auto });
  const { src: poster } = useProtectedSrc(thumbUrl);
  // A <video> cannot send the token: it plays from a short-lived signed link, requested only when it is needed
  // (on play, or for the first-frame preview when the server made no thumbnail).
  const signed = useSignedMediaUrl(url, { enabled: playing || (!thumbUrl && !isNative) });
  const src = cache.src || signed.src;
  if (playing) {
    return (
      <div className="msg-attach-video msg-attach-video--inline">
        {src
          ? <VideoPlayer src={src} poster={poster || undefined} autoPlay />
          : <span style={{ display: 'block', padding: 16, fontSize: 13 }}>{signed.error ? t('Could not load the video', 'تعذّر تحميل الفيديو') : t('Loading…', 'جارٍ التحميل…')}</span>}
      </div>
    );
  }
  const busy = cache.state === 'queued' || cache.state === 'downloading';
  const canDownload = cache.state === 'remote' && !cache.src && canCacheNatively();
  const onTap = () => { if (cache.state === 'remote') cache.start(); setPlaying(true); };
  return (
    <button
      type="button"
      className="msg-attach-video msg-attach-video--tile"
      onClick={onTap}
      aria-label={`${t('Play video', 'تشغيل الفيديو')} ${name || ''}`}
    >
      {/* once the local copy exists the first frame is painted from it; before that the server poster (or the dark tile) shows */}
      {cache.src || !isNative ? <VideoFace src={src} poster={poster || undefined} /> : (poster ? <img className="msg-attach-video__poster" src={poster} alt="" /> : <span className="msg-attach-video__blank" />)}
      {busy ? (
        <span className="msg-attach-video__play msg-attach-video__play--busy" aria-hidden="true">
          <svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" /><circle cx="26" cy="26" r="22" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(cache.pct / 100) * 138.2} 138.2`} transform="rotate(-90 26 26)" /></svg>
        </span>
      ) : canDownload ? (
        <span className="msg-attach-video__play" aria-hidden="true"><Icon name="download" size={22} /></span>
      ) : (
        <span className="msg-attach-video__play" aria-hidden="true"><Icon name="play" size={22} /></span>
      )}
      {duration ? <span className="msg-attach-video__duration">{fmtDuration(duration)}</span> : null}
      {attachment && attachment.size_bytes && !cache.src ? <span className="msg-attach-video__size">{fmtBytes(attachment.size_bytes)}</span> : null}
    </button>
  );
}

function MessageAttachments({ attachments, onOpenLightbox, onOpenVideo, autoCache, mine, ar }) {
  const t = useT();
  const protectedMedia = attachments.filter((a) => a.view_mode);
  attachments = attachments.filter((a) => !a.view_mode);
  const images = attachments.filter((a) => a.kind === 'image');
  const others = attachments.filter((a) => a.kind !== 'image');
  // Tapping an image enlarges it in place inside the bubble (tap again to shrink).
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (i) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className="msg-attachments">
      {protectedMedia.map((a, i) => <ViewOnceMedia key={a.id ?? `vo${i}`} attachment={a} mine={mine} ar={ar} />)}
      {images.length > 0 && (
        <div className={`msg-attach-image-grid${images.length === 1 ? ' single' : ''}${expanded.size ? ' has-expanded' : ''}`}>
          {images.map((a, i) => (
            <span key={i} className={`msg-attach-img${expanded.has(i) ? ' is-expanded' : ''}`}>
              <ProtectedImg
                url={a.url}
                alt={a.original_name}
                onClick={() => toggle(i)}
                style={{ cursor: expanded.has(i) ? 'zoom-out' : 'zoom-in' }}
              />
              <button
                type="button"
                className="msg-attach-img__full"
                title={t('Open full screen', 'فتح بملء الشاشة')}
                aria-label={t('Open full screen', 'فتح بملء الشاشة')}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox(a.url);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      {others.map((a, i) => {
        if (a.kind === 'video' && !isVoiceAttachment(a)) {
          // Compact tile in the bubble; tapping it plays the video right
          // here inside the conversation (native controls incl. fullscreen).
          return <InlineVideo key={a.id ?? i} attachment={a} url={a.url} thumbUrl={a.thumbnail_url} name={a.original_name} duration={a.duration_seconds} auto={autoCache} />;
        }
        if (isVoiceAttachment(a)) {
          return (
            <div className="msg-voice" key={i}>
              <ProtectedVoice attachment={a} />
            </div>
          );
        }
        return <ChatFile key={a.id ?? i} attachment={a} fmtBytes={fmtBytes} />;
      })}
    </div>
  );
}

export default function ThreadPanel({
  conversation,
  others,
  messages,
  hasMoreOlder,
  onLoadOlder,
  pinnedCount,
  onShowPinned,
  infoOpen,
  presenceText,
  replyTarget,
  onSetReply,
  onCancelReply,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  onReplaceFile,
  onToggleDenoise,
  onSend,
  onEditMessage,
  onDeleteMessage,
  onReact,
  onPin,
  onVote,
  onStopLive,
  onSendLocation,
  onStartLiveLocation,
  typingUsers,
  onOpenInfo,
  onBack,
  onOpenLightbox,
  onOpenVideo,
  onNotifyTyping,
  onForwardMessage,
  selectMode = false,
  selectedIds = [],
  onStartSelect,
  onToggleSelect,
  onExitSelect,
  onForwardSelected,
  onDeleteSelected,
  onReportMessage,
  onUnblockUser,
  onOpenPollModal,
  onSendVoice,
  onRetryUpload,
  onDiscardUpload,
  onCancelUpload,
  onUndoSend,
  railCollapsed,
  onToggleRail,
  fullView,
  onToggleFull,
  enterToSend = true,
  onError,
  myUserId,
}) {
  const [text, setText] = useState('');
  const call = useCall(); // before the `if (!conversation)` early return below (hook order)
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [groupCallBusy, setGroupCallBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState('00:00');
  const [noiseCancel, setNoiseCancel] = useState(() => { try { return localStorage.getItem('uip_voice_nc') !== '0'; } catch { return true; } });
  // fetch the noise-cancelling network ahead of time so the first words of a voice note are cleaned too
  useEffect(() => { if (noiseCancel && LIVE_PROCESSING) warmRnnoise(); }, [noiseCancel]);
  const voiceEngineRef = useRef(null);
  const waveCanvasRef = useRef(null);
  const [editIdx, setEditIdx] = useState(null); // index into pendingFiles being previewed/edited
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const t = (en, arText) => (ar ? arText : en);
  const fileInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const prevMessageCount = useRef(0);
  const emojiWrapRef = useRef(null);
  const emojiPopoverRef = useRef(null);
  const mediaInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);

  // One thing plays at a time: starting any video / voice message pauses the
  // others. `play` doesn't bubble, so listen in the capture phase.
  useEffect(() => {
    const onPlay = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLMediaElement)) return;
      // Live call media (the other person's voice + video tiles) is never part of "one thing at a time": a call's <video>
      // starting used to pause the call's own <audio>, which is why video calls had no sound.
      if (el.hasAttribute('data-persist-media')) return;
      document.querySelectorAll('video, audio').forEach((m) => {
        if (m !== el && !m.paused && !m.hasAttribute('data-persist-media')) m.pause();
      });
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, []);

  // Close the emoji popover on an outside click, and on Escape — without
  // this the only way to close it was toggling the same toolbar button
  // again, which is easy to miss (e.g. after sending a message the
  // popover just stays open with no obvious way out).
  useEffect(() => {
    if (!showEmoji) return;
    const onPointerDown = (e) => {
      if (
        !emojiWrapRef.current?.contains(e.target) &&
        !emojiPopoverRef.current?.contains(e.target)
      ) {
        setShowEmoji(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowEmoji(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showEmoji]);

  // Is the reader at (or near) the bottom? Tracked from real scroll events: measuring it AFTER a new message was rendered
  // (as before) always said "no" for tall messages (photos, videos), so the chat never followed them down.
  const stickRef = useRef(true);
  const prevLastId = useRef(null);
  const toBottom = () => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  };
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return undefined;
    stickRef.current = true;
    const onScroll = () => {
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      stickRef.current = near;
      setShowJump(box.scrollHeight - box.scrollTop - box.clientHeight > 320);
      if (near) setUnseen(0);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    // photos / videos / link previews grow after they are inserted: keep following while the reader is at the bottom
    const inner = box.querySelector('[data-messages]');
    const ro = typeof ResizeObserver !== 'undefined' && inner ? new ResizeObserver(() => { if (stickRef.current) toBottom(); }) : null;
    ro?.observe(inner);
    return () => { box.removeEventListener('scroll', onScroll); ro?.disconnect(); };
  }, [conversation?.id]);

  useEffect(() => {
    const last = messages.length ? messages[messages.length - 1] : null;
    const lastId = last ? last.id : null;
    const appended = lastId !== prevLastId.current; // a new message at the END (not older ones prepended on top)
    if (last && (prevMessageCount.current === 0 || (appended && (stickRef.current || last.is_mine)))) {
      stickRef.current = true;
      toBottom();
      requestAnimationFrame(toBottom);
      setTimeout(toBottom, 250);
    }
    if (last && prevMessageCount.current > 0 && appended && !stickRef.current && !last.is_mine) setUnseen((n) => n + 1);
    prevMessageCount.current = messages.length;
    prevLastId.current = lastId;
  }, [messages]);

  // Stop any in-progress recording if the thread unmounts / switches.
  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      voiceEngineRef.current?.stop();
    };
  }, [conversation]);

  if (!conversation) {
    return (
      <section className="msg-thread" data-thread-panel>
        <div className="msg-thread__empty" data-thread-empty>
          <div className="msg-thread__empty-icon">
            <Icon name="message" size={32} />
          </div>
          <p>{t('Select a conversation to start messaging', 'اختر محادثة لبدء المراسلة')}</p>
        </div>
      </section>
    );
  }

  // Every way of attaching (clip button, paste, drag & drop) goes through here.
  // A single image/video opens the editor straight away so it can be previewed,
  // cropped / drawn on / trimmed before it is sent.
  // WhatsApp-style group rules (closed group, restricted member, allowed message types). Admins/owner get everything.
  const grp = conversation?.is_group ? conversation : null;
  const peerDeleted = !!conversation && !conversation.is_group && (conversation.peer_deleted || others[0]?.is_deleted);
  // Direct chat where one side blocked the other: 'blocked_by_me' (can unblock here) / 'blocked_by_peer' (generic notice).
  const dmBlock = conversation && !conversation.is_group && (conversation.send_block === 'blocked_by_me' || conversation.send_block === 'blocked_by_peer') ? conversation.send_block : null;
  const canSend = peerDeleted || dmBlock ? false : (!grp || grp.can_send !== false);
  // Voice calls: direct chats only, and not with a deleted account or when either side blocked the other.
  const canCall = !!conversation && !conversation.is_group && !conversation.is_saved && !peerDeleted && !dmBlock && call.available;
  const callBusy = call.phase !== 'idle';
  const startCall = (video) => {
    if (!canCall || callBusy) return;
    call.startCall(conversation.id, { id: conversation.peer_id || others[0]?.id || null, name: peerLabel(conversation), avatar: peerDeleted ? null : others[0]?.avatar_path }, { video: video === true && !!call.videoEnabled });
  };
  const callBack = canCall && !callBusy ? startCall : undefined;
  // Group voice / video calls ride on the meetings system: an instant meeting (no waiting room, no guests) is created for the
  // group, every member is invited, a "join" card is posted in the chat, and the starter goes straight into the room.
  const canGroupCall = !!conversation && !!conversation.is_group && others.length > 0 && canSend;
  const startGroupCall = async (video) => {
    if (!canGroupCall || groupCallBusy || callBusy) return;
    setGroupCallBusy(true);
    try {
      const title = peerLabel(conversation);
      const created = await api.post('/api/v1/meetings', {
        title,
        type: 'instant',
        waiting_room_enabled: false,
        allow_guests: false,
        settings: { camera_on_entry: video === true, mute_on_entry: false },
      });
      const meeting = created.data;
      await api.post(`/api/v1/meetings/${meeting.uuid}/start`);
      const memberIds = others.map((o) => o.id).filter(Boolean);
      if (memberIds.length) {
        // best effort: members who can't be invited (other university, deleted...) can still use the link in the chat
        try { await api.post(`/api/v1/meetings/${meeting.uuid}/invitations/bulk`, { targets: [{ type: 'users', user_ids: memberIds }], message: title }); } catch { /* ignore */ }
      }
      const joinToken = meeting.join_url ? String(meeting.join_url).split('/').filter(Boolean).pop() : null;
      if (joinToken) {
        const head = video ? t('📹 Group video call', '📹 مكالمة فيديو جماعية') : t('📞 Group voice call', '📞 مكالمة صوتية جماعية');
        try { await onSend(`${head}\n${publicOrigin()}/join/${joinToken}`); } catch { /* the call still starts */ }
      }
      navigate(`/${portalPrefix(authUser?.role)}/meetings/${meeting.uuid}/room`);
    } catch (err) {
      if (onError) onError(errorMessage(err));
    } finally {
      setGroupCallBusy(false);
    }
  };
  const allowedTypes = grp && Array.isArray(grp.allowed_types) ? grp.allowed_types : null;
  const typeOk = (k) => !allowedTypes || allowedTypes.includes(k);
  const canAttach = typeOk('image') || typeOk('video') || typeOk('file');
  const blockedNotice = (kinds) => {
    const names = [...new Set(kinds)].map(typeLabel).join(ar ? '، ' : ', ');
    onError?.(new Error(t(`This group does not allow: ${names}`, `هذه المجموعة لا تسمح بـ: ${names}`)));
  };

  const insertEmoji = (emoji) => {
    const el = composerInputRef.current;
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : text.length;
    setText((cur) => cur.slice(0, start) + emoji + cur.slice(end));
    requestAnimationFrame(() => { if (el) { el.focus(); const pos = start + emoji.length; el.setSelectionRange(pos, pos); } });
    onNotifyTyping?.();
  };

  const sendLocation = () => setShowLocation(true);

  const handleFiles = (list) => {
    if (!canSend) return;
    const incoming = Array.from(list || []);
    const blocked = incoming.filter((f) => !typeOk(fileKind(f)));
    if (blocked.length) blockedNotice(blocked.map(fileKind));
    const arr = incoming.filter((f) => typeOk(fileKind(f)));
    if (!arr.length) return;
    onAddFiles(arr);
    if (arr.length === 1 && isEditableMedia(arr[0])) setEditIdx(pendingFiles.length);
  };

  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => {
    if (hasFiles(e)) e.preventDefault();
  };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };
  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (!files.length) return; // plain text paste: leave to the browser
    e.preventDefault();
    handleFiles(files);
  };

  const editPf = editIdx != null ? pendingFiles[editIdx] : null;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    if (!canSend) return;
    if (trimmed && !typeOk('text')) {
      blockedNotice(['text']);
      return;
    }
    onSend(trimmed);
    setText('');
    setShowEmoji(false);
  };

  // ------------------------------------------------------- bold/markdown
  // Ported from wrapSelection() in messaging.js, adapted for a plain
  // <textarea> composer (the original wrapped a contenteditable div's
  // live browser selection via document.execCommand("insertText", ...)).
  // Same net effect: wrap the current selection in `marker`, or insert
  // an empty `marker+marker` pair with the cursor left in the middle
  // when nothing is selected — renderBody() in format.jsx already turns
  // **text** into <strong>.
  const wrapSelection = (marker) => {
    const el = composerInputRef.current;
    const start = el ? el.selectionStart ?? text.length : text.length;
    const end = el ? el.selectionEnd ?? text.length : text.length;
    const selected = text.slice(start, end);
    const next = text.slice(0, start) + marker + selected + marker + text.slice(end);
    setText(next);
    const cursor = start + marker.length + selected.length + (selected ? marker.length : 0);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  };

  // ------------------------------------------------------- voice recording
  // Ported from startRecording()/stopRecording() in messaging.js.
  const startRecording = () => {
    if (!canSend || !typeOk('audio')) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError?.(new Error(t('Voice messages need microphone access, which this browser cannot provide here.', 'الرسائل الصوتية تحتاج إلى الوصول للميكروفون، وهذا المتصفح لا يوفّره هنا.')));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: voiceConstraints(noiseCancel) })
      .then((stream) => {
        recordingStreamRef.current = stream;
        // Explicit codec + a fixed voice bitrate: the browser default can pick a heavy/odd encoding that stutters on playback.
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
          .find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
        // meter + (optional) noise cancelling sit between the mic and the recorder
        const engine = createVoiceEngine(stream, { noiseCancel, getCanvas: () => waveCanvasRef.current });
        voiceEngineRef.current = engine;
        const recStream = engine.recordStream;
        const recorder = mime ? new MediaRecorder(recStream, { mimeType: mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(recStream);
        recordingChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size) recordingChunksRef.current.push(e.data);
        };
        recorder.start(500); // timeslice: chunks are flushed steadily instead of one big buffer at the very end
        mediaRecorderRef.current = recorder;
        recordingStartRef.current = Date.now();
        setIsRecording(true);
        setRecordingTime('00:00');
        recordingTimerRef.current = setInterval(() => {
          setRecordingTime(fmtClock((Date.now() - recordingStartRef.current) / 1000));
        }, 1000);
      })
      .catch(() => {
        onError?.(new Error(t('Microphone permission was denied.', 'تم رفض إذن الميكروفون.')));
      });
  };

  const stopRecording = (send) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    recorder.onstop = () => {
      recordingStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      voiceEngineRef.current?.stop();
      voiceEngineRef.current = null;
      if (!send) return;
      const base = String(recorder.mimeType || 'audio/webm').split(';')[0]; // real container (Safari records mp4, not webm)
      const ext = base.includes('ogg') ? 'ogg' : base.includes('mp4') ? 'm4a' : 'webm';
      const blob = new Blob(recordingChunksRef.current, { type: base });
      if (blob.size < 300) {
        onError?.(new Error(t('Recording was too short.', 'التسجيل قصير جدًا.')));
        return;
      }
      const file = new File([blob], `voice-message-${Date.now()}.${ext}`, { type: base });
      onSendVoice(file);
    };
    recorder.stop();
  };

  let lastDay = null;
  let lastSenderId = null;
  let lastTs = 0;

  return (
    <section className="msg-thread" data-thread-panel>
      <div
        className="msg-thread__active"
        data-thread-active
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="msg-dropzone" aria-hidden="true">
            <div>{ar ? 'أفلت الملفات هنا لإرسالها' : 'Drop files here to send them'}</div>
          </div>
        )}
        {selectMode && (
          <div className="msg-select-bar" role="toolbar">
            <button type="button" className="msg-icon-btn" onClick={onExitSelect} aria-label={t('Cancel selection', 'إلغاء التحديد')}>
              <Icon name="x" size={20} />
            </button>
            <strong className="msg-select-bar__count">{t(`${selectedIds.length} selected`, `${selectedIds.length} محدد`)}</strong>
            <span style={{ flex: 1 }} />
            <button type="button" className="msg-icon-btn" onClick={() => {
              const txt = messages.filter((x) => selectedIds.includes(x.id)).map(copyableText).filter(Boolean).join('\n');
              if (txt) copyToClipboard(txt);
              onExitSelect();
            }} aria-label={t('Copy', 'نسخ')} title={t('Copy', 'نسخ')}>
              <Icon name="copy" size={19} />
            </button>
            <button type="button" className="msg-icon-btn" onClick={onForwardSelected} aria-label={t('Forward', 'إعادة توجيه')} title={t('Forward', 'إعادة توجيه')}>
              <MsgIcon name="forward" size={19} />
            </button>
            <button type="button" className="msg-icon-btn msg-select-bar__danger" onClick={onDeleteSelected} aria-label={t('Delete', 'حذف')} title={t('Delete', 'حذف')}>
              <Icon name="trash" size={19} />
            </button>
          </div>
        )}
        <header className="msg-thread__header">
          <button type="button" className="msg-icon-btn msg-thread__back" onClick={onBack} aria-label={t('Back to conversations', 'العودة إلى المحادثات')}>
            <Icon name="arrow-left" size={20} />
          </button>
          {onToggleRail && (
            <button
              type="button"
              className="msg-icon-btn msg-panel-btn msg-rail-toggle"
              onClick={onToggleRail}
              title={railCollapsed ? t('Show conversation list', 'إظهار قائمة المحادثات') : t('Hide conversation list', 'إخفاء قائمة المحادثات')}
              aria-label={railCollapsed ? t('Show conversation list', 'إظهار قائمة المحادثات') : t('Hide conversation list', 'إخفاء قائمة المحادثات')}
              aria-pressed={!railCollapsed}
            >
              <PanelIcon filled={!railCollapsed} />
            </button>
          )}
          <div className="msg-thread__peer" data-action="open-info" onClick={onOpenInfo} style={{ cursor: 'pointer' }}>
            <Avatar name={peerLabel(conversation)} isGroup={conversation.is_group} saved={conversation.is_saved} src={conversation.is_group ? conversation.avatar_path : (peerDeleted ? null : others[0]?.avatar_path)} />
            <div className="msg-thread__peer-meta">
              <strong>
                <span className="msg-thread__name">{peerLabel(conversation)}</span>
                {peerDeleted
                  ? <span className="msg-thread__deleted">{t('Deleted account', 'حساب محذوف')}</span>
                  : (!conversation.is_group && !conversation.is_saved && others[0]?.account_role && <span className="msg-thread__role">{roleLabel(others[0].account_role)}</span>)}
              </strong>
              <span className="msg-thread__status">
                {conversation.is_saved ? t('Only you can see this chat', 'أنت فقط تشاهد هذه المحادثة') : conversation.is_group ? `${others.length + 1} ${t('members', 'أعضاء')}` : (peerDeleted ? t('This account no longer exists', 'هذا الحساب لم يعد موجودًا') : presenceText)}
              </span>
            </div>
          </div>
          <div className="msg-thread__header-actions">
            {onToggleFull && <button type="button" className="msg-icon-btn msg-full-btn" title={fullView ? t('Exit full screen', 'الخروج من ملء الشاشة') : t('Full screen', 'ملء الشاشة')} aria-label={fullView ? t('Exit full screen', 'الخروج من ملء الشاشة') : t('Full screen', 'ملء الشاشة')} aria-pressed={!!fullView} onClick={onToggleFull}>
            <Icon name={fullView ? 'collapse' : 'maximize'} size={18} />
          </button>}
            {canCall && (
              <button type="button" className="msg-icon-btn msg-call-btn" onClick={() => startCall(false)} disabled={callBusy}
                title={callBusy ? t('You are already in a call', 'أنت في مكالمة بالفعل') : t('Voice call', 'مكالمة صوتية')}
                aria-label={t('Voice call', 'مكالمة صوتية')}>
                <Icon name="phone" size={18} />
              </button>
            )}
            {canCall && call.videoEnabled && (
              <button type="button" className="msg-icon-btn msg-call-btn" onClick={() => startCall(true)} disabled={callBusy}
                title={callBusy ? t('You are already in a call', 'أنت في مكالمة بالفعل') : t('Video call', 'مكالمة فيديو')}
                aria-label={t('Video call', 'مكالمة فيديو')}>
                <Icon name="video" size={18} />
              </button>
            )}
            {canGroupCall && (
              <button type="button" className="msg-icon-btn msg-call-btn" onClick={() => startGroupCall(false)} disabled={callBusy || groupCallBusy}
                title={callBusy ? t('You are already in a call', 'أنت في مكالمة بالفعل') : t('Group voice call', 'مكالمة صوتية جماعية')}
                aria-label={t('Group voice call', 'مكالمة صوتية جماعية')}>
                <Icon name="phone" size={18} />
              </button>
            )}
            {canGroupCall && (
              <button type="button" className="msg-icon-btn msg-call-btn" onClick={() => startGroupCall(true)} disabled={callBusy || groupCallBusy}
                title={callBusy ? t('You are already in a call', 'أنت في مكالمة بالفعل') : t('Group video call', 'مكالمة فيديو جماعية')}
                aria-label={t('Group video call', 'مكالمة فيديو جماعية')}>
                <Icon name="video" size={18} />
              </button>
            )}
            <button type="button" className="msg-icon-btn" title={t('Pinned messages', 'الرسائل المثبّتة')} aria-label={t('Pinned messages', 'الرسائل المثبّتة')} onClick={onShowPinned}>
              <Icon name="pin" size={18} />
            </button>
            <button
              type="button"
              className="msg-icon-btn msg-panel-btn msg-info-toggle"
              title={infoOpen ? t('Hide details', 'إخفاء التفاصيل') : t('Show details', 'إظهار التفاصيل')}
              aria-label={infoOpen ? t('Hide details', 'إخفاء التفاصيل') : t('Show details', 'إظهار التفاصيل')}
              aria-pressed={!!infoOpen}
              onClick={onOpenInfo}
            >
              <PanelIcon filled={!!infoOpen} />
            </button>
          </div>
        </header>

        {pinnedCount > 0 && (
          <div className="msg-thread__pinned-bar" onClick={onShowPinned} style={{ cursor: 'pointer' }}>
            <MsgIcon name="pin" size={14} /> <strong>{pinnedCount}</strong> {pinnedCount > 1 ? t('pinned messages', 'رسائل مثبّتة') : t('pinned message', 'رسالة مثبّتة')}
            <button type="button" className="msg-icon-btn msg-icon-btn--sm" style={{ marginInlineStart: 'auto' }}>{t('View', 'عرض')}</button>
          </div>
        )}

        <div className="msg-thread__scroll" data-message-list ref={scrollRef}>
          {hasMoreOlder && (
            <button type="button" className="msg-load-older" onClick={onLoadOlder}>{t('Load older messages', 'تحميل رسائل أقدم')}</button>
          )}
          <div className="msg-messages" data-messages>
            {messages.length === 0 ? (
              <div className="msg-empty-state">{t('No messages yet — say hello!', 'لا توجد رسائل بعد — ابدأ بالسلام!')}</div>
            ) : (
              messages.map((m) => {
                const day = m.created_at ? m.created_at.slice(0, 10) : '';
                const nodes = [];
                if (day !== lastDay) {
                  nodes.push(
                    <div className="msg-day-sep" key={`day-${day}-${m.id}`}>
                      <span>{fmtDayLabel(m.created_at)}</span>
                    </div>
                  );
                  lastDay = day;
                  lastSenderId = null;
                }
                const ts = m.created_at ? parseServerDate(m.created_at).getTime() : 0;
                if (m.message_type === 'system') {
                  nodes.push(<MessageBubble key={m.id} m={m} myUserId={myUserId} />);
                  lastSenderId = null;
                  return nodes;
                }
                const showAvatar = m.sender_id !== lastSenderId || ts - lastTs > 5 * 60000;
                lastSenderId = m.sender_id;
                lastTs = ts;
                nodes.push(
                  <MessageBubble
                    key={m.id}
                    m={m}
                    myUserId={myUserId}
                    showAvatar={showAvatar}
                    onRetryUpload={onRetryUpload}
                    onDiscardUpload={onDiscardUpload}
                    onCancelUpload={onCancelUpload}
                    onUndoSend={onUndoSend}
                    others={others}
                    onReply={onSetReply}
                    onCallBack={callBack}
                    onDelete={onDeleteMessage}
                    onReact={onReact}
                    onPin={onPin}
                    onVote={onVote}
                    onStopLive={onStopLive}
                    onOpenLightbox={onOpenLightbox}
                    onOpenVideo={onOpenVideo}
                    onForward={onForwardMessage}
                    onReport={onReportMessage}
                    savedChat={!!conversation?.is_saved}
                    selectMode={selectMode}
                    selected={selectedIds.includes(m.id)}
                    onToggleSelect={onToggleSelect}
                    onStartSelect={onStartSelect}
                    editingId={editingId}
                    onStartEdit={setEditingId}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={(id, body) => {
                      onEditMessage(id, body);
                      setEditingId(null);
                    }}
                  />
                );
                return nodes;
              })
            )}
          </div>
          {typingUsers.length > 0 && (
            <div className="msg-typing">
              <span className="msg-typing-dots"><span /><span /><span /></span>{' '}
              {typingUsers.map((u) => u.full_name).join(', ')} {t('typing…', 'يكتب…')}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {showJump && (
          <button type="button" className="msg-jump-btn" onClick={() => { stickRef.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); setUnseen(0); }}
            aria-label={t('Scroll to latest message', 'النزول لآخر رسالة')}>
            {unseen > 0 && <span className="msg-jump-btn__count">{unseen > 99 ? '99+' : unseen}</span>}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}

        {replyTarget && (
          <div className="msg-reply-preview">
            <div className="msg-reply-preview__body">
              <strong>{t('Replying to', 'الرد على')} {replyTarget.sender_name}</strong>
              <span>{replyTarget.body || t('(attachment)', '(مرفق)')}</span>
            </div>
            <button type="button" className="msg-icon-btn msg-icon-btn--sm" onClick={onCancelReply}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="msg-upload-preview msg-upload-preview--rich">
            {pendingFiles.map((pf, i) => {
              const type = pf.file.type || '';
              const editable = isEditableMedia(pf.file);
              const isVid = type.startsWith('video/');
              const canDenoise = !!onToggleDenoise && (/^(audio|video)\//.test(type) || /\.(mp3|wav|ogg|opus|m4a|aac|weba|mp4|webm|mov|mkv)$/i.test(pf.file.name));
              return (
                <div className={`msg-upload-item${editable ? ' is-editable' : ''}${canDenoise ? ' has-ns' : ''}`} key={`${pf.file.name}-${pf.file.size}-${i}`}>
                  <button
                    type="button"
                    className="msg-upload-item__open"
                    disabled={!editable && !type.startsWith('image/')}
                    onClick={() => setEditIdx(i)}
                    title={ar ? 'معاينة / تعديل' : 'Preview / edit'}
                    aria-label={ar ? 'معاينة / تعديل' : 'Preview / edit'}
                  >
                    {isVid && pf.previewUrl ? (
                      <>
                        <VideoFace src={pf.previewUrl} />
                        <span className="msg-upload-item__badge" aria-hidden="true"><Icon name="play" size={14} /></span>
                      </>
                    ) : pf.previewUrl ? (
                      <img src={pf.previewUrl} alt="" />
                    ) : (
                      <div className="msg-upload-item__name">{pf.file.name.slice(0, 14)}</div>
                    )}
                  </button>
                  {pf.file.uipView && (
                    <span style={{ position: 'absolute', left: 4, bottom: 4, background: 'rgba(0,0,0,.7)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 11, fontWeight: 700 }} aria-hidden="true">
                      {pf.file.uipView.mode === 'once' ? '①' : `⏱${pf.file.uipView.seconds}`}
                    </span>
                  )}
                  {editable && (
                    <span className="msg-upload-item__edit" aria-hidden="true"><Icon name="edit" size={11} /></span>
                  )}
                  <button type="button" className="msg-upload-item__remove" aria-label={ar ? 'حذف' : 'Remove'} onClick={() => onRemoveFile(i)}>&times;</button>
                  {canDenoise && (
                    <button
                      type="button"
                      className={`msg-upload-item__ns${pf.denoise ? ' is-on' : ''}`}
                      aria-pressed={!!pf.denoise}
                      onClick={() => onToggleDenoise(i)}
                      title={ar ? 'عزل الضوضاء: بيتشال ضجيج الخلفية من الصوت بعد المعالجة' : 'Noise reduction: removes background noise from the audio after it is processed'}
                    >
                      <span className="msg-upload-item__ns-box" aria-hidden="true">{pf.denoise ? '✓' : ''}</span>
                      {ar ? 'عزل الضوضاء' : 'Remove noise'}
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="msg-upload-add" onClick={() => fileInputRef.current?.click()} title={ar ? 'إضافة المزيد' : 'Add more'} aria-label={ar ? 'إضافة المزيد' : 'Add more'}>+</button>
          </div>
        )}

        {peerDeleted ? (
          <div className="grp-locked grp-locked--deleted" role="status">
            <Icon name="lock" size={16} />
            <span>
              <strong>{t('This person deleted their account.', 'هذا الشخص حذف حسابه.')}</strong>{' '}
              {t('You can read this conversation, but you can no longer send messages to them.', 'تقدر تقرأ المحادثة فقط، ولا يمكنك إرسال رسائل إليه بعد الآن.')}
            </span>
          </div>
        ) : dmBlock ? (
          <div className="grp-locked" role="status">
            <Icon name="lock" size={16} />
            <span style={{ flex: 1 }}>
              {dmBlock === 'blocked_by_me'
                ? t('You blocked this person. Unblock them to send messages.', 'لقد حظرت هذا الشخص. ألغِ الحظر لتتمكن من إرسال الرسائل.')
                : t('You cannot send messages in this conversation.', 'لا يمكنك إرسال رسائل في هذه المحادثة.')}
            </span>
            {dmBlock === 'blocked_by_me' && onUnblockUser && conversation.peer_id && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUnblockUser({ id: conversation.peer_id })}>
                {t('Unblock', 'إلغاء الحظر')}
              </button>
            )}
          </div>
        ) : !canSend ? (
          <div className="grp-locked" role="status">
            <Icon name="lock" size={16} />
            <span>
              {grp.send_block === 'restricted'
                ? t('An admin has restricted you from sending messages in this group.', 'قام مشرف بمنعك من إرسال الرسائل في هذه المجموعة.')
                : t('Only admins can send messages in this group.', 'المشرفون فقط يمكنهم الإرسال في هذه المجموعة.')}
            </span>
          </div>
        ) : (
        <form
          className={`msg-composer${isRecording ? ' is-recording' : ''}`}
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <div className="msg-composer__toolbar">
            {(canAttach || typeOk('poll')) && (
              <AttachMenu
                ar={ar}
                title={t('Attach', 'إرفاق')}
                canFiles={typeOk('file')}
                canMedia={typeOk('image') || typeOk('video')}
                canPoll={typeOk('poll') && !!onOpenPollModal}
                canLocation={typeOk('text') && !!onSendLocation}
                onPickFiles={() => fileInputRef.current?.click()}
                onPickMedia={() => mediaInputRef.current?.click()}
                onPickCamera={() => {
                  if (navigator.mediaDevices?.getUserMedia) setShowCamera(true);
                  else cameraInputRef.current?.click();
                }}
                onPoll={onOpenPollModal}
                onLocation={sendLocation}
              />
            )}
            <input type="file" accept="image/*,video/*" multiple hidden ref={mediaInputRef}
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
            {showLocation && (
              <LocationShareModal
                onClose={() => setShowLocation(false)}
                onSendCurrent={async (pos) => { await onSendLocation(pos); setShowLocation(false); }}
                onStartLive={async (pos, minutes) => { await onStartLiveLocation(pos, minutes); setShowLocation(false); }}
              />
            )}
            {showCamera && (
              <CameraCaptureModal ar={ar} allowViewOnce onClose={() => setShowCamera(false)}
                onCapture={(file) => {
                  setShowCamera(false);
                  // Like WhatsApp: "Done" in the camera editor sends it straight away (with the typed caption).
                  if (!canSend || !typeOk(fileKind(file))) { handleFiles([file]); return; }
                  const files = [...pendingFiles.map((p) => p.file), file];
                  const cap = text;
                  setText(''); setShowEmoji(false);
                  onSend(cap, files);
                }} />
            )}
            <input type="file" accept="image/*,video/*" capture="environment" hidden ref={cameraInputRef}
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
            <input
              type="file"
              multiple
              hidden
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="msg-composer__popover-wrap" ref={emojiWrapRef}>
              <button
                type="button"
                className="msg-icon-btn"
                title={t('Emoji', 'إيموجي')} aria-label={t('Emoji', 'إيموجي')}
                onClick={() => setShowEmoji((s) => !s)}
              >
                <MsgIcon name="smile" size={18} />
              </button>
            </div>
            <button type="button" className="msg-icon-btn" title={t('Markdown', 'تنسيق Markdown')} aria-label={t('Markdown', 'تنسيق Markdown')} onClick={() => wrapSelection('**')}>
              <MsgIcon name="bold" size={18} />
            </button>
          </div>
          <div className="msg-composer__input-row">
            <textarea
              className="msg-composer__input"
              data-composer-input
              ref={composerInputRef}
              onPaste={onPaste}
              placeholder={typeOk('text') ? t('Type a message…', 'اكتب رسالة…') : t('Text messages are turned off in this group', 'الرسائل النصية متوقفة في هذه المجموعة')}
              disabled={!typeOk('text')}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onNotifyTyping();
              }}
              onKeyDown={(e) => {
                // Guard against IME composition (Arabic predictive-text /
                // any composed-input keyboard): while a candidate is being
                // composed, the virtual keyboard's "confirm suggestion" key
                // also fires a native Enter keydown. Without this check that
                // was sending the message mid-composition — before the rest
                // of what was typed even landed in the field — which is why
                // sent messages could come through as just one or two
                // characters. e.keyCode === 229 is the classic fallback for
                // browsers that don't set isComposing on the event itself.
                if (e.key === 'Enter' && (enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey)) && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            {showEmoji && (
              <div className="msg-emoji-popover msg-emoji-popover--pro" ref={emojiPopoverRef}>
                <EmojiPicker ar={ar} onClose={() => setShowEmoji(false)} onPick={insertEmoji} />
              </div>
            )}
            {(text.trim() || pendingFiles.length > 0 || !typeOk('audio')) ? (
              <button type="submit" className="msg-send-btn" aria-label={t('Send', 'إرسال')}>
                <MsgIcon name="send" size={18} />
              </button>
            ) : (
              <button
                type="button"
                className={`msg-send-btn msg-send-btn--mic${isRecording ? ' is-recording' : ''}`}
                title={t('Voice message', 'رسالة صوتية')} aria-label={t('Voice message', 'رسالة صوتية')}
                onClick={() => (isRecording ? stopRecording(false) : startRecording())}
              >
                <MsgIcon name="mic" size={18} />
              </button>
            )}
          </div>
          {isRecording && (
            <div className="msg-composer__recording">
              <span className="msg-rec-dot" />
              <span>{recordingTime}</span>
              <canvas className="msg-waveform-live" ref={waveCanvasRef} aria-hidden="true" />
              <button type="button" className={`msg-ns-btn${noiseCancel ? ' is-on' : ''}`} aria-pressed={noiseCancel}
                title={t('Noise cancelling: filters background noise and hum for a cleaner voice', 'عزل الضوضاء: يقلل ضجيج الخلفية والطنين لصوت أنقى')}
                onClick={() => { const v = !noiseCancel; setNoiseCancel(v); try { localStorage.setItem('uip_voice_nc', v ? '1' : '0'); } catch { /* ignore */ } voiceEngineRef.current?.setNoiseCancel(v); }}>
                <MsgIcon name="mic" size={14} /> {t('Noise cancel', 'عزل الضوضاء')}
              </button>
              <button type="button" className="msg-icon-btn" title={t('Cancel recording', 'إلغاء التسجيل')} aria-label={t('Cancel recording', 'إلغاء التسجيل')} onClick={() => stopRecording(false)}>
                <Icon name="x" size={16} />
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => stopRecording(true)}>{t('Send', 'إرسال')}</button>
            </div>
          )}
        </form>
        )}
      </div>

      {editPf && (
        <MediaEditorModal
          key={`${editIdx}-${editPf.file.name}-${editPf.file.size}`}
          file={editPf.file}
          initialCaption={text}
          allowViewOnce
          onCancel={() => setEditIdx(null)}
          onDone={(f, cap) => {
            if (f !== editPf.file) { if (editPf.file.uipView && f.uipView === undefined) f.uipView = editPf.file.uipView; onReplaceFile(editIdx, f); }
            setText(cap);
            setEditIdx(null);
          }}
          onSend={(f, cap) => {
            if (editPf.file.uipView && f.uipView === undefined) f.uipView = editPf.file.uipView;
            const files = pendingFiles.map((p, i) => (i === editIdx ? f : p.file));
            setEditIdx(null);
            setText('');
            setShowEmoji(false);
            onSend(cap, files);
          }}
        />
      )}
    </section>
  );
}
