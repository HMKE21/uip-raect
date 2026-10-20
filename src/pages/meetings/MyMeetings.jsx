import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { invitationsApi } from '../../lib/meetingSignaling';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/Icon';
import { useTranslations } from '../../context/LanguageContext';
import { portalPrefix } from '../../config/navConfig';
import i18nCommon from '../../i18n/common';
import i18nMeetings from '../../i18n/shared/meetings';

const translations = { ...i18nCommon, ...i18nMeetings };

/**
 * Round 1 (Foundation) — GET/POST /api/v1/meetings (MeetingsApiController::
 * index/store). One shared page for every portal (`/${role}/meetings`),
 * exactly like Messages/Notifications — see navConfig.js's
 * COMMON_ACCOUNT_ITEMS and App.jsx's routing block. `forUser()` on the
 * backend returns meetings the caller hosts *or* participates in, so this
 * list is never scoped to "meetings I created" only.
 *
 * Creation here only takes the fields MeetingsApiController::store()
 * actually requires/accepts at Round 1 — waiting room/guests/password are
 * still exposed since they're plain schema columns already, but lobby
 * enforcement, guest join links, and password verification are Round 2
 * work (MeetingsLobbyApiController) not wired into this page yet.
 *
 * Round 8 (Invitations & Calendar) addition — بند 14: a "Calendar" link
 * next to "New Meeting" heading to MeetingCalendar.jsx (its own full-page
 * route, `/${role}/meetings/calendar`, registered in App.jsx *before* the
 * `:uuid` route for the exact same "calendar mustn't be read as a uuid"
 * reason the backend registers `GET meetings/calendar` before
 * `GET meetings/{uuid}` — see routes/api.php's own comment there). بند 13:
 * a "My Invitations" section (`invitationsApi.mine()` — pending
 * invitations across every meeting, not just ones on this list) with
 * inline Accept/Decline, since accepting one changes this page's own
 * meetings list (the backend creates/updates the participant row on
 * respond — MeetingService::respondToInvitation()) — `load()` is
 * re-run after a response for that reason.
 */

const CARD = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };

const STATUS_META = {
  scheduled: { cls: 'badge-primary', key: 'Scheduled' },
  lobby: { cls: 'badge-warning', key: 'In Lobby' },
  live: { cls: 'badge-success', key: 'Live' },
  ended: { cls: 'badge-neutral', key: 'Ended' },
  cancelled: { cls: 'badge-neutral', key: 'Cancelled' },
};

