import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';

/**
 * إدارة التسجيل الصيفي (الجامعة / الكلية): فصول صيفية (فترة تسجيل + ساعات + قيد الرسوب) + المواد المعروضة بسعة
 * + صندوق طلبات الطلاب (موافقة / رفض). الكلية تدير فصول كليتها وطلاب كليتها بس.
 * Backend: /api/v1/summer/{terms, terms/{id}/offerings, requests, requests/{id}/approve|reject}.
 */

const EMPTY = { name: '', opens_at: '', closes_at: '', starts_on: '', ends_on: '', max_hours: 9, only_failed: false };
const toInput = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');
const ST = { pending: ['قيد المراجعة', 'Pending', ''], approved: ['معتمد', 'Approved', 'success'], rejected: ['مرفوض', 'Rejected', 'warning'], cancelled: ['ملغي', 'Cancelled', 'neutral'] };

export default function SummerManager({ role = 'university' }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [terms, setTerms] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [offerTerm, setOfferTerm] = useState(null);
  const [offers, setOffers] = useState({});
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState({});

  const loadTerms = useCallback(() => api.get('/api/v1/summer/terms', { locale }).then((j) => setTerms(j.data || [])), [locale]);
  const loadReqs = useCallback(() => api.get('/api/v1/summer/requests', { locale, ...(status ? { status } : {}) }).then((j) => setReqs(j.data || [])), [locale, status]);
  useEffect(() => { loadTerms().catch((e) => setError(errorMessage(e))); }, [loadTerms]);
  useEffect(() => { loadReqs().catch((e) => setError(errorMessage(e))); }, [loadReqs]);
  useEffect(() => { api.get('/api/v1/courses', { locale }).then((j) => setCourses(j.data || [])).catch(() => {}); }, [locale]);

  const run = async (fn, after) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); setNotice(j?.message || null); after?.(); await Promise.all([loadTerms(), loadReqs()]); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const saveTerm = () => run(
    () => (editId ? api.put(`/api/v1/summer/terms/${editId}`, { ...form, locale }) : api.post('/api/v1/summer/terms', { ...form, locale })),
    () => { setEditId(null); setForm(EMPTY); },
  );
  const delTerm = (id) => window.confirm(ar ? 'حذف الفصل الصيفي؟' : 'Delete this summer term?') && run(() => api.del(`/api/v1/summer/terms/${id}?locale=${locale}`));

  const openOffers = (t) => {
    setOfferTerm(t.id);
    setOffers(Object.fromEntries(t.offerings.map((o) => [o.course_id, o.capacity ?? ''])));
  };
  const toggle = (id) => setOffers((o) => { const n = { ...o }; if (id in n) delete n[id]; else n[id] = ''; return n; });
  const saveOffers = () => run(
    () => api.put(`/api/v1/summer/terms/${offerTerm}/offerings`, { offerings: Object.entries(offers).map(([cid, cap]) => ({ course_id: Number(cid), capacity: cap === '' ? null : Number(cap) })), locale }),
    () => setOfferTerm(null),
  );

  const act = (id, what) => {
    const note = (notes[id] || '').trim();
    if (what === 'reject' && !note) { setError(ar ? 'اكتب سبب الرفض.' : 'Please give a reason for the rejection.'); return; }
    run(() => api.post(`/api/v1/summer/requests/${id}/${what}`, { note, locale }));
  };

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'التسجيل الصيفي' : 'Summer registration'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {role === 'faculty' ? (ar ? 'فصول كليتك الصيفية وطلبات طلابها.' : "Your faculty's summer terms and its students' requests.") : (ar ? 'افتح فصل صيفي واعرض المواد وراجع الطلبات.' : 'Open a summer term, offer courses and review requests.')}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      <div className="ex-card">
        <b>{editId ? (ar ? 'تعديل فصل صيفي' : 'Edit summer term') : (ar ? 'فصل صيفي جديد' : 'New summer term')}</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, margin: '10px 0' }}>
          <input className="input" placeholder={ar ? 'اسم الفصل' : 'Name'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label style={{ fontSize: 12 }}>{ar ? 'فتح التسجيل' : 'Registration opens'}<input className="input" type="datetime-local" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>{ar ? 'قفل التسجيل' : 'Registration closes'}<input className="input" type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>{ar ? 'بداية الدراسة' : 'Classes start'}<input className="input" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>{ar ? 'نهاية الدراسة' : 'Classes end'}<input className="input" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>{ar ? 'أقصى ساعات' : 'Max hours'}<input className="input" type="number" min="1" max="30" value={form.max_hours} onChange={(e) => setForm({ ...form, max_hours: e.target.value })} /></label>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={form.only_failed} onChange={(e) => setForm({ ...form, only_failed: e.target.checked })} />
          {ar ? 'للمواد اللي الطالب راسب فيها بس' : 'Only courses the student failed'}
        </label>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy || !form.name || !form.opens_at || !form.closes_at} onClick={saveTerm}>{editId ? (ar ? 'حفظ' : 'Save') : (ar ? 'إضافة الفصل' : 'Add term')}</button>
          {editId && <button type="button" className="btn btn-outline" onClick={() => { setEditId(null); setForm(EMPTY); }}>{ar ? 'إلغاء' : 'Cancel'}</button>}
        </div>
      </div>

      {!terms && !error ? <Skeleton h={80} count={2} /> : terms && terms.length === 0 ? (
        <div className="ex-card"><EmptyState icon="calendar" title={ar ? 'لا توجد فصول صيفية' : 'No summer terms yet'} /></div>
      ) : terms && terms.map((t) => (
        <div className="ex-card" key={t.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <b>{t.name}</b> <span className={`st-pill${t.open ? ' st-pill--success' : ' st-pill--neutral'}`}>{t.open ? (ar ? 'مفتوح' : 'Open') : (ar ? 'غير مفتوح' : 'Not open')}</span>
              <div className="is-muted" style={{ fontSize: 12 }}>{String(t.opens_at).slice(0, 16)} → {String(t.closes_at).slice(0, 16)} · {ar ? 'أقصى' : 'max'} {t.max_hours} {ar ? 'ساعة' : 'h'}{t.only_failed ? (ar ? ' · رسوب فقط' : ' · failed only') : ''} · {t.pending} {ar ? 'طلب معلّق' : 'pending'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => openOffers(t)}>{ar ? 'المواد المعروضة' : 'Offered courses'}</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditId(t.id); setForm({ name: t.name, opens_at: toInput(t.opens_at), closes_at: toInput(t.closes_at), starts_on: t.starts_on || '', ends_on: t.ends_on || '', max_hours: t.max_hours, only_failed: t.only_failed }); }}>{ar ? 'تعديل' : 'Edit'}</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => delTerm(t.id)}>{ar ? 'حذف' : 'Delete'}</button>
            </div>
          </div>
          {t.offerings.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              {t.offerings.map((o) => <span key={o.course_id} className="st-pill" style={{ marginInlineEnd: 4 }}>{o.code} · {o.approved}{o.capacity !== null ? `/${o.capacity}` : ''}</span>)}
            </div>
          )}
          {offerTerm === t.id && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 10 }}>
              <div style={{ maxHeight: 260, overflow: 'auto', display: 'grid', gap: 4 }}>
                {courses.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={c.id in offers} onChange={() => toggle(c.id)} />
                    <span style={{ flex: 1 }}>{c.code} — {c.name}</span>
                    {c.id in offers && <input className="input" style={{ width: 110 }} type="number" min="1" placeholder={ar ? 'السعة (اختياري)' : 'Capacity'} value={offers[c.id]} onChange={(e) => setOffers({ ...offers, [c.id]: e.target.value })} />}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveOffers}>{ar ? 'حفظ المواد' : 'Save courses'}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setOfferTerm(null)}>{ar ? 'إغلاق' : 'Close'}</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="ex-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <b>{ar ? 'طلبات الطلاب' : 'Student requests'}</b>
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
            {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
          </select>
        </div>
        {reqs.length === 0 ? <EmptyState icon="inbox" title={ar ? 'لا توجد طلبات' : 'No requests'} /> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {reqs.map((r) => {
              const st = ST[r.status];
              return (
                <div key={r.id} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <b>{r.student.name}</b> <span className="is-muted" style={{ fontSize: 12 }}>({r.student.number})</span>
                      <div style={{ fontSize: 13 }}>{r.course.code} — {r.course.name} · {r.term}</div>
                      {r.message && <div className="is-muted" style={{ fontSize: 12 }}>{r.message}</div>}
                      {r.decision_note && r.status !== 'pending' && <div style={{ fontSize: 12 }}>{ar ? 'ملاحظة: ' : 'Note: '}{r.decision_note}</div>}
                    </div>
                    <span className={`st-pill${st[2] ? ` st-pill--${st[2]}` : ''}`}>{ar ? st[0] : st[1]}</span>
                  </div>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <input className="input" style={{ flex: '1 1 200px' }} value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={ar ? 'ملاحظة (إلزامية عند الرفض)' : 'Note (required when rejecting)'} />
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(r.id, 'approve')}>{ar ? 'موافقة' : 'Approve'}</button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(r.id, 'reject')}>{ar ? 'رفض' : 'Reject'}</button>
                    </div>
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
