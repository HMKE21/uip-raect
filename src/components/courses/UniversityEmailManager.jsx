import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { downloadAuthed } from '../../lib/download';

/**
 * الإيميل الجامعي (الجامعة / الكلية): ضبط الدومين والنمط، توليد العناوين للطلاب، تعديل عنوان طالب، وتصدير ملف التحويل (CSV).
 * الكلية بتشوف طلابها وتصدّرهم بس، والضبط والتوليد والتعديل للجامعة.
 * Backend: /api/v1/university-email (GET /, PUT /settings, POST /generate, PUT /students/{id}, GET /export).
 */
export default function UniversityEmailManager({ role = 'university' }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ domain: '', pattern: 'number' });
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const [edit, setEdit] = useState(null); // { id, local }

  const load = useCallback(() => api.get('/api/v1/university-email', { locale, ...(q.trim() ? { q: q.trim() } : {}), ...(missing ? { missing: 1 } : {}) }).then((j) => {
    setData(j.data);
    setSettings((s) => (s.domain || !j.data?.settings?.domain ? s : { domain: j.data.settings.domain, pattern: j.data.settings.pattern }));
  }), [locale, q, missing]);
  useEffect(() => { load().catch((e) => setError(errorMessage(e))); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); setNotice(j?.message || null); await load(); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const canEdit = !!data?.settings?.can_edit;
  const domain = data?.settings?.domain;

  const exportCsv = () => downloadAuthed('/api/v1/university-email/export', 'university-emails.csv', { locale }).catch((e) => setError(errorMessage(e)));
  const saveLocal = async (e) => {
    e.preventDefault();
    if (await run(() => api.put(`/api/v1/university-email/students/${edit.id}`, { local: edit.local, locale }))) setEdit(null);
  };

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'الإيميل الجامعي' : 'University email'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {ar ? 'حدّد دومين الجامعة وولّد عنوان رسمي لكل طالب. العنوان بيتحوّل لإيميل الطالب الشخصي؛ نزّل ملف التصدير واضبط التحويل على سيرفر الدومين.' : 'Set the university domain and generate an official address per student. Addresses forward to the student’s personal email; download the export and configure forwarding on your domain’s mail server.'}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      {!data && !error ? <Skeleton h={80} count={3} /> : data && (
        <>
          <div className="st-grid st-grid--3">
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'إجمالي الطلاب' : 'Students'}</span><span className="st-kpi__value">{data.stats.total}</span></div>
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'لديهم عنوان' : 'With address'}</span><span className="st-kpi__value">{data.stats.with_email}</span></div>
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'بدون عنوان' : 'Missing'}</span><span className="st-kpi__value">{data.stats.missing}</span></div>
          </div>

          {canEdit && (
            <form className="ex-card" style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => api.put('/api/v1/university-email/settings', { ...settings, locale })); }}>
              <b>{ar ? 'الإعدادات' : 'Settings'}</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <input className="input" dir="ltr" required maxLength={120} value={settings.domain} onChange={(e) => setSettings({ ...settings, domain: e.target.value })} placeholder="uni.edu.eg" />
                <select className="input" value={settings.pattern} onChange={(e) => setSettings({ ...settings, pattern: e.target.value })}>
                  <option value="number">{ar ? 'النمط: الرقم الجامعي (2024001@…)' : 'Pattern: student number (2024001@…)'}</option>
                  <option value="name">{ar ? 'النمط: الاسم (first.last@…) — الأسماء العربية تاخد الرقم' : 'Pattern: name (first.last@…) — Arabic names fall back to number'}</option>
                </select>
              </div>
              <div className="is-muted" style={{ fontSize: 12 }}>{ar ? 'تغيير الدومين بيحدّث كل العناوين الموجودة لنفس الاسم بالدومين الجديد. تغيير النمط بيأثر على العناوين الجديدة بس.' : 'Changing the domain re-points every existing address to the new domain. Changing the pattern only affects newly generated addresses.'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{ar ? 'حفظ' : 'Save'}</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={busy || !domain || data.stats.missing === 0} onClick={() => run(() => api.post('/api/v1/university-email/generate', { locale }))}>{ar ? `توليد العناوين الناقصة (${data.stats.missing})` : `Generate missing (${data.stats.missing})`}</button>
              </div>
            </form>
          )}

          <div className="ex-card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <input className="input" style={{ flex: '1 1 200px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? 'بحث بالاسم أو الرقم أو العنوان' : 'Search name, number or address'} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> {ar ? 'بدون عنوان فقط' : 'Missing only'}</label>
              <button type="button" className="btn btn-outline btn-sm" disabled={data.stats.with_email === 0} onClick={exportCsv}><Icon name="download" size={14} /> {ar ? 'تصدير ملف التحويل' : 'Export forwarding CSV'}</button>
            </div>
            {data.students.length === 0 ? <EmptyState icon="mail" title={ar ? 'لا يوجد طلاب' : 'No students'} /> : (
              <div className="ex-table-wrap">
                <table className="ex-table">
                  <thead><tr><th>{ar ? 'الطالب' : 'Student'}</th><th>{ar ? 'الرقم الجامعي' : 'Number'}</th><th>{ar ? 'العنوان الجامعي' : 'University address'}</th><th>{ar ? 'يتحوّل إلى' : 'Forwards to'}</th>{canEdit && <th />}</tr></thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td><td>{s.number || '—'}</td>
                        <td dir="ltr" style={{ textAlign: 'start' }}>
                          {edit?.id === s.id ? (
                            <form onSubmit={saveLocal} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input className="input" dir="ltr" autoFocus maxLength={64} value={edit.local} onChange={(e) => setEdit({ ...edit, local: e.target.value })} style={{ width: 150 }} />
                              <span>@{domain}</span>
                              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{ar ? 'حفظ' : 'Save'}</button>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit(null)}>{ar ? 'إلغاء' : 'Cancel'}</button>
                            </form>
                          ) : (s.address || <span className="is-muted">—</span>)}
                        </td>
                        <td dir="ltr" style={{ textAlign: 'start' }}>{s.personal_email}</td>
                        {canEdit && <td style={{ textAlign: 'end' }}>{edit?.id !== s.id && domain && <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit({ id: s.id, local: s.address ? s.address.split('@')[0] : '' })}>{ar ? 'تعديل' : 'Edit'}</button>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
