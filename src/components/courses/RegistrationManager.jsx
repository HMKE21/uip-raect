import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';

/**
 * إدارة التسجيل الأكاديمي (الجامعة / الكلية): فترات التسجيل + سياسة القواعد (فترة / متطلبات / ساعات / تعارض)
 * + المتطلبات السابقة لكل مادة. السياسة الفارغة (—) بتورّث من الأعلى ثم القيم الافتراضية.
 * Backend: /api/v1/registration/{manage,policy,periods,courses/{id}/prerequisites}.
 */

const KINDS = { both: ['تسجيل وحذف', 'Enrol & drop'], enroll: ['تسجيل', 'Enrol'], drop: ['حذف', 'Drop'] };
const FLAGS = [
  ['enforce_period', 'التسجيل بفترة مفتوحة بس', 'Only inside an open period'],
  ['enforce_prerequisites', 'اشتراط المتطلبات السابقة', 'Require prerequisites'],
  ['enforce_hours', 'حد أقصى للساعات', 'Credit-hour limit'],
  ['enforce_conflicts', 'منع تعارض المواعيد', 'Block schedule conflicts'],
];
const NUMS = [
  ['max_hours', 'الحد الأقصى العادي', 'Normal max hours'],
  ['low_gpa_threshold', 'معدل منخفض أقل من', 'Low GPA below'],
  ['low_gpa_max_hours', 'ساعات المعدل المنخفض', 'Low-GPA max hours'],
  ['high_gpa_threshold', 'معدل مرتفع من', 'High GPA from'],
  ['high_gpa_max_hours', 'ساعات المعدل المرتفع', 'High-GPA max hours'],
];
const toInput = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');

