import { useEffect, useMemo, useState } from 'react';
import { useBackLayer } from '../../../lib/backStack';
import { useMeetingRoom } from '../../../hooks/useMeetingRoom';
import ParticipantTile from './ParticipantTile';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import FilesPanel from './FilesPanel';
import NotesPanel from './NotesPanel';
import PollsPanel from './PollsPanel';
import RecordingsPanel from './RecordingsPanel';
import Icon from '../../Icon';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const REACTION_TYPES = [
  { type: 'thumbs_up', emoji: '👍' },
  { type: 'applause', emoji: '👏' },
  { type: 'laugh', emoji: '😂' },
  { type: 'heart', emoji: '❤️' },
  { type: 'celebrate', emoji: '🎉' },
];

/**
 * Round 3 (Signaling) + Round 4 (WebRTC Core, بند 4 — Participant Grid +
 * control bar). Pure UI/orchestration shell around useMeetingRoom() — used
 * two ways:
 *  - authenticated: MeetingRoom.jsx (`/${role}/meetings/{uuid}/room`)
 *    renders it with `guestToken=null` (the api client's Bearer token
 *    covers auth).
 *  - guest: MeetingPreJoin.jsx renders it inline, in place of the old
 *    static "you're in" card, once requestAccess() returns `admitted`
 *    with a guest_token — a guest has no portal to navigate to.
 *
 * Layout: always a "spotlight" tile (whoever is screen-sharing, else your
 * own camera) + a "strip" of everyone else. On desktop/tablet
 * (meeting-room.css) the strip's `display: contents` folds it back into
 * one flat grid alongside the spotlight — the split only actually takes
 * effect on mobile, matching the round plan's explicit mobile layout
 * ("one main camera + a thumbnail strip for the rest").
 *
 * Round 5 (Live Collaboration) additions — بند 7/8 (Chat, `ChatPanel`
 * slide-in), بند 11 (Raise Hand + ephemeral floating reactions), بند 9
 * (Screen Sharing host policies: a topbar lock toggle + per-participant
 * menu, gated on `isHost`). `screenSharingLockedInitial`/
 * `chatEnabledInitial` come from the caller's own already-fetched meeting
 * record where available — see MeetingRoom.jsx/MeetingPreJoin.jsx's own
 * docblocks for why a guest only gets safe defaults here (preJoinInfo()
 * doesn't expose these two meeting-wide flags to a not-yet-admitted
 * guest; the live `.screen_share.policy.changed` broadcast corrects it
 * for them the moment the host next toggles it).
 *
 * Round 6 (Host Controls) additions — بند 5: `ParticipantsPanel` slide-in
 * (mute/disable-camera/remove/promote/demote/make-host/lock meeting,
 * gated on `room.isManager` = host or co-host — see useMeetingRoom's own
 * docblock), the same actions folded into each `ParticipantTile`'s
 * existing "more" popover for quick single-participant access, and a
 * dedicated "you were removed" screen for `room.kicked`.
 *
 * Round 7 (Collaboration Extras) additions — بند 19 (`FilesPanel`), بند
 * 20 (`NotesPanel`), بند 21 (`PollsPanel`). Three more slide-in panels,
 * same "one open at a time" pattern as Chat/Participants — opening any
 * one of the five closes whichever else was open (see `openPanel` below,
 * replacing the five separate `useState(false)` booleans this component
 * used through Round 6).
 *
 * Round 9 (Recording) addition — بند 18 (`RecordingsPanel`), the sixth
 * slide-in panel, same one-at-a-time rule. `room.activeRecording` also
 * drives a persistent "Recording" indicator in the topbar itself
 * (outside the panel) — "Recording must be clearly indicated to all
 * participants", not just to whoever happens to have the panel open.
 */
