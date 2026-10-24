import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import VolumeBoost from '../../VolumeBoost';
import { useVolumeBoost } from '../../../lib/volumeBoost';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

/** Stable, pleasant avatar colour per person (same name -> same colour for everyone in the room). */
const AVATAR_HUES = [231, 262, 291, 330, 12, 32, 152, 188, 205];
function avatarColor(name) {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 28) % 360} 70% 46%))`;
}

let sharedAudioCtx = null;
function getAudioCtx() {
  if (!sharedAudioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    sharedAudioCtx = new AC();
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {});
  return sharedAudioCtx;
}

/** True while the stream's audio is above a speaking threshold (drives the glowing ring around the tile). */
function useSpeaking(stream, enabled) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!enabled || !stream || stream.getAudioTracks().length === 0) { setSpeaking(false); return undefined; }
    let src; let analyser; let timer; let hold = 0;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return undefined;
      src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i] - 128));
        if (peak > 9) hold = 4; else if (hold > 0) hold -= 1;
        setSpeaking(hold > 0);
      }, 120);
    } catch { /* analyser unsupported — the ring just never lights up */ }
    return () => {
      clearInterval(timer);
      try { src?.disconnect(); } catch { /* already gone */ }
      setSpeaking(false);
    };
  }, [stream, enabled]);
  return speaking;
}

/**
 * One tile in the participant grid: a `<video>` bound to the local MediaStream or a peer's stream, an avatar when there is
 * nothing to show, a name chip, and (for hosts) the per-person menu.
 *
 * Presenting is independent of the camera: whoever is sharing their screen shows that video even if their camera is off
 * (`screenSharing` wins over `cameraEnabled`). Your OWN tile never plays back your screen (that would be the "hall of
 * mirrors" Meet avoids) — it shows a "you are presenting" card with a stop button instead.
 */
export default function ParticipantTile({
  stream, displayName, isHost, isGuest, micEnabled, cameraEnabled,
  screenSharing, connectionQuality, connectionState, isLocal, large,
  handRaised, reaction, screenShareAllowed, canManage, onAllowScreenShare, onDenyScreenShare, onResetScreenShare, onForceStopScreenShare,
  role, canPrimaryManage, onMute, onDisableCamera, onRemove, onPromote, onDemote, onMakeHost,
  onPin, pinned, onStopShare, speakersMuted,
}) {
  const videoRef = useRef(null);
  const vb = useVolumeBoost(videoRef, { stream });   // louder remote participants (never for your own mic)
  const t = useTranslations(translations);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false); // browser refused autoplay-with-sound until the user interacts
  const speaking = useSpeaking(stream, micEnabled !== false);

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const presentingSelf = !!isLocal && !!screenSharing;
  const showVideo = !!stream && !presentingSelf && (!!screenSharing || cameraEnabled !== false);
  const poor = connectionState === 'disconnected' || connectionQuality === 'poor' || connectionQuality === 'reconnecting';

  // The <video> stays mounted even while the camera is off: it is also what plays this participant's VOICE.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    if (el.srcObject !== (stream || null)) el.srcObject = stream || null;
    el.muted = !!isLocal || !!speakersMuted; // your own tile must NEVER play your own mic (that is the echo you hear); "speakers off" silences everyone for same-room use
    if (!stream || isLocal) return undefined;
    el.volume = 1;
    const play = () => {
      const p = el.play();
      if (p && p.then) p.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    };
    play();
    window.addEventListener('pointerdown', play, { once: true, capture: true });
    window.addEventListener('keydown', play, { once: true, capture: true });
    stream.addEventListener && stream.addEventListener('addtrack', play);
    return () => {
      setAudioBlocked(false);
      window.removeEventListener('pointerdown', play, true);
      window.removeEventListener('keydown', play, true);
      stream.removeEventListener && stream.removeEventListener('addtrack', play);
    };
  }, [stream, isLocal, speakersMuted]);

  const cls = ['meeting-tile'];
  if (pinned) cls.push('is-pinned');
  if (!showVideo) cls.push('is-no-video');
  if (speaking && micEnabled !== false) cls.push('is-speaking');
  if (screenSharing && !isLocal) cls.push('is-presenting');
  if (large) cls.push('is-large');

  return (
    <div className={cls.join(' ')}>
      {/* Always mounted (it also plays this person's VOICE). Hidden with opacity, not display:none, so browsers keep playing it. */}
      <video
        ref={videoRef}
        className="meeting-tile__video"
        autoPlay
        playsInline
        muted={isLocal}
        onDoubleClick={onPin}
        style={{
          objectFit: screenSharing ? 'contain' : 'cover',
          transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none',
          opacity: showVideo ? 1 : 0,
        }}
      />

      {presentingSelf && (
        <div className="meeting-tile__presenting-card" onDoubleClick={onPin}>
          <span className="meeting-tile__presenting-icon"><Icon name="screen-share" size={30} /></span>
          <strong>{t('You are presenting your screen')}</strong>
          <span className="meeting-tile__presenting-hint">{t('Everyone in the meeting can see it, even with your camera off.')}</span>
          {onStopShare && (
            <button type="button" className="meeting-tile__stop-share" onClick={onStopShare}>
              <Icon name="stop" size={14} /> {t('Stop Sharing')}
            </button>
          )}
        </div>
      )}

      {!showVideo && !presentingSelf && (
        <div className="meeting-tile__avatar-wrap" onDoubleClick={onPin}>
          <div
            className="meeting-tile__avatar"
            style={{ width: large ? 112 : 72, height: large ? 112 : 72, fontSize: large ? 44 : 28, background: avatarColor(displayName) }}
          >
            {initial}
          </div>
        </div>
      )}

      {audioBlocked && !isLocal && (
        <button type="button" className="meeting-tile__enable-audio" onClick={() => { const el = videoRef.current; if (el) el.play().then(() => setAudioBlocked(false)).catch(() => {}); }}>
          <Icon name="volume" size={14} /> {t('Tap to enable sound')}
        </button>
      )}

      {reaction && (
        // keyed by the reaction id so every new reaction replays the pop animation
        <span key={reaction.id} className="meeting-tile__reaction" aria-hidden="true">{reaction.emoji || '👍'}</span>
      )}

      <div className="meeting-tile__badges">
        {pinned && (
          <span className="meeting-tile__badge" title={t('Pinned')}><Icon name="pin" size={12} /></span>
        )}
        {screenSharing && (
          <span className="meeting-tile__badge is-accent"><Icon name="screen-share" size={12} /> {t('Presenting')}</span>
        )}
        {handRaised && (
          <span className="meeting-tile__badge is-hand" title={t('Hand raised')}><Icon name="hand" size={12} /></span>
        )}
      </div>

      {!isLocal && connectionState && connectionState !== 'connected' && (
        <span className="meeting-tile__status">
          {connectionState === 'connecting' ? t('Connecting…') : connectionState === 'reconnecting' ? t('Reconnecting…') : t('Connection failed')}
        </span>
      )}

      <div className="meeting-tile__actions">
        {poor && !isLocal && connectionState === 'connected' && (
          <span className="meeting-tile__weak" title={t('Weak connection')}><Icon name="alert-triangle" size={13} /></span>
        )}
        {showVideo && !isLocal && <VolumeBoost vb={vb} variant="chip" />}
        {onPin && (
          <button type="button" className="meeting-tile__icon-btn meeting-tile__hover-only" onClick={onPin} title={pinned ? t('Unpin') : t('Pin')}>
            <Icon name="pin" size={14} />
          </button>
        )}
        {canManage && (
          <div style={{ position: 'relative' }}>
            <button type="button" className="meeting-tile__icon-btn" onClick={() => setMenuOpen((v) => !v)} title={t('Host controls')}>
              <Icon name="more-horizontal" size={15} />
            </button>
            {menuOpen && (
              <div className="meeting-tile__host-menu">
                {screenShareAllowed !== true && (
                  <button type="button" onClick={() => { onAllowScreenShare?.(); setMenuOpen(false); }}>{t('Allow screen sharing')}</button>
                )}
                {screenShareAllowed !== false && (
                  <button type="button" onClick={() => { onDenyScreenShare?.(); setMenuOpen(false); }}>{t('Disable screen sharing')}</button>
                )}
                {screenShareAllowed !== null && screenShareAllowed !== undefined && (
                  <button type="button" onClick={() => { onResetScreenShare?.(); setMenuOpen(false); }}>{t('Reset to meeting default')}</button>
                )}
                {screenSharing && (
                  <button type="button" onClick={() => { onForceStopScreenShare?.(); setMenuOpen(false); }}>{t("Stop this participant's screen share")}</button>
                )}
                {(onMute || onDisableCamera || onPromote || onDemote || onMakeHost || onRemove) && <div className="meeting-tile__menu-sep" />}
                {micEnabled && onMute && (
                  <button type="button" onClick={() => { onMute?.(); setMenuOpen(false); }}>{t('Mute')}</button>
                )}
                {cameraEnabled !== false && onDisableCamera && (
                  <button type="button" onClick={() => { onDisableCamera?.(); setMenuOpen(false); }}>{t('Turn off camera')}</button>
                )}
                {canPrimaryManage && role === 'participant' && onPromote && (
                  <button type="button" onClick={() => { onPromote?.(); setMenuOpen(false); }}>{t('Promote to moderator')}</button>
                )}
                {canPrimaryManage && role === 'co_host' && onDemote && (
                  <button type="button" onClick={() => { onDemote?.(); setMenuOpen(false); }}>{t('Remove moderator')}</button>
                )}
                {canPrimaryManage && onMakeHost && (
                  <button type="button" onClick={() => { onMakeHost?.(); setMenuOpen(false); }}>{t('Make host')}</button>
                )}
                {(canPrimaryManage || role !== 'co_host') && onRemove && (
                  <button type="button" className="is-danger" onClick={() => { onRemove?.(); setMenuOpen(false); }}>{t('Remove from meeting')}</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="meeting-tile__nameplate">
        <span className={`meeting-tile__mic ${micEnabled ? '' : 'is-off'}`}>
          <Icon name={micEnabled ? 'mic' : 'mic-off'} size={13} />
        </span>
        <span className="meeting-tile__name">{displayName}</span>
        {isHost && <Icon name="star" size={11} style={{ color: '#fbbf24', flexShrink: 0 }} />}
        {isGuest && <span className="meeting-tile__guest">{t('Guest')}</span>}
      </div>
    </div>
  );
}
