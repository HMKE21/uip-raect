import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const QUICK_REACTIONS = ['👍', '❤️', '😂', '👏', '🎉'];
const GROUP_WINDOW_MS = 3 * 60 * 1000; // consecutive messages from one person within 3 minutes share one name/avatar

const AVATAR_HUES = [231, 262, 291, 330, 12, 32, 152, 188, 205];
function avatarColor(name) {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 28) % 360} 70% 46%))`;
}

/**
 * Round 5 (Live Collaboration) — بند 7 (Meeting Chat)، بند 8 (Private Chat). Slide-in panel, mounted alongside the video grid in
 * MeetingRoomShell (not a modal — the call keeps running behind it).
 *
 * Layout: messages are grouped per sender (one name + avatar per run, a time on the last bubble of the run), system lines are
 * centred chips, the quick-reaction bar appears on hover / focus (always visible on touch screens), and the composer is a
 * single rounded field (Enter sends, Shift+Enter adds a line) with the "who sees this" choice shown as a chip above it.
 * Everything uses logical properties and `dir="auto"` on message text, so Arabic and English messages both align correctly
 * whichever language the room is in.
 *
 * `recipientOptions` is the roster (local + remote) the "Everyone / private to X" selector is built from — sourced from the
 * same `tiles` list MeetingRoomShell already derives for the video grid, not fetched separately here.
 *
 * Reactions here reuse chat's own toggleReaction (بند 7 "Message reactions") — a completely different mechanism from بند 11's
 * ephemeral ParticipantReactionSent floaters (see useMeetingRoom's sendReaction) — these are *attached to a specific message*
 * and persist in history.
 */
export default function ChatPanel({
  messages, reactionLog = [], unreadCount, enabled, myKey, recipientOptions, isOpen, onClose, onSend, onReact, onMarkRead,
}) {
  const t = useTranslations(translations);
  const [body, setBody] = useState('');
  const [recipientKey, setRecipientKey] = useState('');
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true); // true while the reader is at (or near) the bottom — only then do new messages auto-scroll

  useEffect(() => {
    if (isOpen) onMarkRead?.();
  }, [isOpen, messages.length, onMarkRead]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickRef.current = true;
    setShowJump(false);
  }, []);

  // opening the panel -> straight to the newest message
  useLayoutEffect(() => {
    if (isOpen) scrollToBottom(false);
  }, [isOpen, scrollToBottom]);

  // new message: follow it if the reader was at the bottom (or it is mine), otherwise offer a "new messages" jump chip
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!isOpen || (!lastMessage && reactionLog.length === 0)) return;
    if (stickRef.current || lastMessage?.sender_key === myKey) scrollToBottom(true);
    else setShowJump(true);
  }, [isOpen, messages.length, reactionLog.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // grow the composer with its text (up to ~5 lines)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [body, isOpen]);

  if (!isOpen) return null;

  const nameFor = (key) => recipientOptions.find((p) => p.key === key)?.displayName || key;
  const locale = t.locale === 'ar' ? 'ar-EG' : 'en-US';
  const timeOf = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    stickRef.current = atBottom;
    if (atBottom) setShowJump(false);
  }

  async function submit() {
    if (!body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(body, { recipientKey: recipientKey || null });
      setBody('');
      stickRef.current = true;
    } catch (err) {
      setSendError(err?.message || t('Could not send this message.'));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter = new line; never while an IME (Arabic/CJK keyboards) is still composing a word
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // decide, per message, whether it starts a new run (shows name + avatar) and whether it ends one (shows the time)
  const sameRun = (a, b) => a && b && a.type !== 'system' && b.type !== 'system'
    && a.sender_key === b.sender_key && !!a.is_private === !!b.is_private
    && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GROUP_WINDOW_MS;
  // live emoji reactions ("Name 👍") are interleaved with the messages by time, so the chat tells the whole story of the call
  const timeline = reactionLog.length === 0
    ? messages
    : [...messages, ...reactionLog.map((r) => ({ ...r, type: 'reaction' }))]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const rows = timeline.map((m, i) => {
    const special = m.type === 'system' || m.type === 'reaction';
    return { m, isSystem: special, first: !special && !sameRun(timeline[i - 1], m), last: !special && !sameRun(m, timeline[i + 1]) };
  });

  return (
    <div className="meeting-chat-panel">
      <div className="meeting-chat-panel__header">
        <span className="meeting-chat-panel__header-ico" aria-hidden="true"><Icon name="message-square" size={16} /></span>
        <strong>{t('Chat')}</strong>
        {unreadCount > 0 && <span className="badge badge-primary">{unreadCount}</span>}
        <button type="button" className="meeting-room__control-btn" style={{ marginInlineStart: 'auto' }} onClick={onClose} title={t('Close')} aria-label={t('Close')}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="meeting-chat-panel__list" ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 && reactionLog.length === 0 && (
          <div className="meeting-chat-panel__empty">
            <span className="meeting-chat-panel__empty-ico"><Icon name="message-square" size={26} /></span>
            <p>{t('No messages yet — say hello.')}</p>
          </div>
        )}

        {rows.map(({ m, isSystem, first, last }) => {
          if (m.type === 'reaction') {
            return (
              <div key={m.id} className="meeting-chat-react-line">
                <span><b>{m.emoji}</b> {m.key === myKey ? t('You') : m.displayName} {t('reacted')}</span>
              </div>
            );
          }
          if (isSystem) {
            return (
              <div key={m.id} className="meeting-chat-sys"><span dir="auto">{m.body}</span></div>
            );
          }
          const mine = m.sender_key === myKey;
          const cls = ['meeting-chat-msg', mine ? 'is-mine' : '', first ? 'is-first' : '', last ? 'is-last' : '', m.is_private ? 'is-private' : ''].filter(Boolean).join(' ');
          return (
            <div key={m.id} className={cls}>
              {!mine && (
                <span className="meeting-chat-msg__avatar" style={first ? { background: avatarColor(m.sender_display_name) } : undefined} aria-hidden="true">
                  {first ? ((m.sender_display_name || '?').trim().charAt(0).toUpperCase() || '?') : ''}
                </span>
              )}
              <div className="meeting-chat-msg__col">
                {first && (
                  <div className="meeting-chat-msg__meta">
                    <span className="meeting-chat-msg__name">{mine ? t('You') : m.sender_display_name}</span>
                    {m.is_private && (
                      <span className="meeting-chat-msg__private">
                        <Icon name="lock" size={10} />
                        {mine ? `${t('Private to')} ${nameFor(m.recipient_key)}` : t('Private message')}
                      </span>
                    )}
                  </div>
                )}

                <div className="meeting-chat-msg__bubble-wrap">
                  <div className="meeting-chat-msg__body" dir="auto">{m.body}</div>
                  <div className="meeting-chat-msg__quick-react" role="group" aria-label={t('React')}>
                    {QUICK_REACTIONS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => onReact(m.id, emoji)} title={t('React')}>{emoji}</button>
                    ))}
                  </div>
                </div>

                {m.reactions.length > 0 && (
                  <div className="meeting-chat-msg__reactions">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        className={`meeting-chat-msg__reaction ${r.actor_keys.includes(myKey) ? 'is-mine' : ''}`}
                        onClick={() => onReact(m.id, r.emoji)}
                      >
                        {r.emoji} <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {last && <span className="meeting-chat-msg__time">{timeOf(m.created_at)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {showJump && (
        <button type="button" className="meeting-chat-panel__jump" onClick={() => scrollToBottom(true)}>
          <Icon name="arrow-down" size={14} /> {t('New messages')}
        </button>
      )}

      {enabled ? (
        <form className="meeting-chat-panel__compose" onSubmit={handleSubmit}>
          {sendError && <p className="form-error meeting-chat-panel__error">{sendError}</p>}

          {recipientOptions.length > 0 && (
            <div className={`meeting-chat-panel__to ${recipientKey ? 'is-private' : ''}`}>
              <Icon name={recipientKey ? 'lock' : 'users'} size={13} />
              <span>{t('To')}</span>
              <select value={recipientKey} onChange={(e) => setRecipientKey(e.target.value)} aria-label={t('To')}>
                <option value="">{t('Everyone')}</option>
                {recipientOptions.map((p) => (
                  <option key={p.key} value={p.key}>{p.displayName}</option>
                ))}
              </select>
              {recipientKey && <em>{t('Only they will see this')}</em>}
            </div>
          )}

          <div className="meeting-chat-panel__field">
            <textarea
              ref={inputRef}
              rows={1}
              dir="auto"
              placeholder={recipientKey ? `${t('Private message to')} ${nameFor(recipientKey)}…` : t('Type a message…')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={4000}
            />
            <button type="submit" className="meeting-chat-panel__send" disabled={sending || !body.trim()} title={t('Send')} aria-label={t('Send')}>
              <Icon name="send" size={16} />
            </button>
          </div>
        </form>
      ) : (
        <p className="meeting-chat-panel__disabled">
          <Icon name="lock" size={13} /> {t('Chat is disabled for this meeting.')}
        </p>
      )}
    </div>
  );
}
