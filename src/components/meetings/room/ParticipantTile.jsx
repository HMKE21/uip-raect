import { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import VolumeBoost from '../../VolumeBoost';
import { useVolumeBoost } from '../../../lib/volumeBoost';
import { useTranslations } from '../../../context/LanguageContext';
import i18nCommon from '../../../i18n/common';
import i18nMeetings from '../../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

const QUALITY_COLOR = {
  excellent: '#22c55e',
  good: '#84cc16',
  poor: '#f59e0b',
  reconnecting: '#ef4444',
  disconnected: '#ef4444',
};

/**
 * Round 4 (WebRTC Core, بند 4 — Participant Grid). One `<video>` bound to
 * either the local MediaStream or a peer's `ontrack` stream
 * (useMeetingRoom's `participants[key].remoteStream`) — this component
 * doesn't know or care which, it just renders whatever MediaStream it's
 * given. `isLocal` only controls muting (never play your own mic back to
 * yourself) and mirroring (front-camera selfie feel).
 */
export default function ParticipantTile({
  stream, displayName, isHost, isGuest, micEnabled, cameraEnabled,
  screenSharing, connectionQuality, connectionState, isLocal, large,
  handRaised, screenShareAllowed, canManage, onAllowScreenShare, onDenyScreenShare, onResetScreenShare, onForceStopScreenShare,
  // Round 6 (Host Controls) — بند 5. `role`/`canPrimaryManage` mirror the
  // same split used by ParticipantsPanel (see that component's docblock):
  // canManage (host or co-host) unlocks mute/disable-camera/remove(non-
  // co-host); canPrimaryManage (primary host only, and never for a
  // guest) unlocks remove-a-co-host/promote/demote/make-host.
  role, canPrimaryManage, onMute, onDisableCamera, onRemove, onPromote, onDemote, onMakeHost,
}) {
  const videoRef = useRef(null);
  const vb = useVolumeBoost(videoRef, { stream });   // louder remote participants (never for your own mic)
  const t = useTranslations(translations);
  const [menuOpen, setMenuOpen] = useState(false);

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const showVideo = stream && cameraEnabled !== false;

  // The <video> stays mounted even while the camera is off: it is also what plays this participant's VOICE. (It used to be
  // unmounted with the camera, which silenced the call; and re-mounting it never re-attached the stream.)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    if (el.srcObject !== (stream || null)) el.srcObject = stream || null;
    if (!stream || isLocal) return undefined;
    el.muted = false;
    el.volume = 1;
    const play = () => { const p = el.play(); if (p && p.catch) p.catch(() => {}); };
    play();
    // autoplay refused (no gesture yet) -> retry on the next tap/key anywhere, and whenever a track starts flowing
    window.addEventListener('pointerdown', play, { once: true, capture: true });
    window.addEventListener('keydown', play, { once: true, capture: true });
    stream.addEventListener && stream.addEventListener('addtrack', play);
    return () => {
      window.removeEventListener('pointerdown', play, true);
      window.removeEventListener('keydown', play, true);
      stream.removeEventListener && stream.removeEventListener('addtrack', play);
    };
  }, [stream, isLocal]);

  return (
    <div
      className="meeting-tile"
      style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#1b1c22' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none', display: showVideo ? 'block' : 'none' }}
      />
      {showVideo ? null : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: large ? 96 : 56, height: large ? 96 : 56, borderRadius: '50%', background: 'var(--color-primary)',
              color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: large ? 36 : 20, fontWeight: 800,
            }}
          >
            {initial}
          </div>
        </div>
      )}

      {showVideo && !isLocal && (
        <div style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8, zIndex: 2 }}>
          <VolumeBoost vb={vb} variant="chip" />
        </div>
      )}

      <div style={{ position: 'absolute', top: 8, insetInlineStart: 8, display: 'flex', gap: 4 }}>
        {screenSharing && (
          <span className="badge badge-primary">
            <Icon name="monitor" size={12} />
          </span>
        )}
        {handRaised && (
          <span className="badge" style={{ background: '#fbbf24', color: '#1b1c22' }} title={t('Hand raised')}>
            <Icon name="hand" size={12} />
          </span>
        )}
      </div>

      <span
        title={connectionQuality}
        style={{
          position: 'absolute', top: 10, insetInlineEnd: canManage ? 40 : 10, width: 9, height: 9, borderRadius: '50%',
          background: QUALITY_COLOR[connectionState === 'disconnected' ? 'disconnected' : connectionQuality] || QUALITY_COLOR.good,
          boxShadow: '0 0 0 2px rgba(0,0,0,0.35)',
        }}
      />

      {canManage && (
        <div style={{ position: 'absolute', top: 4, insetInlineEnd: 4 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title={t('Host controls')}
            style={{
              width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="more-vertical" size={14} />
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
              {(onMute || onDisableCamera || onPromote || onDemote || onMakeHost || onRemove) && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />
              )}
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

      <div
        style={{
          position: 'absolute', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, padding: '6px 10px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.65), transparent)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 6,
        }}
      >
        <span style={{ color: '#fff', fontSize: 'var(--text-caption)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
          {isHost && <Icon name="star" size={11} />}
          {isGuest && <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 5px' }}>{t('Guest')}</span>}
        </span>
        {!micEnabled && <Icon name="mic" size={13} style={{ color: '#f87171' }} />}
      </div>
    </div>
  );
}
