import { useCallback, useEffect, useRef, useState } from 'react';
import { createMeetingEcho, presenceChannelName, personalChannelName, signalingApi, chatApi, hostControlApi, filesApi, notesApi, pollsApi, recordingsApi } from '../lib/meetingSignaling';

/**
 * Round 3 (Signaling) + Round 4 (WebRTC Core). Owns:
 *  - the local camera/mic MediaStream,
 *  - one RTCPeerConnection per other participant (mesh — every browser
 *    talks to every other browser directly, capped at
 *    MeetingPolicyService::maxMeshParticipants(), surfaced here as
 *    `meshCapacity` from GET .../roster),
 *  - the presence-channel subscription that tells us who else is here,
 *  - and SDP offer/answer/ICE-candidate exchange over that same channel's
 *    client events (`whisper`) — never through Laravel at all, per
 *    config/webrtc.php's docblock.
 *
 * Signaling glare avoidance: whoever *joins* second is the one who
 * offers. `here()` fires once, right after we join, with everyone
 * already in the room — we offer to each of them (we're the new
 * arrival). `joining()` fires later for people who arrive after us — we
 * do NOT offer to them (they'll offer to us, since from their `here()`
 * we're an existing member). This one-directional rule means no two
 * peers ever race to send simultaneous offers to each other.
 *
 * `guestToken` is null for a signed-in participant (Bearer token on the
 * `api` client covers auth) and the guest's short-lived token
 * (MeetingLobbyService::issueGuestToken) for a guest — every REST/whisper
 * call below just threads it through, same as Round 2's lobby calls.
 *
 * Round 5 (Live Collaboration) additions — بند 7/8 (Chat, public +
 * private), بند 11 (Raise Hand + ephemeral Reactions), بند 9 (Screen
 * Sharing host policies). Chat/hand/reaction/screen-share-policy events
 * all ride the *same* presence channel this hook already joins for
 * Round 3/4 (no second subscription there) — the one addition is a
 * private per-actor "inbox" channel (personalChannelName()) for private
 * chat messages addressed to us specifically (see
 * MeetingChatService::broadcast()'s docblock for why a private message
 * never touches the public presence channel at all).
 *
 * `isHost` gates the screen-share host-policy actions client-side (the
 * buttons simply don't render for non-hosts) — the backend is the real
 * authority and re-checks role on every one of those calls regardless
 * (MeetingSignalingService::setScreenSharingLock() and friends).
 *
 * Round 6 (Host Controls) additions — بند 5 (Participants Panel:
 * mute/disable-camera/remove/promote/demote/transfer-host/lock). `myRole`
 * tracks the local actor's own role live ('host'|'co_host'|'participant'
 * — a guest is never a manager, so it's never 'guest' here), seeded from
 * the `isHost` prop and kept current by the `.participant.role_changed`/
 * `.meeting.host_transferred` listeners below whenever *we* are the
 * target (promoted/demoted/handed the host role by someone else — the
 * same events patch other participants' `role` field in the
 * `participants` map when *they're* the target instead). `isManager`
 * (host or co-host) mirrors MeetingPolicyService::canManage() exactly —
 * gates mute/disable-camera/remove(non-co-host)/lock; the stricter
 * primary-host-only actions (remove a co-host, promote, demote, transfer
 * host) are gated with `myRole === 'host'` directly at the call site
 * instead, same asymmetry as MeetingHostControlService's own
 * requireManager()-vs-requirePrimaryHost() split. As with the screen-
 * share policies, the backend re-checks all of this regardless — these
 * are UI affordances only.
 *
 * Round 7 (Collaboration Extras) additions — بند 19 (File Sharing), بند
 * 20 (Meeting Notes + Action Items), بند 21 (Polls). All three fetch
 * their initial snapshot alongside roster/chat in `setup()` below, then
 * stay live off the same presence channel (no extra subscription, same
 * pattern as every Round 5/6 addition). Notes body edits and every
 * action-item/poll write are `isManager`-gated client-side exactly like
 * `myRole`/`isManager` above — MeetingNotesService/MeetingPollService
 * re-check on the backend regardless, these are UI affordances only.
 * Voting and file sharing themselves are open to any actor present
 * (including a guest) — only *creating/closing* a poll, *editing* notes/
 * action items, and *deleting someone else's file* are manager-gated.
 *
 * Round 9 (Recording) addition — بند 18. "Client-side recording as a
 * practical temporary solution (without SFU)" (see
 * MeetingRecordingService's own docblock): there is no media server
 * compositing anything, so *this browser* — specifically, whichever
 * manager's browser called `startRecording()` — renders every visible
 * tile onto a hidden `<canvas>` (mirroring MeetingRoomShell's own grid,
 * redrawn every animation frame off the *live* `participants`/
 * `localStream` state so newly-joined participants appear without
 * restarting anything) and mixes every stream's audio through a Web
 * Audio graph, `canvas.captureStream()` + the mixed audio track feed a
 * single `MediaRecorder`. Start/stop of the *server-side row*
 * (recordingsApi.start/stop, who may see the "Recording" indicator,
 * status transitions) is real-time for everyone via the presence
 * channel exactly like files/notes/polls above — but the recorded
 * bytes only ever exist in the browser that's actually running the
 * MediaRecorder, so `stopRecordingLocal()` (the one that uploads the
 * finished Blob) only ever makes sense from that same browser
 * (`isRecordingLocally`) — a *different* co-host sees the "Recording…"
 * indicator like everyone else but has no local Blob to stop with, so
 * RecordingsPanel doesn't offer them a stop button (see its own
 * docblock).
 */
