import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackLayer } from '../../../lib/backStack';
import { useMeetingRoom, meetingLog } from '../../../hooks/useMeetingRoom';
import ParticipantTile from './ParticipantTile';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import FilesPanel from './FilesPanel';
import NotesPanel from './NotesPanel';
import PollsPanel from './PollsPanel';
import RecordingsPanel from './RecordingsPanel';
import Icon from '../../Icon';
import { useTranslations, useLanguage } from '../../../context/LanguageContext';
import { useTheme } from '../../../context/ThemeContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const ROOM_THEME_KEY = 'uip_room_theme';

/**
 * Light / dark look of the room itself. Starts from the choice made in the room last time, else from the site theme, and
 * flipping it here only affects the call (it does not touch the account / portal theme). Video tiles stay dark in both looks.
 */
function useRoomTheme() {
  const { theme } = useTheme();
  const [roomTheme, setRoomTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(ROOM_THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* storage unavailable */ }
    return theme === 'light' ? 'light' : 'dark';
  });
  const toggleRoomTheme = () => setRoomTheme((cur) => {
    const next = cur === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(ROOM_THEME_KEY, next); } catch { /* storage unavailable */ }
    return next;
  });
  return [roomTheme, toggleRoomTheme];
}

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
  isHost = false, screenSharingLockedInitial = false, chatEnabledInitial = true, meetingLockedInitial = false,
}) {
  const t = useTranslations(translations);
  const { locale, toggleLocale } = useLanguage();
  const [roomTheme, toggleRoomTheme] = useRoomTheme();
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const dockRef = useRef(null);
  const [elapsed, setElapsed] = useState('00:00');
  useEffect(() => {
    const started = Date.now();
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const sec = Math.floor((Date.now() - started) / 1000);
      const h = Math.floor(sec / 3600);
      setElapsed(`${h ? `${pad(h)}:` : ''}${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  // close the reactions / "more" popovers when clicking anywhere outside the dock
  useEffect(() => {
    if (!reactionsOpen && !moreOpen) return undefined;
    const onDown = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) { setReactionsOpen(false); setMoreOpen(false); }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [reactionsOpen, moreOpen]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLines, setDiagLines] = useState([]);
  useEffect(() => {
    if (!diagOpen) return undefined;
    const tick = () => setDiagLines(meetingLog());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [diagOpen]);
  const [pinnedKey, setPinnedKey] = useState(null); // double-click a tile to pin it large
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
    isHost, screenSharingLockedInitial, chatEnabledInitial, meetingLockedInitial,
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
    // Equal grid by default; a big "spotlight" + side strip only when someone shares their screen or you pinned a tile.
    const presenter = all.find((p) => p.screenSharing) || null;
    const featured = all.find((p) => all.length > 1 && p.key === pinnedKey) || presenter || null;
    const rest = featured ? all.filter((p) => p.key !== featured.key) : all;
    const n = all.length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    return { spotlight: featured, rest, all, cols, rows: Math.ceil(n / cols) };
  }, [room.participants, room.localStream, room.micEnabled, room.cameraEnabled, room.screenSharing, room.handRaised, room.myScreenShareAllowed, room.myRole, myDisplayName, guestToken, pinnedKey]);

  // newest live reaction per person -> shown on THEIR tile (their own tile = 'local'); the corner overlay shows the same stream with names
  const reactionByTile = useMemo(() => {
    const map = {};
    room.reactions.forEach((r) => { map[r.key === myKey ? 'local' : r.key] = r; });
    return map;
  }, [room.reactions, myKey]);

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
      <div className="meeting-room" data-room-theme={roomTheme} style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6)' }}>
        <Icon name="alert-triangle" size={32} />
        <p className="text-h3" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>{t("You haven't joined this meeting yet.")}</p>
        <p className="text-small" style={{ color: 'var(--mr-muted)' }}>{t('Use the meeting link to join first.')}</p>
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
        reaction={reactionByTile[p.key]}
        speakersMuted={room.speakersMuted}
        screenShareAllowed={p.screenShareAllowed}
        connectionQuality={p.connectionQuality}
        connectionState={p.connectionState}
        isLocal={!!p.isLocal}
        large={!!tiles.spotlight && p.key === tiles.spotlight.key}
        pinned={pinnedKey === p.key}
        onPin={tiles.all.length > 1 ? () => setPinnedKey((k) => (k === p.key ? null : p.key)) : undefined}
        onStopShare={p.isLocal && p.screenSharing ? room.toggleScreenShare : undefined}
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
    if (notice.type === 'echo_detected') return t('Audio feedback detected — another device nearby is looping your voice, so your mic was muted. Use headphones, or turn Speakers off in More if you are in the same room as them.');
    if (notice.type === 'camera_unavailable') return t("Couldn't open a camera. Check the browser's camera permission and that no other app is using it.");
    if (notice.type === 'screen_share_unsupported') return t("This browser can't share your screen.");
    if (notice.type === 'screen_share_failed') return t('Screen sharing could not start. Please try again.');
    if (notice.type === 'camera_disabled_by_host') {
      return `${t('Your camera was turned off by the host.')}${notice.by ? ` (${notice.by})` : ''}`;
    }
    return null;
  }

  if (room.kicked) {
    return (
      <div className="meeting-room" data-room-theme={roomTheme} style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6)' }}>
        <Icon name="user-x" size={32} />
        <p className="text-h3" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>{t('You were removed from the meeting.')}</p>
        {room.kicked.byDisplayName && (
          <p className="text-small" style={{ color: 'var(--mr-muted)' }}>{`${t('Removed by')} ${room.kicked.byDisplayName}`}</p>
        )}
        <button type="button" className="btn btn-outline" style={{ marginTop: 'var(--space-3)' }} onClick={() => onLeave?.()}>
          {t('Back to My Meetings')}
        </button>
      </div>
    );
  }

  const presenterTile = tiles.all.find((p) => p.screenSharing) || null;
  const anyPanelOpen = openPanel !== null;
  const unread = room.chatUnreadCount > 0 && !chatOpen ? (room.chatUnreadCount > 9 ? '9+' : room.chatUnreadCount) : null;
  const moreActive = filesOpen || notesOpen || pollsOpen || recordingsOpen;

  const cameraTitle = !room.hasCamera ? t('Turn camera on') : room.cameraEnabled ? t('Turn camera off') : t('Turn camera on');

  return (
    <div className={`meeting-room ${anyPanelOpen ? 'has-panel' : ''}`} data-room-theme={roomTheme}>
      <header className="meeting-room__topbar">
        <div className="meeting-room__title">
          <span className="meeting-room__live-dot" aria-hidden="true" />
          <div className="meeting-room__title-text">
            <strong>{meetingTitle || t('Meeting Room')}</strong>
            <span>
              {room.status === 'connecting' ? t('Connecting…') : <bdi dir="ltr">{elapsed}</bdi>}
              {room.meetingLocked && <Icon name="lock" size={11} title={t('Meeting locked')} />}
            </span>
          </div>
        </div>

        <div className="meeting-room__topbar-end">
          {room.activeRecording && (
            <span className="meeting-room__rec" title={`${t('Recording in progress — started by')} ${room.activeRecording.started_by_display_name || ''}`}>
              <Icon name="record-dot" size={11} className="meeting-room__record-pulse" /> {t('Recording')}
            </span>
          )}
          <button
            type="button"
            className={`meeting-room__pill ${participantsOpen ? 'is-active' : ''}`}
            onClick={() => togglePanel('participants')}
            title={t('Participants')}
          >
            <Icon name="users" size={15} />
            <span>{tiles.all.length}</span>
          </button>
          {room.isHost && (
            <button
              type="button"
              className={`meeting-room__icon-btn ${room.screenSharingLocked ? 'is-warn' : ''}`}
              onClick={() => room.setScreenSharingLock(!room.screenSharingLocked)}
              title={room.screenSharingLocked ? t('Allow screen sharing') : t('Disable screen sharing')}
              aria-pressed={room.screenSharingLocked}
            >
              <Icon name={room.screenSharingLocked ? 'lock' : 'screen-share'} size={16} />
            </button>
          )}
          <button type="button" className="meeting-room__pill" onClick={toggleLocale} title={t('Switch language')} aria-label={t('Switch language')}>
            <Icon name="globe" size={15} />
            <span>{locale === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
          <button
            type="button"
            className="meeting-room__icon-btn"
            onClick={toggleRoomTheme}
            title={roomTheme === 'light' ? t('Dark mode') : t('Light mode')}
            aria-label={roomTheme === 'light' ? t('Dark mode') : t('Light mode')}
          >
            <Icon name={roomTheme === 'light' ? 'moon' : 'sun'} size={16} />
          </button>
          <button type="button" className={`meeting-room__icon-btn ${diagOpen ? 'is-active' : ''}`} onClick={() => setDiagOpen((v) => !v)} title={t('Diagnostics')} aria-label={t('Diagnostics')}>
            <Icon name="pulse" size={16} />
          </button>
        </div>
      </header>

      {diagOpen && (
        <div className="meeting-room__diag">
          <div className="meeting-room__diag-head">
            <strong>{t('Diagnostics')}</strong>
            <span>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(diagLines.join('\n')); } catch { /* clipboard blocked */ } }}>{t('Copy')}</button>
              <button type="button" onClick={() => setDiagOpen(false)}>{t('Close')}</button>
            </span>
          </div>
          <pre>{diagLines.length ? diagLines.join('\n') : '…'}</pre>
        </div>
      )}

      <div className="meeting-room__alerts">
        {noticeText(room.notice) && (
          <p className="meeting-room__alert is-info">
            <Icon name="info" size={15} />
            <span>{noticeText(room.notice)}</span>
            <button type="button" onClick={room.clearNotice} aria-label={t('Close')}><Icon name="x" size={14} /></button>
          </p>
        )}
        {room.meshCapacity?.exceeds_recommended && (
          <p className="meeting-room__alert is-warn">
            <Icon name="alert-triangle" size={15} />
            <span>{t('This meeting has reached the recommended participant limit — call quality may degrade.')}</span>
          </p>
        )}
        {room.hasTurn === false && tiles.all.length > 1 && (
          <p className="meeting-room__alert is-warn">
            <Icon name="alert-triangle" size={15} />
            <span>{t('No TURN server is configured — audio/video may not reach people on other networks.')}</span>
          </p>
        )}
        {room.error && (
          <p className="meeting-room__alert is-danger">
            <Icon name="alert-triangle" size={15} />
            <span>{room.error.message || t("Camera/microphone couldn't be accessed — you can still see and hear everyone else.")}</span>
          </p>
        )}
      </div>

      <div className="meeting-room__body">
        <div
          className={`meeting-room__stage ${tiles.spotlight ? `has-spotlight ${tiles.rest.length === 0 ? 'no-strip' : ''}` : 'is-grid'}`}
          style={{ '--cols': tiles.cols, '--rows': tiles.rows, '--n': tiles.all.length }}
        >
          {tiles.spotlight ? (
            <>
              <div className="meeting-room__spotlight">
                {presenterTile && tiles.spotlight.key === presenterTile.key && (
                  <div className="meeting-room__presenter-banner">
                    <Icon name="screen-share" size={14} />
                    {presenterTile.isLocal ? t('You are presenting your screen') : `${presenterTile.displayName} ${t('is presenting')}`}
                  </div>
                )}
                {renderTile(tiles.spotlight)}
              </div>
              {tiles.rest.length > 0 && <div className="meeting-room__strip">{tiles.rest.map(renderTile)}</div>}
            </>
          ) : tiles.all.map(renderTile)}

          {room.reactions.length > 0 && (
            <div className="meeting-room__reactions-overlay">
              {room.reactions.map((r) => (
                <span key={r.id} className="meeting-room__floating-reaction">
                  <span className="meeting-room__floating-emoji">{r.emoji || '👍'}</span>
                  <span className="meeting-room__floating-name">{r.key === myKey ? t('You') : r.displayName}</span>
                </span>
              ))}
            </div>
          )}
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

      <footer className="meeting-room__controls">
        <div className="meeting-room__dock" ref={dockRef}>
          <div className="meeting-room__group">
            <DockButton
              icon={room.micEnabled ? 'mic' : 'mic-off'}
              label={room.micEnabled ? t('Mute') : t('Unmute')}
              state={room.micEnabled ? '' : 'is-off'}
              onClick={room.toggleMic}
            />
            <DockButton
              icon={room.cameraEnabled ? 'video' : 'video-off'}
              label={room.cameraEnabled ? t('Camera') : t('Camera off')}
              title={cameraTitle}
              state={room.cameraEnabled ? '' : 'is-off'}
              onClick={room.toggleCamera}
            />
            <DockButton
              icon="screen-share"
              label={room.screenSharing ? t('Stop Sharing') : t('Share Screen')}
              title={room.screenSharing ? t('Stop Sharing') : (room.canShareScreen ? t('Share Screen') : t('Screen sharing is currently locked by the host.'))}
              state={room.screenSharing ? 'is-presenting' : ''}
              disabled={!room.screenSharing && !room.canShareScreen}
              onClick={room.toggleScreenShare}
            />
          </div>

          <span className="meeting-room__divider" aria-hidden="true" />

          <div className="meeting-room__group">
            <DockButton
              icon="hand"
              label={room.handRaised ? t('Lower Hand') : t('Raise Hand')}
              state={room.handRaised ? 'is-active' : ''}
              onClick={room.toggleHand}
            />
            <div className="meeting-room__pop-anchor">
              <DockButton icon="smile" label={t('Reactions')} state={reactionsOpen ? 'is-active' : ''} onClick={() => { setReactionsOpen((v) => !v); setMoreOpen(false); }} />
              {reactionsOpen && (
                <div className="meeting-room__reactions-popover">
                  {REACTION_TYPES.map((r) => (
                    <button key={r.type} type="button" onClick={() => { room.sendReaction(r.type, r.emoji); setReactionsOpen(false); }}>{r.emoji}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <span className="meeting-room__divider" aria-hidden="true" />

          <div className="meeting-room__group">
            <DockButton icon="message-square" label={t('Chat')} state={chatOpen ? 'is-active' : ''} badge={unread} onClick={() => togglePanel('chat')} />
            <DockButton icon="users" label={t('Participants')} state={participantsOpen ? 'is-active' : ''} onClick={() => togglePanel('participants')} className="meeting-room__hide-sm" />
            <div className="meeting-room__pop-anchor">
              <DockButton
                icon="more-horizontal"
                label={t('More')}
                state={moreOpen || moreActive ? 'is-active' : ''}
                dot={!!room.activeRecording}
                onClick={() => { setMoreOpen((v) => !v); setReactionsOpen(false); }}
              />
              {moreOpen && (
                <div className="meeting-room__menu" role="menu">
                  <button type="button" role="menuitem" className="meeting-room__menu-item show-sm" onClick={() => { togglePanel('participants'); setMoreOpen(false); }}>
                    <Icon name="users" size={16} /> {t('Participants')}
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={() => { togglePanel('files'); setMoreOpen(false); }}>
                    <Icon name="file" size={16} /> {t('Files')}
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={() => { togglePanel('notes'); setMoreOpen(false); }}>
                    <Icon name="note" size={16} /> {t('Notes & Action Items')}
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={() => { togglePanel('polls'); setMoreOpen(false); }}>
                    <Icon name="bar-chart" size={16} /> {t('Polls')}
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={room.toggleNoise} aria-pressed={room.noiseOn}>
                    <Icon name="mic" size={16} /> {t('Noise isolation')}
                    <span className="badge badge-neutral" style={{ marginInlineStart: 'auto' }}>{room.noiseOn ? t('On') : t('Off')}</span>
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={room.toggleSpeakers} aria-pressed={room.speakersMuted} title={t('Turn off if another participant is sitting next to you')}>
                    <Icon name="volume" size={16} /> {t('Speakers off (same room)')}
                    <span className="badge badge-neutral" style={{ marginInlineStart: 'auto' }}>{room.speakersMuted ? t('On') : t('Off')}</span>
                  </button>
                  <button type="button" role="menuitem" className="meeting-room__menu-item" onClick={() => { togglePanel('recordings'); setMoreOpen(false); }}>
                    <Icon name="record-dot" size={16} style={room.activeRecording ? { color: '#ef4444' } : undefined} /> {t('Recordings')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <span className="meeting-room__divider" aria-hidden="true" />

          <button type="button" className="meeting-room__leave" onClick={handleLeave} title={t('Leave Meeting')} aria-label={t('Leave Meeting')}>
            <Icon name="logout" size={18} />
            <span>{t('Leave')}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

/** One control-bar button: round icon with a short label underneath (the label hides on narrow screens). */
function DockButton({ icon, label, title, state = '', onClick, disabled = false, badge = null, dot = false, className = '' }) {
  return (
    <button
      type="button"
      className={`meeting-room__dock-btn ${state} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
    >
      <span className="meeting-room__dock-ico">
        <Icon name={icon} size={20} />
        {badge ? <span className="meeting-room__badge-dot">{badge}</span> : null}
        {dot ? <span className="meeting-room__rec-dot" /> : null}
      </span>
      <span className="meeting-room__dock-label">{label}</span>
    </button>
  );
}