export default function RegistrationManager() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [data, setData] = useState(null);
  const [policy, setPolicy] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState({ name: '', kind: 'both', opens_at: '', closes_at: '' });
  const [editId, setEditId] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [pre, setPre] = useState([]);

  const apply = (j) => { setData(j.data); setPolicy(j.data.own_policy); };
  const load = useCallback(() => api.get('/api/v1/registration/manage', { locale }).then(apply), [locale]);
  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
    api.get('/api/v1/courses', { locale }).then((j) => setCourses(j.data || [])).catch(() => {});
  }, [load, locale]);

  const run = async (fn, after) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); if (j?.data?.level) apply(j); setNotice(j?.message || null); after?.(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const savePolicy = () => run(() => api.put('/api/v1/registration/policy', { ...policy, locale }));
  const savePeriod = () => run(
    () => (editId ? api.put(`/api/v1/registration/periods/${editId}`, { ...period, locale }) : api.post('/api/v1/registration/periods', { ...period, locale })),
    () => { setEditId(null); setPeriod({ name: '', kind: 'both', opens_at: '', closes_at: '' }); },
  );
  const delPeriod = (id) => window.confirm(ar ? 'حذف الفترة؟' : 'Delete this period?') && run(() => api.del(`/api/v1/registration/periods/${id}?locale=${locale}`));

  const pickCourse = (id) => {
    setCourseId(id); setPre([]);
    if (!id) return;
    api.get(`/api/v1/registration/courses/${id}/prerequisites`, { locale }).then((j) => setPre((j.data?.prerequisite_ids || []).map(String))).catch(() => {});
  };
  const savePre = () => run(() => api.put(`/api/v1/registration/courses/${courseId}/prerequisites`, { prerequisite_ids: pre.map(Number), locale }));

  if (!data && !error) return <div className="ex-page"><Skeleton h={100} count={3} /></div>;

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'التسجيل الأكاديمي' : 'Academic Registration'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {ar ? 'حدّد فترات التسجيل وقواعده. موافقتك على طلب طالب بتعدّي القواعد دي.' : 'Set registration periods and rules. Approving a student request overrides these rules.'}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      {data && (
        <>
          <div className="ex-card">
            <b>{ar ? 'فترات التسجيل' : 'Registration periods'}</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, margin: '10px 0' }}>
              <input className="input" placeholder={ar ? 'اسم الفترة' : 'Name'} value={period.name} onChange={(e) => setPeriod({ ...period, name: e.target.value })} />
              <select className="input" value={period.kind} onChange={(e) => setPeriod({ ...period, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
              </select>
              <input className="input" type="datetime-local" value={period.opens_at} onChange={(e) => setPeriod({ ...period, opens_at: e.target.value })} />
              <input className="input" type="datetime-local" value={period.closes_at} onChange={(e) => setPeriod({ ...period, closes_at: e.target.value })} />
              <button type="button" className="btn btn-primary" disabled={busy || !period.name || !period.opens_at || !period.closes_at} onClick={savePeriod}>
                {editId ? (ar ? 'حفظ التعديل' : 'Save') : (ar ? 'إضافة فترة' : 'Add period')}
              </button>
            </div>
            {data.periods.length === 0 ? <EmptyState icon="calendar" title={ar ? 'لا توجد فترات' : 'No periods yet'} /> : (
              <div className="ex-table-wrap"><table className="ex-table">
                <thead><tr><th>{ar ? 'الاسم' : 'Name'}</th><th>{ar ? 'النوع' : 'Type'}</th><th>{ar ? 'من' : 'From'}</th><th>{ar ? 'إلى' : 'To'}</th><th /></tr></thead>
                <tbody>{data.periods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td>{ar ? KINDS[p.kind][0] : KINDS[p.kind][1]}</td>
                    <td>{String(p.opens_at).slice(0, 16)}</td><td>{String(p.closes_at).slice(0, 16)}</td>
                    <td style={{ textAlign: 'end' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditId(p.id); setPeriod({ name: p.name, kind: p.kind, opens_at: toInput(p.opens_at), closes_at: toInput(p.closes_at) }); }}>{ar ? 'تعديل' : 'Edit'}</button>{' '}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => delPeriod(p.id)}>{ar ? 'حذف' : 'Delete'}</button>
                    </td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>

          <div className="ex-card">
            <b>{ar ? 'قواعد التسجيل' : 'Registration rules'}</b>
            <p className="is-muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>{ar ? '"موروث" = بياخد قيمة المستوى الأعلى أو الافتراضي.' : '"Inherit" uses the higher level or the default.'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {FLAGS.map(([k, a, e]) => (
                <label key={k} style={{ display: 'grid', gap: 4, fontSize: 13 }}>{ar ? a : e}
                  <select className="input" value={policy[k] === null || policy[k] === undefined ? '' : policy[k] ? '1' : '0'}
                    onChange={(ev) => setPolicy({ ...policy, [k]: ev.target.value === '' ? null : ev.target.value === '1' })}>
                    <option value="">{ar ? `موروث (${data.effective_policy[k] ? 'مفعّل' : 'متوقف'})` : `Inherit (${data.effective_policy[k] ? 'on' : 'off'})`}</option>
                    <option value="1">{ar ? 'مفعّل' : 'On'}</option><option value="0">{ar ? 'متوقف' : 'Off'}</option>
                  </select>
                </label>
              ))}
              {NUMS.map(([k, a, e]) => (
                <label key={k} style={{ display: 'grid', gap: 4, fontSize: 13 }}>{ar ? a : e}
                  <input className="input" type="number" step={k.includes('threshold') ? '0.1' : '1'} value={policy[k] ?? ''}
                    placeholder={String(data.effective_policy[k])} onChange={(ev) => setPolicy({ ...policy, [k]: ev.target.value === '' ? null : ev.target.value })} />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12 }}><button type="button" className="btn btn-primary" disabled={busy} onClick={savePolicy}>{ar ? 'حفظ القواعد' : 'Save rules'}</button></div>
          </div>

          <div className="ex-card">
            <b>{ar ? 'المتطلبات السابقة للمواد' : 'Course prerequisites'}</b>
            <div style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
              <select className="input" value={courseId} onChange={(e) => pickCourse(e.target.value)}>
                <option value="">{ar ? 'اختار المادة…' : 'Choose a course…'}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
              {courseId && (
                <>
                  <select className="input" multiple size={Math.min(8, Math.max(3, courses.length))} value={pre} onChange={(e) => setPre(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                    {courses.filter((c) => String(c.id) !== String(courseId)).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                  <div><button type="button" className="btn btn-primary" disabled={busy} onClick={savePre}>{ar ? 'حفظ المتطلبات' : 'Save prerequisites'}</button></div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