function CreateMeetingModal({ onClose, onCreated }) {
  const t = useTranslations(translations);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('instant');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState('');
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
  const [allowGuests, setAllowGuests] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const json = await api.post('/api/v1/meetings', {
        title: title.trim(),
        description: description.trim() || null,
        type,
        scheduled_start_at: type === 'scheduled' && scheduledStartAt ? scheduledStartAt : null,
        duration_minutes: Number(durationMinutes) || 60,
        max_participants: maxParticipants ? Number(maxParticipants) : null,
        waiting_room_enabled: waitingRoomEnabled,
        allow_guests: allowGuests,
        password: password.trim() || null,
      });
      onCreated(json.data.uuid);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box card glass-panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-box__title text-h3">{t('Create Meeting')}</h2>
        <form onSubmit={handleSubmit} style={CARD}>
          <div className="form-group">
            <label className="form-label">{t('Title')}</label>
            <input className="form-input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('Description')}</label>
            <textarea className="form-input" rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('Type')}</label>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <label className="text-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="meeting-type" checked={type === 'instant'} onChange={() => setType('instant')} />
                {t('Instant')}
              </label>
              <label className="text-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="meeting-type" checked={type === 'scheduled'} onChange={() => setType('scheduled')} />
                {t('Scheduled')}
              </label>
            </div>
          </div>

          {type === 'scheduled' && (
            <div className="form-group">
              <label className="form-label">{t('Scheduled Start')}</label>
              <input className="form-input" type="datetime-local" required={type === 'scheduled'} value={scheduledStartAt} onChange={(e) => setScheduledStartAt(e.target.value)} />
            </div>
          )}

          <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">{t('Duration (minutes)')}</label>
              <input className="form-input" type="number" min="5" required value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('Max Participants')}</label>
              <input className="form-input" type="number" min="2" placeholder={t('No limit')} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('Password (optional)')}</label>
            <input className="form-input" type="text" maxLength={100} placeholder={t('Leave blank for no password')} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <label className="text-small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={waitingRoomEnabled} onChange={(e) => setWaitingRoomEnabled(e.target.checked)} />
            {t('Waiting Room')}
            <span className="text-caption" style={{ margin: 0 }}>— {t('Enable a waiting room — you approve each participant before they join.')}</span>
          </label>

          <label className="text-small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={allowGuests} onChange={(e) => setAllowGuests(e.target.checked)} />
            {t('Allow Guests')}
            <span className="text-caption" style={{ margin: 0 }}>— {t('Allow people without an account to join with a link.')}</span>
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-box__actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>{saving ? '…' : t('Create Meeting')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MyMeetings() {
  const t = useTranslations(translations);
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefix = portalPrefix(user?.role);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [creating, setCreating] = useState(false);

  // Round 8 — بند 13 (My Invitations).
  const [invitations, setInvitations] = useState([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [respondingId, setRespondingId] = useState(null);
  const [invitationsError, setInvitationsError] = useState(null);

  const load = useCallback(() => {
    return api.get('/api/v1/meetings').then((json) => setMeetings(json.data || []));
  }, []);

  const loadInvitations = useCallback(() => {
    setInvitationsLoading(true);
    return invitationsApi.mine()
      .then((json) => setInvitations(json.data || []))
      .catch((err) => setInvitationsError(errorMessage(err)))
      .finally(() => setInvitationsLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().catch((err) => setError(errorMessage(err))).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  async function handleRespond(invitation, accept) {
    setRespondingId(invitation.id);
    setInvitationsError(null);
    try {
      await invitationsApi.respond(invitation.meeting.uuid, invitation.id, accept);
      await Promise.all([loadInvitations(), load()]);
    } catch (err) {
      setInvitationsError(errorMessage(err));
    } finally {
      setRespondingId(null);
    }
  }

  function handleCreated(uuid) {
    setCreating(false);
    navigate(`/${prefix}/meetings/${uuid}`);
  }

  async function handleDelete(meeting) {
    if (!window.confirm(t('Delete this meeting? This cannot be undone.'))) return;
    setActionError(null);
    try {
      await api.del(`/api/v1/meetings/${meeting.uuid}`);
      load();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (loading) return <p className="text-small" style={{ padding: 'var(--space-5)' }}>{t('Loading…')}</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="text-h2" style={{ margin: 0 }}>{t('My Meetings')}</h1>
          <p className="text-small" style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)' }}>
            {t('Host a meeting, or wait to be invited to one — every result below is a meeting you host or are part of.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link to={`/${prefix}/meetings/calendar`} className="btn btn-outline">
            <Icon name="calendar" size={16} /> {t('Calendar')}
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> {t('New Meeting')}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {actionError && <p className="form-error">{actionError}</p>}
      {invitationsError && <p className="form-error">{invitationsError}</p>}

      {!invitationsLoading && invitations.length > 0 && (
        <div className="card glass-panel" style={CARD}>
          <h2 className="text-h3" style={{ margin: 0 }}>{t('My Invitations')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {invitations.map((inv) => (
              <li key={inv.id} className="text-small" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{inv.meeting?.title}</div>
                  <div className="text-caption">{t('Invited by')}: {inv.invited_by?.full_name || `#${inv.invited_by_user_id}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled={respondingId === inv.id} onClick={() => handleRespond(inv, false)}>
                    {t('Decline')}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={respondingId === inv.id} onClick={() => handleRespond(inv, true)}>
                    {respondingId === inv.id ? '…' : t('Accept')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="card glass-panel empty-state">
          <Icon name="monitor" size={32} className="empty-state__icon" />
          <p className="text-small">{t('Host your first meeting to get started.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> {t('New Meeting')}
          </button>
        </div>
      ) : (
        <div className="card glass-panel" style={CARD}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Title')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Scheduled Start')}</th>
                  <th>{t('Status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => {
                  const meta = STATUS_META[m.status] || STATUS_META.scheduled;
                  const isHost = String(m.host_user_id) === String(user?.id);
                  return (
                    <tr key={m.uuid}>
                      <td>
                        <Link to={`/${prefix}/meetings/${m.uuid}`} className="text-small" style={{ fontWeight: 600 }}>
                          {m.title}
                        </Link>
                        {isHost && <div className="text-caption">{t('Host')}: {t('You')}</div>}
                      </td>
                      <td>{t(m.type === 'scheduled' ? 'Scheduled' : 'Instant')}</td>
                      <td>{m.scheduled_start_at ? new Date(m.scheduled_start_at).toLocaleString() : '—'}</td>
                      <td><span className={`badge ${meta.cls}`}>{t(meta.key)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <Link to={`/${prefix}/meetings/${m.uuid}`} className="btn btn-outline btn-sm">
                            {t('Meeting Details')}
                          </Link>
                          {isHost && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(m)} title={t('Delete')}>
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <CreateMeetingModal onClose={() => setCreating(false)} onCreated={handleCreated} />}
    </div>
  );
}
