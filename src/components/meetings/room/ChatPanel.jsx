import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const QUICK_REACTIONS = ['👍', '❤️', '😂'];

/**
 * Round 5 (Live Collaboration) — بند 7 (Meeting Chat)، بند 8 (Private
 * Chat). Slide-in panel, mounted alongside the video grid in
 * MeetingRoomShell (not a modal — the call keeps running behind it).
 *
 * `recipientOptions` is the roster (local + remote) the compose box's
 * "Everyone / private to X" selector is built from — sourced from the
 * same `tiles` list MeetingRoomShell already derives for the video grid,
 * not fetched separately here.
 *
 * Reactions here reuse chat's own toggleReaction (بند 7 "Message
 * reactions") — a completely different mechanism from بند 11's ephemeral
 * ParticipantReactionSent floaters (see useMeetingRoom's sendReaction) —
 * these are *attached to a specific message* and persist in history.
 */
export default function ChatPanel({
  messages, unreadCount, enabled, myKey, recipientOptions, isOpen, onClose, onSend, onReact, onMarkRead,
}) {
  const t = useTranslations(translations);
  const [body, setBody] = useState('');
  const [recipientKey, setRecipientKey] = useState('');
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) onMarkRead?.();
  }, [isOpen, messages.length, onMarkRead]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isOpen, messages.length]);

  if (!isOpen) return null;

  const nameFor = (key) => recipientOptions.find((p) => p.key === key)?.displayName || key;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(body, { recipientKey: recipientKey || null });
      setBody('');
    } catch (err) {
      setSendError(err?.message || t('Could not send this message.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="meeting-chat-panel">
      <div className="meeting-chat-panel__header">
        <strong>{t('Chat')}</strong>
        {unreadCount > 0 && <span className="badge badge-primary" style={{ marginInlineStart: 6 }}>{unreadCount}</span>}
        <button type="button" className="meeting-room__control-btn" style={{ width: 32, height: 32, marginInlineStart: 'auto' }} onClick={onClose} title={t('Close')}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="meeting-chat-panel__list" ref={listRef}>
        {messages.length === 0 && (
          <p className="text-caption" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 'var(--space-4)' }}>
            {t('No messages yet — say hello.')}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_key === myKey;
          const isSystem = m.type === 'system';
          if (isSystem) {
            return (
              <p key={m.id} className="text-caption" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', margin: '4px 0' }}>
                {m.body}
              </p>
            );
          }
          return (
            <div key={m.id} className={`meeting-chat-msg ${mine ? 'is-mine' : ''}`}>
              <div className="meeting-chat-msg__meta">
                <span>{mine ? t('You') : m.sender_display_name}</span>
                {m.is_private && (
                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                    {mine ? `${t('Private to')} ${nameFor(m.recipient_key)}` : t('Private message')}
                  </span>
                )}
              </div>
              <div className="meeting-chat-msg__body">{m.body}</div>
              {m.reactions.length > 0 && (
                <div className="meeting-chat-msg__reactions">
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`meeting-chat-msg__reaction ${r.actor_keys.includes(myKey) ? 'is-mine' : ''}`}
                      onClick={() => onReact(m.id, r.emoji)}
                    >
                      {r.emoji} {r.count}
                    </button>
                  ))}
                </div>
              )}
              <div className="meeting-chat-msg__quick-react">
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => onReact(m.id, emoji)} title={t('React')}>{emoji}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {enabled ? (
        <form className="meeting-chat-panel__compose" onSubmit={handleSubmit}>
          {recipientOptions.length > 0 && (
            <select
              className="form-select"
              value={recipientKey}
              onChange={(e) => setRecipientKey(e.target.value)}
              style={{ marginBottom: 6 }}
            >
              <option value="">{t('Everyone')}</option>
              {recipientOptions.map((p) => (
                <option key={p.key} value={p.key}>{p.displayName}</option>
              ))}
            </select>
          )}
          {sendError && <p className="form-error" style={{ margin: '0 0 6px' }}>{sendError}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              className="form-input"
              placeholder={recipientKey ? `${t('Private message to')} ${nameFor(recipientKey)}…` : t('Type a message…')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>
              <Icon name="send" size={16} />
            </button>
          </div>
        </form>
      ) : (
        <p className="text-caption" style={{ padding: 'var(--space-3) var(--space-4)', color: 'rgba(255,255,255,0.55)' }}>
          {t('Chat is disabled for this meeting.')}
        </p>
      )}
    </div>
  );
}