export default function MeetingRoomShell({
  meetingUuid, meetingTitle, guestToken = null, myKey, myDisplayName, deviceDefaults, onLeave,
  isHost = false, screenSharingLockedInitial = false, chatEnabledInitial = true,
}) {
  const t = useTranslations(translations);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  // Round 7 — one slide-in panel open at a time (Chat/Participants/Files/
  // Notes/Polls); replaces the separate per-panel booleans Round 5/6 used,
  // since a 5-way stack over the same stage only makes sense one at a time.
  const [openPanel, setOpenPanel] = useState(null); // 'chat' | 'participants' | 'files' | 'notes' | 'polls' | 'recordings' | null
  const togglePanel = (name) => setOpenPanel((prev) => (prev === name ? null : name));
  // Back closes the open side panel first (chat, participants, ...), then leaves the room page.
  useBackLayer(openPanel !== null, () => setOpenPanel(null));
  const chatOpen = openPanel === 'chat';
  const participantsOpen = openPanel === 'participants';
  const filesOpen = openPanel === 'files';
  const notesOpen = openPanel === 'notes';
  const pollsOpen = openPanel === 'polls';
  const recordingsOpen = openPanel === 'recordings';

  useEffect(() => {
    document.body.classList.add('meeting-room-active');
    return () => document.body.classList.remove('meeting-room-active');
  }, []);

  const room = useMeetingRoom({
    meetingUuid, guestToken, myKey, myDisplayName, deviceDefaults,
    isHost, screenSharingLockedInitial, chatEnabledInitial,
  });

  const tiles = useMemo(() => {
    const remote = Object.entries(room.participants).map(([key, p]) => ({ key, ...p }));
    const local = {
      key: 'local', displayName: myDisplayName, isHost: room.myRole === 'host', role: room.myRole, isGuest: !!guestToken,
      micEnabled: room.micEnabled, cameraEnabled: room.cameraEnabled, screenSharing: room.screenSharing,
      handRaised: room.handRaised, screenShareAllowed: room.myScreenShareAllowed,
      connectionState: 'connected', connectionQuality: 'excellent', remoteStream: room.localStream, isLocal: true,
    };
    const all = [local, ...remote];
    const sharer = all.find((p) => p.screenSharing) || local;
    const rest = all.filter((p) => p.key !== sharer.key);
    return { spotlight: sharer, rest, all };
  }, [room.participants, room.localStream, room.micEnabled, room.cameraEnabled, room.screenSharing, room.handRaised, room.myScreenShareAllowed, room.myRole, myDisplayName, guestToken]);

  const recipientOptions = useMemo(
    () => Object.entries(room.participants).map(([key, p]) => ({ key, displayName: p.displayName })),
    [room.participants]
  );

  function handleLeave() {
    if (!window.confirm(t('Are you sure you want to leave the meeting?'))) return;
    room.leave();
    onLeave?.();
  }

  if (room.status === 'error') {
    return (
      <div className="meeting-room" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6)' }}>
        <Icon name="alert-triangle" size={32} />
        <p className="text-h3" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>{t("You haven't joined this meeting yet.")}</p>
        <p className="text-small" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('Use the meeting link to join first.')}</p>
        <button type="button" className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }} onClick={() => onLeave?.()}>
          {t('Back to My Meetings')}
        </button>
      </div>
    );
  }

  const renderTile = (p) => (
    <div key={p.key} className="meeting-tile-wrap">
      <ParticipantTile
        stream={p.remoteStream}
        displayName={p.key === 'local' ? `${p.displayName} (${t('You')})` : p.displayName}
        isHost={p.isHost}
        isGuest={p.isGuest}
        micEnabled={p.micEnabled}
        cameraEnabled={p.cameraEnabled}
        screenSharing={p.screenSharing}
        handRaised={p.handRaised}
        screenShareAllowed={p.screenShareAllowed}
        connectionQuality={p.connectionQuality}
        connectionState={p.connectionState}
        isLocal={!!p.isLocal}
        large={p.key === tiles.spotlight.key}
        canManage={room.isManager && !p.isLocal}
        onAllowScreenShare={() => room.setParticipantScreenShareAllowed(p.key, true)}
        onDenyScreenShare={() => room.setParticipantScreenShareAllowed(p.key, false)}
        onResetScreenShare={() => room.setParticipantScreenShareAllowed(p.key, null)}
        onForceStopScreenShare={() => room.forceStopScreenShare(p.key)}
        role={p.role}
        canPrimaryManage={room.myRole === 'host' && !p.isLocal && !p.isGuest}
        onMute={() => room.muteParticipant(p.key).catch(() => {})}
        onDisableCamera={() => room.disableParticipantCamera(p.key).catch(() => {})}
        onRemove={() => { if (window.confirm(t('Remove this participant from the meeting?'))) room.removeParticipant(p.key).catch(() => {}); }}
        onPromote={() => room.promoteParticipant(p.key).catch(() => {})}
        onDemote={() => room.demoteParticipant(p.key).catch(() => {})}
        onMakeHost={() => { if (window.confirm(t('Make this participant the host? You will become a moderator.'))) room.transferHost(p.key).catch(() => {}); }}
      />
    </div>
  );

  function noticeText(notice) {
    if (!notice) return null;
    if (notice.type === 'screen_share_force_stopped') {
      return `${t('The host stopped your screen share.')}${notice.by ? ` (${notice.by})` : ''}`;
    }
    if (notice.type === 'screen_share_locked') {
      return t('Screen sharing is currently locked by the host.');
    }
    if (notice.type === 'muted_by_host') {
      return `${t('You were muted by the host.')}${notice.by ? ` (${notice.by})` : ''}`;
    }
    if (notice.type === 'camera_disabled_by_host') {
      return `${t('Your camera was turned off by the host.')}${notice.by ? ` (${notice.by})` : ''}`;
    }
    return null;
  }

  if (room.kicked) {
    return (
      <div className="meeting-room" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6)' }}>
        <Icon name="user-x" size={32} />
        <p className="text-h3" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>{t('You were removed from the meeting.')}</p>
        {room.kicked.byDisplayName && (
          <p className="text-small" style={{ color: 'rgba(255,255,255,0.7)' }}>{`${t('Removed by')} ${room.kicked.byDisplayName}`}</p>
        )}
        <button type="button" className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }} onClick={() => onLeave?.()}>
          {t('Back to My Meetings')}
        </button>
      </div>
    );
  }

  return (
    <div className="meeting-room">
      <div className="meeting-room__topbar">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: 'var(--text-body)' }}>{meetingTitle || t('Meeting Room')}</strong>
          <span className="text-caption" style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {room.status === 'connecting' ? t('Connecting…') : `${tiles.rest.length + 1} ${t('participants')}`}
            {room.meetingLocked && <Icon name="lock" size={11} title={t('Meeting locked')} />}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {room.activeRecording && (
            <span
              className="badge badge-danger"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              title={`${t('Recording in progress — started by')} ${room.activeRecording.started_by_display_name || ''}`}
            >
              <Icon name="record-dot" size={10} className="meeting-room__record-pulse" /> {t('Recording')}
            </span>
          )}
          {room.isHost && (
            <button
              type="button"
              className={`meeting-room__control-btn ${room.screenSharingLocked ? 'is-active' : ''}`}
              style={{ width: 36, height: 36 }}
              onClick={() => room.setScreenSharingLock(!room.screenSharingLocked)}
              title={room.screenSharingLocked ? t('Allow screen sharing') : t('Disable screen sharing')}
            >
              <Icon name="lock" size={16} />
            </button>
          )}
          <button type="button" className="meeting-room__control-btn is-leave" onClick={handleLeave} title={t('Leave Meeting')}>
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>

      {noticeText(room.notice) && (
        <p
          className="text-caption"
          style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd', margin: 0, padding: 'var(--space-2) var(--space-4)', display: 'flex', justifyContent: 'space-between', gap: 8 }}
        >
          <span>{noticeText(room.notice)}</span>
          <button type="button" onClick={room.clearNotice} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <Icon name="x" size={14} />
          </button>
        </p>
      )}
      {room.meshCapacity?.exceeds_recommended && (
        <p className="text-caption" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', margin: 0, padding: 'var(--space-2) var(--space-4)' }}>
          {t('This meeting has reached the recommended participant limit — call quality may degrade.')}
        </p>
      )}
      {room.error && (
        <p className="text-caption" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', margin: 0, padding: 'var(--space-2) var(--space-4)' }}>
          {room.error.message || t("Camera/microphone couldn't be accessed — you can still see and hear everyone else.")}
        </p>
      )}

      <div className="meeting-room__stage">
        <div className="meeting-room__spotlight">{renderTile(tiles.spotlight)}</div>
        <div className="meeting-room__strip">{tiles.rest.map(renderTile)}</div>

        {room.reactions.length > 0 && (
          <div className="meeting-room__reactions-overlay">
            {room.reactions.map((r) => (
              <span key={r.id} className="meeting-room__floating-reaction">{r.emoji || '👍'}</span>
            ))}
          </div>
        )}
      </div>

      <div className="meeting-room__controls">
        <button
          type="button"
          className={`meeting-room__control-btn ${room.micEnabled ? '' : 'is-off'}`}
          onClick={room.toggleMic}
          title={room.micEnabled ? t('Mute') : t('Unmute')}
        >
          <Icon name="mic" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${room.cameraEnabled ? '' : 'is-off'}`}
          onClick={room.toggleCamera}
          title={room.cameraEnabled ? t('Turn camera off') : t('Turn camera on')}
        >
          <Icon name="monitor" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${room.screenSharing ? 'is-active' : ''}`}
          onClick={room.toggleScreenShare}
          title={room.screenSharing ? t('Stop Sharing') : (room.canShareScreen ? t('Share Screen') : t('Screen sharing is currently locked by the host.'))}
          disabled={!room.screenSharing && !room.canShareScreen}
        >
          <Icon name="share" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${room.handRaised ? 'is-active' : ''}`}
          onClick={room.toggleHand}
          title={room.handRaised ? t('Lower Hand') : t('Raise Hand')}
        >
          <Icon name="hand" size={18} />
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="meeting-room__control-btn"
            onClick={() => setReactionsOpen((v) => !v)}
            title={t('Reactions')}
          >
            <Icon name="smile" size={18} />
          </button>
          {reactionsOpen && (
            <div className="meeting-room__reactions-popover">
              {REACTION_TYPES.map((r) => (
                <button
                  key={r.type}
                  type="button"
                  onClick={() => { room.sendReaction(r.type, r.emoji); setReactionsOpen(false); }}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="meeting-room__control-btn"
          style={{ position: 'relative' }}
          onClick={() => togglePanel('chat')}
          title={t('Chat')}
        >
          <Icon name="message-square" size={18} />
          {room.chatUnreadCount > 0 && !chatOpen && (
            <span className="meeting-room__badge-dot">{room.chatUnreadCount > 9 ? '9+' : room.chatUnreadCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${participantsOpen ? 'is-active' : ''}`}
          onClick={() => togglePanel('participants')}
          title={t('Participants')}
        >
          <Icon name="users" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${filesOpen ? 'is-active' : ''}`}
          onClick={() => togglePanel('files')}
          title={t('Files')}
        >
          <Icon name="file" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${notesOpen ? 'is-active' : ''}`}
          onClick={() => togglePanel('notes')}
          title={t('Notes & Action Items')}
        >
          <Icon name="note" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${pollsOpen ? 'is-active' : ''}`}
          onClick={() => togglePanel('polls')}
          title={t('Polls')}
        >
          <Icon name="bar-chart" size={18} />
        </button>
        <button
          type="button"
          className={`meeting-room__control-btn ${recordingsOpen ? 'is-active' : ''}`}
          style={{ position: 'relative' }}
          onClick={() => togglePanel('recordings')}
          title={t('Recordings')}
        >
          <Icon name="record-dot" size={18} style={room.activeRecording ? { color: '#ef4444' } : undefined} />
        </button>
        <button type="button" className="meeting-room__control-btn is-leave" onClick={handleLeave} title={t('Leave Meeting')}>
          <Icon name="logout" size={18} />
        </button>
      </div>

      <ParticipantsPanel
        people={tiles.all}
        myRole={room.myRole}
        meetingLocked={room.meetingLocked}
        isOpen={participantsOpen}
        onClose={() => setOpenPanel(null)}
        onLockMeeting={(locked) => room.lockMeeting(locked)}
        onMute={(key) => room.muteParticipant(key)}
        onDisableCamera={(key) => room.disableParticipantCamera(key)}
        onRemove={(key) => room.removeParticipant(key)}
        onPromote={(key) => room.promoteParticipant(key)}
        onDemote={(key) => room.demoteParticipant(key)}
        onMakeHost={(key) => {
          if (!window.confirm(t('Make this participant the host? You will become a moderator.'))) return Promise.resolve();
          return room.transferHost(key);
        }}
      />

      <ChatPanel
        messages={room.chatMessages}
        unreadCount={room.chatUnreadCount}
        enabled={room.chatEnabled}
        myKey={myKey}
        recipientOptions={recipientOptions}
        isOpen={chatOpen}
        onClose={() => setOpenPanel(null)}
        onSend={room.sendChatMessage}
        onReact={room.reactToChatMessage}
        onMarkRead={room.markChatRead}
      />

      <FilesPanel
        files={room.files}
        myKey={myKey}
        isManager={room.isManager}
        isOpen={filesOpen}
        onClose={() => setOpenPanel(null)}
        onUpload={room.uploadFile}
        onDelete={room.deleteFile}
      />

      <NotesPanel
        notes={room.notes}
        actionItems={room.actionItems}
        isManager={room.isManager}
        isOpen={notesOpen}
        onClose={() => setOpenPanel(null)}
        onUpdateNotes={room.updateNotes}
        onCreateItem={room.createActionItem}
        onUpdateItem={room.updateActionItem}
        onDeleteItem={room.deleteActionItem}
      />

      <PollsPanel
        polls={room.polls}
        isManager={room.isManager}
        isOpen={pollsOpen}
        onClose={() => setOpenPanel(null)}
        onCreate={room.createPoll}
        onVote={room.votePoll}
        onClosePoll={room.closePoll}
      />

      <RecordingsPanel
        recordings={room.recordings}
        isManager={room.isManager}
        isOpen={recordingsOpen}
        onClose={() => setOpenPanel(null)}
        activeRecording={room.activeRecording}
        isRecordingLocally={room.isRecordingLocally}
        recordingBusy={room.recordingBusy}
        recordingError={room.recordingError}
        onStart={room.startRecording}
        onStopLocal={room.stopRecordingLocal}
        onDelete={room.deleteRecording}
      />
    </div>
  );
}
