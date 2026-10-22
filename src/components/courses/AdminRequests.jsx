import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { downloadAuthed } from '../../lib/download';

/**
 * الطلبات الإدارية (شهادة قيد / بيان درجات / إفادة): الطالب بيقدّم ← الكلية توافق وتحوّل ← الجامعة تعتمد،
 * وبعد الاعتماد الطالب بيحمّل المستند PDF. نفس الصفحة للأدوار التلاتة (role = student | faculty | university).
 * Backend: /api/v1/admin-requests (GET, POST, /{id}/cancel|approve|reject, GET /{id}/document).
 */

const TYPES = {
  enrollment_certificate: ['شهادة قيد', 'Enrollment certificate'],
  transcript: ['بيان درجات', 'Grade statement'],
  statement: ['إفادة', 'Statement letter'],
};
const STATUS = {
  pending: ['قيد المراجعة', 'Pending', ''],
  approved: ['معتمد', 'Approved', 'success'],
  rejected: ['مرفوض', 'Rejected', 'warning'],
  cancelled: ['ملغي', 'Cancelled', 'neutral'],
};
const ACTION = { submitted: ['تم التقديم', 'Submitted'], forwarded: ['حوّلتها الكلية للجامعة', 'Forwarded to university'], approved: ['اعتماد', 'Approved'], rejected: ['رفض', 'Rejected'], cancelled: ['إلغاء', 'Cancelled'] };
const ROLE = { student: ['الطالب', 'Student'], faculty: ['الكلية', 'Faculty'], university: ['الجامعة', 'University'] };
const fmt = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

export default function AdminRequests({ role = 'student' }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const student = role === 'student';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ type: 'enrollment_certificate', purpose: '', message: '' });
  const [open, setOpen] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(
    () => api.get('/api/v1/admin-requests', { locale, ...(status ? { status } : {}) }).then((j) => setRows(j.data || [])),
    [locale, status],
  );
  useEffect(() => { load().catch((e) => setError(errorMessage(e))); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); setNotice(j?.message || null); await load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    run(() => api.post('/api/v1/admin-requests', { ...form, locale })).then(() => setForm((f) => ({ ...f, purpose: '', message: '' })));
  };
  const act = (id, what) => {
    const note = (notes[id] || '').trim();
    if (what === 'reject' && !note) { setError(ar ? 'اكتب سبب الرفض.' : 'Please give a reason for the rejection.'); return; }
    run(() => api.post(`/api/v1/admin-requests/${id}/${what}`, { note, locale }));
  };
  const download = (r) => downloadAuthed(`/api/v1/admin-requests/${r.id}/document`, `${r.ref_no}.pdf`, { locale }).catch((e) => setError(errorMessage(e)));

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'الطلبات الإدارية' : 'Administrative requests'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {student
            ? (ar ? 'اطلب شهادة قيد أو بيان درجات أو إفادة. الطلب بيعدّي على الكلية ثم الجامعة، وبعد الاعتماد تحمّل المستند.' : 'Request an enrollment certificate, grade statement or letter. It goes to your faculty, then the university; download the document once approved.')
            : (ar ? 'طلبات الطلاب. الكلية بتوافق وتحوّل للجامعة، والجامعة بتعتمد.' : 'Student requests. The faculty approves and forwards; the university gives final approval.')}
        </p>
      </div>

      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      {student && (
        <form className="ex-card" onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <b>{ar ? 'طلب جديد' : 'New request'}</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
            </select>
            <input className="input" value={form.purpose} maxLength={200} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder={form.type === 'statement' ? (ar ? 'الجهة / الغرض (مطلوب)' : 'Addressed to / purpose (required)') : (ar ? 'الجهة الموجّه لها (اختياري)' : 'Addressed to (optional)')} />
          </div>
          <textarea className="input" rows={2} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={ar ? 'ملاحظات (اختياري)' : 'Notes (optional)'} />
          <div><button type="submit" className="btn btn-primary" disabled={busy || (form.type === 'statement' && !form.purpose.trim())}>{ar ? 'إرسال الطلب' : 'Submit request'}</button></div>
        </form>
      )}

      <div className="ex-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <b>{student ? (ar ? 'طلباتي' : 'My requests') : (ar ? 'الطلبات' : 'Requests')}</b>
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
          </select>
        </div>

        {!rows && !error ? <Skeleton h={60} count={3} /> : rows && rows.length === 0 ? <EmptyState icon="file" title={ar ? 'لا توجد طلبات' : 'No requests'} /> : rows && (
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map((r) => {
              const st = STATUS[r.status] || STATUS.pending;
              const where = r.status === 'pending' ? (r.stage === 'faculty' ? (ar ? 'عند الكلية' : 'With faculty') : (ar ? 'عند الجامعة' : 'With university')) : null;
              return (
                <div key={r.id} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <b>{ar ? TYPES[r.type]?.[0] : TYPES[r.type]?.[1]}</b>
                      <span className="is-muted" style={{ fontSize: 12, marginInlineStart: 8 }}>{r.ref_no} · {fmt(r.created_at)}</span>
                      {!student && <div style={{ fontSize: 13 }}>{r.student.name} <span className="is-muted">({r.student.number})</span></div>}
                      {r.purpose && <div className="is-muted" style={{ fontSize: 12 }}>{ar ? 'الجهة/الغرض: ' : 'For: '}{r.purpose}</div>}
                      {r.message && <div className="is-muted" style={{ fontSize: 12 }}>{r.message}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`st-pill${st[2] ? ` st-pill--${st[2]}` : ''}`}>{ar ? st[0] : st[1]}</span>
                      {where && <span className="is-muted" style={{ fontSize: 12 }}>{where}</span>}
                      {r.document_ready && <button type="button" className="btn btn-primary btn-sm" onClick={() => download(r)}><Icon name="download" size={14} /> {ar ? 'تحميل PDF' : 'Download PDF'}</button>}
                      {r.can_cancel && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api.post(`/api/v1/admin-requests/${r.id}/cancel`, { locale }))}>{ar ? 'إلغاء' : 'Cancel'}</button>}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{ar ? 'السجل' : 'History'}</button>
                    </div>
                  </div>

                  {r.decision_note && r.status !== 'pending' && <div style={{ fontSize: 12, marginTop: 6 }}>{ar ? 'ملاحظة: ' : 'Note: '}{r.decision_note}</div>}

                  {r.can_act && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <input className="input" style={{ flex: '1 1 220px' }} value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={ar ? 'ملاحظة (إلزامية عند الرفض)' : 'Note (required when rejecting)'} />
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(r.id, 'approve')}>
                        {role === 'faculty' ? (ar ? 'موافقة وتحويل للجامعة' : 'Approve & forward') : (ar ? 'اعتماد' : 'Approve')}
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(r.id, 'reject')}>{ar ? 'رفض' : 'Reject'}</button>
                    </div>
                  )}

                  {open === r.id && (
                    <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, fontSize: 12 }}>
                      {r.events.map((e, i) => (
                        <li key={i}>{fmt(e.at)} — {ar ? ACTION[e.action]?.[0] : ACTION[e.action]?.[1]} ({ar ? ROLE[e.role]?.[0] : ROLE[e.role]?.[1]}{e.by ? `: ${e.by}` : ''}){e.note ? ` — ${e.note}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