export function useMeetingRoom({
  meetingUuid, guestToken = null, myKey, myDisplayName, deviceDefaults,
  isHost = false, screenSharingLockedInitial = false, chatEnabledInitial = true,
}) {
  const [participants, setParticipants] = useState({}); // key -> {displayName, role, isHost, isGuest, micEnabled, cameraEnabled, screenSharing, handRaised, screenShareAllowed, connectionState, connectionQuality, remoteStream}
  const [localStream, setLocalStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(!(deviceDefaults?.mute_on_entry ?? false));
  const [cameraEnabled, setCameraEnabled] = useState(deviceDefaults?.camera_on_entry ?? true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [meshCapacity, setMeshCapacity] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | connected | error
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // transient toast-style message (e.g. "the host stopped your screen share")
  const [meetingStatus, setMeetingStatus] = useState(null);

  // Round 5 — بند 7/8 (Chat).
  const [chatMessages, setChatMessages] = useState([]); // ascending by id, already filtered server-side to what we're allowed to see
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  // مفيش listener لـ "allow_chat اتغيّر لايف" في الأحداث المتاحة في Round 5 —
  // الهوست بيقدر يبدّلها بس من Meeting Settings (خارج غرفة الاجتماع نفسها)،
  // فمفيش setter هنا لحد ما Round 6 (Host Controls) يضيف الحدث اللايف ده.
  const [chatEnabled] = useState(chatEnabledInitial);

  // Round 5 — بند 11 (Raise Hand + Reactions).
  const [handRaised, setHandRaised] = useState(false);
  const [reactions, setReactions] = useState([]); // ephemeral: [{id, key, displayName, type, emoji}], auto-pruned

  // Round 5 — بند 9 (Screen Sharing host policies).
  const [screenSharingLocked, setScreenSharingLocked] = useState(!!screenSharingLockedInitial);
  const [myScreenShareAllowed, setMyScreenShareAllowed] = useState(null); // tri-state override: null=no override

  // Round 6 — بند 5 (Host Controls / Participants Panel).
  const [myRole, setMyRole] = useState(isHost ? 'host' : 'participant'); // 'host' | 'co_host' | 'participant' — see docblock above for why co-host isn't seeded here
  const [meetingLocked, setMeetingLocked] = useState(false); // "Lock meeting" — blocks new joiners; doesn't affect anyone already in
  const [kicked, setKicked] = useState(null); // {byDisplayName} once WE were removed by a host/co-host — MeetingRoomShell renders a dedicated screen for this

  // Round 7 — بند 19 (File Sharing).
  const [files, setFiles] = useState([]); // descending by created_at isn't guaranteed server-side, so appended/removed in place instead of re-sorted

  // Round 7 — بند 20 (Meeting Notes + Action Items).
  const [notes, setNotes] = useState({ body: '', lastEditedByDisplayName: null, lastEditedAt: null });
  const [actionItems, setActionItems] = useState([]);

  // Round 7 — بند 21 (Polls). keyed by poll_id so `.listen('.meeting.poll_*')` can patch a single entry in place.
  const [polls, setPolls] = useState([]);

  // Round 9 — بند 18 (Recording). `recordings` mirrors the server-side rows
  // for everyone (status only); `isRecordingLocally` is true only in the
  // one browser actually running the MediaRecorder — see docblock above.
  const [recordings, setRecordings] = useState([]);
  const [isRecordingLocally, setIsRecordingLocally] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingError, setRecordingError] = useState(null);
  const localRecorderRef = useRef(null); // { id, kind, mediaRecorder, chunks, canvas, ctx, rafId, audioCtx, audioDest, audioSources: Map }
  const videoElsRef = useRef(new Map()); // key -> hidden <video>, kept in sync with localStream/participants[*].remoteStream regardless of whether a recording is running
  const hiddenContainerRef = useRef(null);
  const participantsRef = useRef({}); // live mirror of `participants` state, read from the rAF draw loop / audio reconnection below (both run outside React's render cycle)

  const echoRef = useRef(null);
  const channelRef = useRef(null);
  const personalChannelRef = useRef(null);
  const peersRef = useRef({}); // key -> RTCPeerConnection
  const pendingCandidatesRef = useRef({}); // key -> RTCIceCandidateInit[] queued before remote description is set
  const localStreamRef = useRef(null);
  const cameraTrackSendersRef = useRef({}); // key -> RTCRtpSender, for screen-share track swapping
  const iceServersRef = useRef([]);
  const leftRef = useRef(false);
  const seenChatIdsRef = useRef(new Set()); // dedupe — the sender gets their own message from the REST response, but also rides the same broadcast as everyone else on the presence channel (Round 5's ChatMessageSent doesn't use toOthers())
  const reactionSeqRef = useRef(0);

  const patchParticipant = useCallback((key, patch) => {
    setParticipants((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  }, []);

  const appendChatMessage = useCallback((message) => {
    if (seenChatIdsRef.current.has(message.id)) return;
    seenChatIdsRef.current.add(message.id);
    setChatMessages((prev) => [...prev, message]);
  }, []);

  const applyChatReactionChange = useCallback((messageId, actorKey, emoji, added) => {
    setChatMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions.map((r) => ({ ...r, actor_keys: [...r.actor_keys] }));
      let entry = reactions.find((r) => r.emoji === emoji);
      if (added) {
        if (!entry) { entry = { emoji, count: 0, actor_keys: [] }; reactions.push(entry); }
        if (!entry.actor_keys.includes(actorKey)) { entry.actor_keys.push(actorKey); entry.count++; }
      } else if (entry) {
        entry.actor_keys = entry.actor_keys.filter((k) => k !== actorKey);
        entry.count = entry.actor_keys.length;
      }
      return { ...m, reactions: reactions.filter((r) => r.count > 0) };
    }));
  }, []);


  // ---- بند 18 (Recording) — hidden compositing surface -------------------
  // Kept current at all times (not just while a recording is running) so
  // starting a recording never has to wait on a first sync, and a
  // participant joining mid-recording is picked up by the very next
  // animation frame with no special-casing.
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(div);
    hiddenContainerRef.current = div;
    return () => {
      videoElsRef.current.forEach((el) => { el.srcObject = null; });
      videoElsRef.current.clear();
      div.remove();
      hiddenContainerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wanted = new Map();
    if (localStream) wanted.set('local', localStream);
    Object.entries(participants).forEach(([key, p]) => { if (p.remoteStream) wanted.set(key, p.remoteStream); });

    for (const [key, el] of videoElsRef.current) {
      if (!wanted.has(key)) {
        el.srcObject = null;
        el.remove();
        videoElsRef.current.delete(key);
      }
    }
    wanted.forEach((stream, key) => {
      let el = videoElsRef.current.get(key);
      if (!el) {
        el = document.createElement('video');
        el.autoplay = true;
        el.playsInline = true;
        el.muted = true; // audio is captured separately through the Web Audio graph below — playing it here too would double it up in the recording
        hiddenContainerRef.current?.appendChild(el);
        videoElsRef.current.set(key, el);
      }
      if (el.srcObject !== stream) el.srcObject = stream;
      el.play?.().catch(() => {});
    });
  }, [localStream, participants]);

  /** Re-syncs the Web Audio mix to whoever's actually here right now — called once at recording start, then again whenever `participants`/`localStream` change while a recording is running. */
  const syncRecordingAudioGraph = useCallback(() => {
    const rec = localRecorderRef.current;
    if (!rec || !rec.audioCtx) return;
    const wanted = new Map();
    if (localStreamRef.current) wanted.set('local', localStreamRef.current);
    Object.entries(participantsRef.current).forEach(([key, p]) => { if (p.remoteStream) wanted.set(key, p.remoteStream); });

    for (const [key, node] of rec.audioSources) {
      if (!wanted.has(key)) {
        try { node.disconnect(); } catch { /* already disconnected */ }
        rec.audioSources.delete(key);
      }
    }
    wanted.forEach((stream, key) => {
      if (rec.audioSources.has(key)) return;
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      try {
        const src = rec.audioCtx.createMediaStreamSource(new MediaStream([track]));
        src.connect(rec.audioDest);
        rec.audioSources.set(key, src);
      } catch { /* a track that's already ended, etc. — skip it, the rest of the mix still works */ }
    });
  }, []);

  useEffect(() => {
    if (isRecordingLocally) syncRecordingAudioGraph();
  }, [isRecordingLocally, participants, localStream, syncRecordingAudioGraph]);

  const drawRecordingFrame = useCallback(() => {
    const rec = localRecorderRef.current;
    if (!rec) return;
    const { ctx, canvas } = rec;
    const entries = Array.from(videoElsRef.current.entries()).filter(([, el]) => el.readyState >= 2 && el.videoWidth > 0);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const n = entries.length || 1;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    entries.forEach(([, el], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const scale = Math.min(cellW / el.videoWidth, cellH / el.videoHeight);
      const dw = el.videoWidth * scale;
      const dh = el.videoHeight * scale;
      const dx = col * cellW + (cellW - dw) / 2;
      const dy = row * cellH + (cellH - dh) / 2;
      try { ctx.drawImage(el, dx, dy, dw, dh); } catch { /* a mid-frame track swap can throw once, harmless — next frame recovers */ }
    });
    rec.rafId = requestAnimationFrame(drawRecordingFrame);
  }, []);

  function pickRecorderMimeType() {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus', 'audio/webm'];
    return candidates.find((c) => window.MediaRecorder?.isTypeSupported?.(c)) || '';
  }

  const teardownLocalRecorder = useCallback(() => {
    const rec = localRecorderRef.current;
    if (!rec) return;
    if (rec.rafId) cancelAnimationFrame(rec.rafId);
    rec.audioSources.forEach((node) => { try { node.disconnect(); } catch { /* already disconnected */ } });
    try { rec.audioCtx?.close(); } catch { /* already closed */ }
    rec.captureStream?.getTracks().forEach((t) => t.stop());
    localRecorderRef.current = null;
    setIsRecordingLocally(false);
  }, []);

  /** Manager-only (re-checked server-side by MeetingRecordingService::requireManager) — starts the server-side row, then this browser's own capture (see docblock above for why the two are separate). */
  const startRecording = useCallback(async (kind = 'video') => {
    if (localRecorderRef.current || recordingBusy) return;
    setRecordingBusy(true);
    setRecordingError(null);
    try {
      const json = await recordingsApi.start(meetingUuid, guestToken, kind);
      const recordingId = json.data.id;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioDest = audioCtx.createMediaStreamDestination();

      let canvas = null;
      let ctx = null;
      let captureStream;
      if (kind === 'audio') {
        captureStream = new MediaStream(audioDest.stream.getAudioTracks());
      } else {
        canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        ctx = canvas.getContext('2d');
        const canvasStream = canvas.captureStream(15);
        captureStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
      }

      localRecorderRef.current = { id: recordingId, kind, canvas, ctx, audioCtx, audioDest, audioSources: new Map(), captureStream, rafId: null };
      if (kind !== 'audio') localRecorderRef.current.rafId = requestAnimationFrame(drawRecordingFrame);
      syncRecordingAudioGraph();

      const mimeType = pickRecorderMimeType();
      const mediaRecorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      localRecorderRef.current.mediaRecorder = mediaRecorder;
      localRecorderRef.current.chunks = chunks;
      localRecorderRef.current.mimeType = mediaRecorder.mimeType || mimeType || 'video/webm';
      mediaRecorder.start(1000);
      setIsRecordingLocally(true);
    } catch (err) {
      teardownLocalRecorder();
      setRecordingError(err?.message || 'Recording could not be started.');
      throw err;
    } finally {
      setRecordingBusy(false);
    }
  }, [meetingUuid, guestToken, recordingBusy, drawRecordingFrame, syncRecordingAudioGraph, teardownLocalRecorder]);

  /** Stops *this browser's* MediaRecorder and uploads the finished Blob — only meaningful when `isRecordingLocally` (see docblock above). */
  const stopRecordingLocal = useCallback(async () => {
    const rec = localRecorderRef.current;
    if (!rec?.mediaRecorder) return;
    setRecordingBusy(true);
    setRecordingError(null);
    try {
      const blob = await new Promise((resolve) => {
        rec.mediaRecorder.addEventListener('stop', () => resolve(new Blob(rec.chunks, { type: rec.mimeType })), { once: true });
        rec.mediaRecorder.stop();
      });
      const json = await recordingsApi.stop(meetingUuid, guestToken, rec.id, blob, `recording-${rec.id}.webm`);
      setRecordings((prev) => (prev.some((r) => r.id === json.data.id) ? prev.map((r) => (r.id === json.data.id ? json.data : r)) : [...prev, json.data]));
    } catch (err) {
      setRecordingError(err?.message || 'The recording could not be uploaded.');
      throw err;
    } finally {
      teardownLocalRecorder();
      setRecordingBusy(false);
    }
  }, [meetingUuid, guestToken, teardownLocalRecorder]);

  const deleteRecording = useCallback((recordingId) => {
    return recordingsApi.destroy(meetingUuid, guestToken, recordingId).then(() => {
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    });
  }, [meetingUuid, guestToken]);


  // ---- peer connection lifecycle --------------------------------------
  const closePeer = useCallback((key) => {
    peersRef.current[key]?.close();
    delete peersRef.current[key];
    delete pendingCandidatesRef.current[key];
    delete cameraTrackSendersRef.current[key];
  }, []);

  const createPeer = useCallback((key) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current[key] = pc;
    pendingCandidatesRef.current[key] = [];

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStreamRef.current);
        if (track.kind === 'video') cameraTrackSendersRef.current[key] = sender;
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channelRef.current?.whisper('signal', { to: key, from: myKey, kind: 'ice', data: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      patchParticipant(key, { remoteStream: e.streams[0] || null });
    };

    pc.onconnectionstatechange = () => {
      const mapped = { connected: 'connected', connecting: 'connecting', new: 'connecting', disconnected: 'reconnecting', failed: 'disconnected', closed: 'disconnected' }[pc.connectionState] || 'connecting';
      patchParticipant(key, { connectionState: mapped });
      if (pc.connectionState === 'failed') {
        signalingApi.reportFailure(meetingUuid, guestToken, 'webrtc', `Peer connection to ${key} failed.`).catch(() => {});
      }
    };

    return pc;
  }, [meetingUuid, guestToken, myKey, patchParticipant]);

  const offerTo = useCallback(async (key) => {
    const pc = createPeer(key);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.whisper('signal', { to: key, from: myKey, kind: 'offer', data: offer });
  }, [createPeer, myKey]);

  const handleSignal = useCallback(async ({ to, from, kind, data }) => {
    if (to !== myKey || from === myKey) return;

    if (kind === 'offer') {
      const pc = peersRef.current[from] || createPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const queued = pendingCandidatesRef.current[from] || [];
      pendingCandidatesRef.current[from] = [];
      for (const cand of queued) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channelRef.current?.whisper('signal', { to: from, from: myKey, kind: 'answer', data: answer });
    } else if (kind === 'answer') {
      const pc = peersRef.current[from];
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const queued = pendingCandidatesRef.current[from] || [];
      pendingCandidatesRef.current[from] = [];
      for (const cand of queued) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    } else if (kind === 'ice') {
      const pc = peersRef.current[from];
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current[from] = pendingCandidatesRef.current[from] || [];
        pendingCandidatesRef.current[from].push(data);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
    }
  }, [myKey, createPeer]);

  // ---- setup: local media, ICE servers, roster, presence channel -------
  useEffect(() => {
    let cancelled = false;
    leftRef.current = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        stream.getVideoTracks().forEach((t) => { t.enabled = cameraEnabled; });
        stream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        signalingApi.reportFailure(meetingUuid, guestToken, 'camera', 'getUserMedia failed in the meeting room.').catch(() => {});
        // Still proceed audio/video-less — a participant with devices
        // denied should still be able to see + hear everyone else.
      }

      try {
        const [iceJson, rosterJson, chatJson, filesJson, notesJson, itemsJson, pollsJson, recordingsJson] = await Promise.all([
          signalingApi.iceServers(meetingUuid, guestToken),
          signalingApi.roster(meetingUuid, guestToken),
          chatApi.list(meetingUuid, guestToken).catch(() => ({ data: { messages: [] } })), // chat disabled or transient failure shouldn't block joining the room
          filesApi.list(meetingUuid, guestToken).catch(() => ({ data: { files: [] } })),
          notesApi.show(meetingUuid, guestToken).catch(() => ({ data: { body: '', last_edited_by_display_name: null, last_edited_at: null } })),
          notesApi.listItems(meetingUuid, guestToken).catch(() => ({ data: { action_items: [] } })),
          pollsApi.list(meetingUuid, guestToken).catch(() => ({ data: { polls: [] } })),
          recordingsApi.list(meetingUuid, guestToken).catch(() => ({ data: { recordings: [] } })),
        ]);
        if (cancelled) return;
        iceServersRef.current = iceJson.data.ice_servers || [];
        setMeshCapacity(rosterJson.data.mesh_capacity || null);
        setFiles(filesJson.data?.files || []);
        setNotes({
          body: notesJson.data?.body || '',
          lastEditedByDisplayName: notesJson.data?.last_edited_by_display_name || null,
          lastEditedAt: notesJson.data?.last_edited_at || null,
        });
        setActionItems(itemsJson.data?.action_items || []);
        setPolls(pollsJson.data?.polls || []);
        setRecordings(recordingsJson.data?.recordings || []);

        const seeded = {};
        (rosterJson.data.roster || []).forEach((p) => {
          if (p.key === myKey) return;
          seeded[p.key] = {
            displayName: p.display_name,
            role: p.role,
            isHost: p.is_host,
            isGuest: p.type === 'guest',
            micEnabled: p.mic_enabled,
            cameraEnabled: p.camera_enabled,
            screenSharing: p.screen_sharing,
            handRaised: p.hand_raised,
            screenShareAllowed: p.screen_share_allowed,
            connectionState: 'connecting',
            connectionQuality: p.connection_quality || 'good',
            remoteStream: null,
          };
        });
        setParticipants(seeded);

        (chatJson.data?.messages || []).forEach((m) => {
          seenChatIdsRef.current.add(m.id);
        });
        setChatMessages(chatJson.data?.messages || []);
      } catch (err) {
        if (!cancelled) { setError(err); setStatus('error'); }
        return;
      }

      if (cancelled) return;

      const echo = createMeetingEcho(meetingUuid, guestToken);
      echoRef.current = echo;
      const channel = echo.join(presenceChannelName(meetingUuid));
      channelRef.current = channel;

      // بند 8 — الإنبوكس الشخصي بتاعنا، للرسائل الخاصة اللي وصلانا بس
      // (راجع docblock MeetingChatService::broadcast()). private() هنا
      // بيضيف الـ 'private-' prefix تلقائيًا زي join() بيضيف 'presence-'.
      const personalChannel = echo.private(personalChannelName(meetingUuid, myKey));
      personalChannelRef.current = personalChannel;
      personalChannel.listen('.chat.message.sent', (e) => {
        appendChatMessage(e);
        setChatUnreadCount((n) => n + 1);
      });

      channel
        .here((members) => {
          setStatus('connected');
          members.forEach((m) => {
            if (m.id === myKey) return;
            setParticipants((prev) => ({
              ...prev,
              [m.id]: prev[m.id] || {
                displayName: m.info?.name || m.id, role: m.info?.role || 'participant', isHost: m.info?.role === 'host',
                isGuest: !!m.info?.is_guest, micEnabled: true, cameraEnabled: true, screenSharing: false, handRaised: false,
                screenShareAllowed: null, connectionState: 'connecting', connectionQuality: 'good', remoteStream: null,
              },
            }));
            offerTo(m.id);
          });
        })
        .joining((m) => {
          if (m.id === myKey) return;
          setParticipants((prev) => ({
            ...prev,
            [m.id]: prev[m.id] || {
              displayName: m.info?.name || m.id, role: m.info?.role || 'participant', isHost: m.info?.role === 'host',
              isGuest: !!m.info?.is_guest, micEnabled: true, cameraEnabled: true, screenSharing: false, handRaised: false,
              screenShareAllowed: null, connectionState: 'connecting', connectionQuality: 'good', remoteStream: null,
            },
          }));
          // They initiate — we just wait for their offer (see docblock).
        })
        .leaving((m) => {
          closePeer(m.id);
          setParticipants((prev) => {
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
        })
        .listenForWhisper('signal', handleSignal)
        .listen('.media.state.changed', (e) => {
          patchParticipant(e.participant_key, { micEnabled: e.mic_enabled, cameraEnabled: e.camera_enabled, screenSharing: e.screen_sharing });
        })
        .listen('.connection.state.changed', (e) => {
          patchParticipant(e.participant_key, { connectionState: e.connection_state });
        })
        .listen('.connection.quality.changed', (e) => {
          patchParticipant(e.participant_key, { connectionQuality: e.connection_quality });
        })
        .listen('.participant.left', (e) => {
          closePeer(e.participant_key);
          setParticipants((prev) => {
            const next = { ...prev };
            delete next[e.participant_key];
            return next;
          });
        })
        .listen('.meeting.status.changed', (e) => {
          setMeetingStatus(e.status);
        })
        // Round 5 — بند 7 (الشات العام بيتبعت هنا؛ الخاص على الإنبوكس
        // الشخصي فوق). المرسِل نفسه بياخد نسخته من رد REST المباشر
        // (راجع sendChatMessage) — الـ dedupe في appendChatMessage بيمنع
        // التكرار لو الـ broadcast رجع لنفس السوكيت كمان.
        .listen('.chat.message.sent', (e) => {
          appendChatMessage(e);
          if (e.sender_key !== myKey) setChatUnreadCount((n) => n + 1);
        })
        .listen('.chat.message.reaction_changed', (e) => {
          applyChatReactionChange(e.message_id, e.actor_key, e.emoji, e.added);
        })
        // Round 5 — بند 11 (Raise Hand + Reactions).
        .listen('.hand.raised', (e) => {
          if (e.participant_key === myKey) return; // حالتي أنا بتتحدث محليًا في toggleHand مباشرة
          patchParticipant(e.participant_key, { handRaised: e.raised, handRaisedAt: e.hand_raised_at });
        })
        .listen('.reaction.sent', (e) => {
          reactionSeqRef.current += 1;
          const id = reactionSeqRef.current;
          setReactions((prev) => [...prev, { id, key: e.participant_key, displayName: e.display_name, type: e.type, emoji: e.emoji }]);
          setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3000);
        })
        // Round 5 — بند 9 (Screen Sharing host policies).
        .listen('.screen_share.policy.changed', (e) => {
          setScreenSharingLocked(e.locked);
        })
        .listen('.screen_share.participant_policy.changed', (e) => {
          if (e.participant_key === myKey) {
            setMyScreenShareAllowed(e.allowed);
          } else {
            patchParticipant(e.participant_key, { screenShareAllowed: e.allowed });
          }
        })
        .listen('.screen_share.force_stopped', (e) => {
          if (e.participant_key === myKey) {
            stopScreenShareTrackRef.current?.(true);
            setNotice({ type: 'screen_share_force_stopped', by: e.stopped_by_display_name });
          }
        })
        // Round 6 — بند 5 (Host Controls / Participants Panel).
        .listen('.meeting.lock_changed', (e) => {
          setMeetingLocked(e.locked);
        })
        .listen('.participant.muted_by_host', (e) => {
          if (e.participant_key !== myKey) return; // other participants' mic state already rides .media.state.changed above
          localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
          setMicEnabled(false);
          setNotice({ type: 'muted_by_host', by: e.muted_by_display_name });
        })
        .listen('.participant.camera_disabled_by_host', (e) => {
          if (e.participant_key !== myKey) return;
          localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = false; });
          setCameraEnabled(false);
          setNotice({ type: 'camera_disabled_by_host', by: e.disabled_by_display_name });
        })
        .listen('.participant.removed', (e) => {
          if (e.participant_key === myKey) {
            leftRef.current = true; // نحن اتشلنا بالفعل من meeting_participants سيرفر-سايد — leave() على unmount هيبقى no-op مضر لو اتبعت
            setKicked({ byDisplayName: e.removed_by_display_name });
            return;
          }
          closePeer(e.participant_key);
          setParticipants((prev) => {
            const next = { ...prev };
            delete next[e.participant_key];
            return next;
          });
        })
        .listen('.participant.role_changed', (e) => {
          if (e.participant_key === myKey) {
            setMyRole(e.new_role);
          } else {
            patchParticipant(e.participant_key, { role: e.new_role, isHost: e.new_role === 'host' });
          }
        })
        .listen('.meeting.host_transferred', (e) => {
          if (e.new_host_key === myKey) setMyRole('host');
          else if (e.previous_host_key === myKey) setMyRole('co_host');
          if (e.new_host_key !== myKey) patchParticipant(e.new_host_key, { role: 'host', isHost: true });
          if (e.previous_host_key !== myKey) patchParticipant(e.previous_host_key, { role: 'co_host', isHost: false });
        })
        // Round 7 — بند 19 (File Sharing).
        .listen('.meeting.file_shared', (e) => {
          setFiles((prev) => (prev.some((f) => f.id === e.file_id) ? prev : [...prev, {
            id: e.file_id, original_name: e.original_name, uploader_key: e.uploader_key, uploader_display_name: e.uploader_display_name,
            // download_url/extension/mime_type/size_bytes/created_at aren't in the broadcast payload
            // (see MeetingFileShared::broadcastWith()) — a full re-fetch isn't worth it for a live
            // notification the uploader's own REST response already covers for their own row.
          }]));
        })
        .listen('.meeting.file_removed', (e) => {
          setFiles((prev) => prev.filter((f) => f.id !== e.file_id));
        })
        // Round 7 — بند 20 (Meeting Notes + Action Items).
        .listen('.meeting.notes_updated', (e) => {
          setNotes({ body: e.body, lastEditedByDisplayName: e.edited_by_display_name, lastEditedAt: null });
        })
        .listen('.meeting.action_item_changed', (e) => {
          setActionItems((prev) => {
            if (e.action === 'deleted') return prev.filter((it) => it.id !== e.item_id);
            if (e.action === 'created') return prev.some((it) => it.id === e.item_id) ? prev : [...prev, e.item];
            return prev.map((it) => (it.id === e.item_id ? e.item : it));
          });
        })
        // Round 7 — بند 21 (Polls).
        .listen('.meeting.poll_created', (e) => {
          setPolls((prev) => (prev.some((p) => p.poll_id === e.poll.poll_id) ? prev : [...prev, e.poll]));
        })
        .listen('.meeting.poll_results_updated', (e) => {
          setPolls((prev) => prev.map((p) => (p.poll_id === e.poll_id ? e.results : p)));
        })
        .listen('.meeting.poll_closed', (e) => {
          setPolls((prev) => prev.map((p) => (p.poll_id === e.poll_id ? e.results : p)));
        })
        // Round 9 — بند 18 (Recording). "Recording must be clearly
        // indicated to all participants" — every one of these three
        // reaches everyone in the room (never toOthers(), same as every
        // Round 5-7 event), including the manager who clicked start/
        // stop themselves. broadcastWith() on all three is deliberately
        // thin (id/kind/status only) — the full row (original_name,
        // download_url, duration, etc.) only matters once `completed`,
        // and by then a plain re-fetch would be as much code as trying
        // to reconstruct it from three different partial payloads; a
        // manager reopening RecordingsPanel gets the full row for free
        // from `recordingsApi.list` next time regardless. So `.file`
        // fields simply stay undefined here for other participants — the
        // *uploader's own* browser (see stopRecordingLocal below) has
        // already patched its own row directly from the REST response.
        .listen('.meeting.recording_started', (e) => {
          setRecordings((prev) => (prev.some((r) => r.id === e.recording_id) ? prev : [...prev, {
            id: e.recording_id, kind: e.kind, status: 'recording',
            started_by_key: e.started_by_key, started_by_display_name: e.started_by_display_name,
          }]));
        })
        .listen('.meeting.recording_stopped', (e) => {
          setRecordings((prev) => prev.map((r) => (r.id === e.recording_id ? { ...r, status: e.status } : r)));
        })
        .listen('.meeting.recording_ready', (e) => {
          setRecordings((prev) => prev.map((r) => (r.id === e.recording_id ? { ...r, status: e.status } : r)));
          // A completed/failed row's download_url/size/etc aren't in this
          // payload either (see comment above) — refresh the one row so
          // "Download" actually has a URL without waiting for the panel
          // to be reopened.
          if (e.status === 'completed') {
            recordingsApi.list(meetingUuid, guestToken).then((json) => {
              setRecordings(json.data?.recordings || []);
            }).catch(() => {});
          }
        })
        .error((err) => {
          if (!cancelled) { setError(err); setStatus('error'); }
        });
    }

    setup();

    return () => {
      cancelled = true;
      Object.keys(peersRef.current).forEach(closePeer);
      channelRef.current?.stopListening('.media.state.changed');
      if (echoRef.current) {
        echoRef.current.leave(presenceChannelName(meetingUuid));
        echoRef.current.leave(personalChannelName(meetingUuid, myKey));
        echoRef.current.disconnect();
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      teardownLocalRecorder();
      if (!leftRef.current) signalingApi.leave(meetingUuid, guestToken).catch(() => {});
    };
    // Intentionally only re-runs if the meeting/actor identity changes —
    // toggling mic/camera/screen-share must NOT tear down the socket or
    // any peer connection (see the dedicated effects/callbacks below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingUuid, guestToken, myKey]);


  // ---- بند 5 — once we're removed, tear down media/peers/sockets right
  // away instead of waiting for MeetingRoomShell to unmount us (it keeps
  // rendering the hook's owner while it shows the "removed" screen).
  useEffect(() => {
    if (!kicked) return;
    Object.keys(peersRef.current).forEach(closePeer);
    echoRef.current?.leave(presenceChannelName(meetingUuid));
    echoRef.current?.leave(personalChannelName(meetingUuid, myKey));
    echoRef.current?.disconnect();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    teardownLocalRecorder();
  }, [kicked, meetingUuid, myKey, closePeer, teardownLocalRecorder]);

  // ---- heartbeat --------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      signalingApi.heartbeat(meetingUuid, guestToken).catch(() => {});
    }, 25000);
    return () => clearInterval(timer);
  }, [meetingUuid, guestToken]);

  // ---- lightweight connection-quality sampling from getStats() ---------
  useEffect(() => {
    const timer = setInterval(async () => {
      const peers = Object.values(peersRef.current);
      if (peers.length === 0) return;
      let worst = 'excellent';
      const rank = { excellent: 0, good: 1, poor: 2, reconnecting: 3 };
      for (const pc of peers) {
        try {
          const stats = await pc.getStats();
          let rtt = null; let lost = 0; let received = 0;
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
              rtt = report.currentRoundTripTime;
            }
            if (report.type === 'inbound-rtp' && !report.isRemote) {
              lost += report.packetsLost || 0;
              received += report.packetsReceived || 0;
            }
          });
          const lossRatio = received > 0 ? lost / (received + lost) : 0;
          let quality = 'excellent';
          if (pc.connectionState !== 'connected') quality = 'reconnecting';
          else if (lossRatio > 0.08 || (rtt != null && rtt > 0.4)) quality = 'poor';
          else if (lossRatio > 0.02 || (rtt != null && rtt > 0.2)) quality = 'good';
          if (rank[quality] > rank[worst]) worst = quality;
        } catch {
          // getStats() failing on one peer shouldn't block the others.
        }
      }
      signalingApi.connectionQuality(meetingUuid, guestToken, worst).catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [meetingUuid, guestToken]);

  // ---- local controls ----------------------------------------------------
  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
      signalingApi.mediaState(meetingUuid, guestToken, { mic_enabled: next }).catch(() => {});
      return next;
    });
  }, [meetingUuid, guestToken]);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
      signalingApi.mediaState(meetingUuid, guestToken, { camera_enabled: next }).catch(() => {});
      return next;
    });
  }, [meetingUuid, guestToken]);

  const stopScreenShareTrackRef = useRef(null);

  // بند 9 — نفس ترتيب الأولوية بتاع MeetingSignalingService::canShareScreen()
  // بالظبط (هوست/co-host دايمًا مسموح ← منع صريح ليّا يغلب كل حاجة ← سماح
  // صريح ليّا يغلب القفل العام ← وإلا القفل العام هو الحاكم). الباك اند هو
  // الحكم الحقيقي (بيرفض mediaState/الـ toggle مايتحققش منه أصلًا)، هنا بس
  // عشان الزرار يبان معطّل بدل ما المستخدم يفتح شاشة مشاركة وتتقفله فجأة.
  const canShareScreen = isHost || myScreenShareAllowed === true || (myScreenShareAllowed !== false && !screenSharingLocked);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      stopScreenShareTrackRef.current?.();
      return;
    }
    if (!canShareScreen) {
      setNotice({ type: 'screen_share_locked' });
      return;
    }
    if (!navigator.mediaDevices.getDisplayMedia) {
      setError(new Error("This browser can't share your screen."));
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];

      await signalingApi.mediaState(meetingUuid, guestToken, { screen_sharing: true });

      Object.values(cameraTrackSendersRef.current).forEach((sender) => sender.replaceTrack(screenTrack).catch(() => {}));
      setScreenSharing(true);

      const stopSharing = () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        Object.values(cameraTrackSendersRef.current).forEach((sender) => sender.replaceTrack(cameraTrack || null).catch(() => {}));
        screenTrack.stop();
        setScreenSharing(false);
        signalingApi.mediaState(meetingUuid, guestToken, { screen_sharing: false }).catch(() => {});
        stopScreenShareTrackRef.current = null;
      };
      screenTrack.onended = stopSharing;
      stopScreenShareTrackRef.current = stopSharing;
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        setError(err instanceof Error ? err : new Error('Failed to start screen sharing.'));
      }
    }
  }, [screenSharing, canShareScreen, meetingUuid, guestToken]);

  const leave = useCallback(() => {
    leftRef.current = true;
    signalingApi.leave(meetingUuid, guestToken).catch(() => {});
  }, [meetingUuid, guestToken]);

  const clearNotice = useCallback(() => setNotice(null), []);

  // ---- بند 7/8 (Chat) ----------------------------------------------------
  // recipientKey=null → رسالة عامة. الرد المباشر من REST بيتضاف فورًا
  // (appendChatMessage بيتكفل بمنع التكرار لما نفس الرسالة ترجع تاني عبر
  // الـ broadcast — راجع docblock appendChatMessage وseenChatIdsRef فوق).
  const sendChatMessage = useCallback(async (body, { recipientKey = null, replyToMessageId = null, mentionedKeys = null } = {}) => {
    const trimmed = (body || '').trim();
    if (!trimmed) return;
    const json = await chatApi.send(meetingUuid, guestToken, {
      body: trimmed,
      recipient_key: recipientKey,
      reply_to_message_id: replyToMessageId,
      mentioned_keys: mentionedKeys,
    });
    appendChatMessage(json.data);
  }, [meetingUuid, guestToken, appendChatMessage]);

  // فورية (optimistic) — الـ toggle ده نفس منطق toggleReaction في الباك
  // اند (نفس الإيموجي من نفس الشخص تاني بيشيلها)، فبنحسب النتيجة محليًا
  // فورًا بدل ما نستنى الـ broadcast، ثم الـ .chat.message.reaction_changed
  // listener فوق بيثبّت/يصحح الحالة لما يوصل (بما فيه نسختنا إحنا،
  // مفيش toOthers() في الباك اند).
  const reactToChatMessage = useCallback((messageId, emoji) => {
    chatApi.react(meetingUuid, guestToken, messageId, emoji).catch(() => {});
  }, [meetingUuid, guestToken]);

  const markChatRead = useCallback(() => setChatUnreadCount(0), []);

  // ---- بند 11 (Raise Hand + Reactions) -----------------------------------
  // بنحدّث حالتنا محليًا فورًا (الـ .hand.raised listener فوق بيتجاهل
  // eventنا الراجع لنفسنا عمدًا — راجع الدوكبلوك هناك) بدل ما نستنى رحلة
  // socket كاملة عشان الزرار يحس إنه استجاب فورًا.
  const toggleHand = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      signalingApi.hand(meetingUuid, guestToken, next).catch(() => {
        setHandRaised(prev); // رجّعها لو الطلب فشل
      });
      return next;
    });
  }, [meetingUuid, guestToken]);

  // ephemeral بالكامل — مفيش تحديث محلي هنا، بنستنى نفس الـ broadcast اللي
  // بيوصل لكل الحاضرين (بما فيهم إحنا، راجع docblock ParticipantReactionSent)
  // عبر الـ .reaction.sent listener فوق، عشان نضمن كل الناس بتشوف نفس
  // الترتيب/التوقيت.
  const sendReaction = useCallback((type, emoji = null) => {
    signalingApi.reaction(meetingUuid, guestToken, type, emoji).catch(() => {});
  }, [meetingUuid, guestToken]);

  // ---- بند 9 (Screen Sharing host policies) — host/co-host بس -----------
  // مفيش تحديث محلي هنا برضو — .screen_share.*.changed listeners فوق
  // بتستقبل نفس الـ broadcast (مفيش toOthers() في الباك اند)، فالهوست
  // نفسه بيتحدّث بنفس المسار زي أي حد تاني.
  const setScreenSharingLock = useCallback((locked) => {
    signalingApi.screenSharePolicy(meetingUuid, guestToken, locked).catch(() => {});
  }, [meetingUuid, guestToken]);

  const setParticipantScreenShareAllowed = useCallback((participantKey, allowed) => {
    signalingApi.screenShareParticipantPolicy(meetingUuid, guestToken, participantKey, allowed).catch(() => {});
  }, [meetingUuid, guestToken]);

  const forceStopScreenShare = useCallback((participantKey) => {
    signalingApi.screenShareStop(meetingUuid, guestToken, participantKey).catch(() => {});
  }, [meetingUuid, guestToken]);

  // ---- بند 5 (Host Controls / Participants Panel) — host/co-host only --
  // Unlike بند 9's screen-share actions above, these return the API
  // promise itself (not swallowed with .catch(() => {})) — the
  // Participants Panel surfaces per-row errors (e.g. "Only the host can
  // remove a moderator.") rather than failing silently, since these are
  // higher-stakes, deliberate actions taken from a dedicated panel. No
  // local optimistic update here either: the backend's own broadcast
  // (never toOthers()) reaches the actor's own browser too, same as
  // every other Round 5/6 event, so state updates ride the listeners
  // above uniformly for everyone including whoever clicked the button.
  const lockMeeting = useCallback((locked) => hostControlApi.lock(meetingUuid, locked), [meetingUuid]);
  const muteParticipant = useCallback((targetKey) => hostControlApi.mute(meetingUuid, targetKey), [meetingUuid]);
  const disableParticipantCamera = useCallback((targetKey) => hostControlApi.disableCamera(meetingUuid, targetKey), [meetingUuid]);
  const removeParticipant = useCallback((targetKey) => hostControlApi.remove(meetingUuid, targetKey), [meetingUuid]);
  const promoteParticipant = useCallback((targetKey) => hostControlApi.promote(meetingUuid, targetKey), [meetingUuid]);
  const demoteParticipant = useCallback((targetKey) => hostControlApi.demote(meetingUuid, targetKey), [meetingUuid]);
  const transferHost = useCallback((targetKey) => hostControlApi.transferHost(meetingUuid, targetKey), [meetingUuid]);

  // ---- بند 19 (File Sharing) — open to any actor present ----------------
  // Local list update happens from the REST response directly (the
  // uploader's own row needs download_url/size_bytes/etc, which the
  // broadcast payload doesn't carry — see the .meeting.file_shared
  // listener's own comment above) rather than waiting for the broadcast.
  const uploadFile = useCallback(async (file) => {
    const json = await filesApi.store(meetingUuid, guestToken, file);
    setFiles((prev) => (prev.some((f) => f.id === json.data.id) ? prev.map((f) => (f.id === json.data.id ? json.data : f)) : [...prev, json.data]));
    return json.data;
  }, [meetingUuid, guestToken]);
  const deleteFile = useCallback((fileId) => filesApi.destroy(meetingUuid, guestToken, fileId), [meetingUuid, guestToken]);

  // ---- بند 20 (Meeting Notes + Action Items) — writes are manager-only,
  // enforced server-side (MeetingNotesService::requireManager); returned
  // as a promise (not swallowed) so NotesPanel can surface a 403 inline.
  const updateNotes = useCallback((body) => notesApi.update(meetingUuid, guestToken, body), [meetingUuid, guestToken]);
  const createActionItem = useCallback((data) => notesApi.createItem(meetingUuid, guestToken, data), [meetingUuid, guestToken]);
  const updateActionItem = useCallback((itemId, data) => notesApi.updateItem(meetingUuid, guestToken, itemId, data), [meetingUuid, guestToken]);
  const deleteActionItem = useCallback((itemId) => notesApi.deleteItem(meetingUuid, guestToken, itemId), [meetingUuid, guestToken]);

  // ---- بند 21 (Polls) — create/close manager-only, vote open to anyone
  // present. Local optimistic update for vote() only (poll_id + option
  // list is already in hand from `polls` state; create/close both ride
  // their own broadcasts, which reach the caller's own browser too, same
  // as every other Round 5/6/7 event).
  const createPoll = useCallback((data) => pollsApi.create(meetingUuid, guestToken, data), [meetingUuid, guestToken]);
  const votePoll = useCallback(async (pollId, optionIds) => {
    const json = await pollsApi.vote(meetingUuid, guestToken, pollId, optionIds);
    setPolls((prev) => prev.map((p) => (p.poll_id === pollId ? json.data : p)));
    return json.data;
  }, [meetingUuid, guestToken]);
  const closePoll = useCallback((pollId) => pollsApi.close(meetingUuid, guestToken, pollId), [meetingUuid, guestToken]);

  return {
    status, error, meetingStatus, notice, clearNotice,
    localStream, micEnabled, cameraEnabled, screenSharing, canShareScreen,
    participants, meshCapacity,
    toggleMic, toggleCamera, toggleScreenShare, leave,
    myDisplayName, isHost,

    // بند 7/8 — Chat.
    chatMessages, chatUnreadCount, chatEnabled, sendChatMessage, reactToChatMessage, markChatRead,

    // بند 11 — Raise Hand + Reactions.
    handRaised, toggleHand, reactions, sendReaction,

    // بند 9 — Screen Sharing host policies.
    screenSharingLocked, myScreenShareAllowed, setScreenSharingLock, setParticipantScreenShareAllowed, forceStopScreenShare,

    // بند 5 — Host Controls / Participants Panel.
    myRole, isManager: myRole === 'host' || myRole === 'co_host', meetingLocked, kicked,
    lockMeeting, muteParticipant, disableParticipantCamera, removeParticipant, promoteParticipant, demoteParticipant, transferHost,

    // بند 19 — File Sharing.
    files, uploadFile, deleteFile,

    // بند 20 — Meeting Notes + Action Items.
    notes, actionItems, updateNotes, createActionItem, updateActionItem, deleteActionItem,

    // بند 21 — Polls.
    polls, createPoll, votePoll, closePoll,

    // بند 18 — Recording.
    recordings, activeRecording: recordings.find((r) => r.status === 'recording') || null,
    isRecordingLocally, recordingBusy, recordingError,
    startRecording, stopRecordingLocal, deleteRecording,
  };
}
