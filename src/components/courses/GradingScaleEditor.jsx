import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { Skeleton } from '../student/stUi';

/**
 * نظام الدرجات (التقديرات / النقاط / الحرمان / الاعتماد) — الأدمن (عام) والجامعة (جامعتها + كل كلية) والكلية (كليتها).
 * الأولوية للمادة: الكلية ← الجامعة ← الأدمن ← الافتراضي. المسح بيرجّع للموروث.
 * Backend: GET/PUT/DELETE /api/v1/grading/scale[?faculty_id=].
 */

const BASE = '/api/v1/grading/scale';
const LEVEL = { global: ['النظام العام (كل الجامعات)', 'Global scale (all universities)'], university: ['نظام الجامعة', 'University scale'], faculty: ['نظام الكلية', 'Faculty scale'] };

export default function GradingScaleEditor() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [facultyId, setFacultyId] = useState('');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((d) => {
    setData(d);
    const s = d.own || d.effective;
    setForm({
      name: s.name || '', bands: s.bands.map((b) => ({ ...b })), deprivation_fails: s.deprivation_fails,
      deprivation_letter: s.deprivation_letter, require_approval: s.require_approval, gpa_decimals: s.gpa_decimals,
    });
  }, []);

  const load = useCallback(() => api.get(BASE, { locale, ...(facultyId ? { faculty_id: facultyId } : {}) }).then((j) => apply(j.data)), [locale, facultyId, apply]);
  useEffect(() => { setData(null); load().catch((e) => setError(errorMessage(e))); }, [load]);

  const q = facultyId ? { faculty_id: facultyId } : {};
  const qs = facultyId ? `?faculty_id=${facultyId}` : '';

  async function run(fn) {
    setSaving(true); setError(null); setNotice(null);
    try { const j = await fn(); apply(j.data); setNotice(j.message); } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  const save = () => run(() => api.put(BASE + qs, { ...form, ...q, locale }));
  const reset = () => window.confirm(ar ? 'مسح النظام والرجوع للموروث؟' : 'Remove this scale and inherit?') && run(() => api.del(BASE + qs));
  const useDefaults = () => apply({ ...data, own: null, effective: data.defaults });

  const setBand = (i, k, v) => setForm((f) => ({ ...f, bands: f.bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));
  const addBand = () => setForm((f) => ({ ...f, bands: [...f.bands, { letter: '', min_percent: '', points: '', is_fail: false }] }));
  const delBand = (i) => setForm((f) => ({ ...f, bands: f.bands.filter((_, j) => j !== i) }));

  const target = facultyId ? 'faculty' : data?.level;

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'نظام الدرجات' : 'Grading scale'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{ar ? 'حدّد التقديرات ونقاط الـ GPA وسياسة الحرمان والاعتماد. الأقرب للمادة (كلية ← جامعة ← عام) هو اللي بيتطبّق.' : 'Define grades, GPA points, deprivation and approval policy. The closest level to the course wins (faculty → university → global).'}</p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      {!data || !form ? <Skeleton h={120} count={3} /> : (
        <div className="ex-card">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {data.faculties && (
              <select className="ex-select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} aria-label={ar ? 'المستوى' : 'Level'}>
                <option value="">{ar ? 'نظام الجامعة' : 'University scale'}</option>
                {data.faculties.map((f) => <option key={f.id} value={f.id}>{ar ? (f.name_ar || f.name_en) : (f.name_en || f.name_ar)}{f.has_own ? ' ✓' : ''}</option>)}
              </select>
            )}
            <b>{LEVEL[target]?.[ar ? 0 : 1]}</b>
            <span className={`att-pill att-pill--${data.own ? 'present' : 'excused'}`}>{data.own ? (ar ? 'نظام خاص' : 'Custom') : (ar ? 'موروث / افتراضي' : 'Inherited / default')}</span>
          </div>

          <div className="ex-table-wrap">
            <table className="ex-table">
              <thead><tr><th>{ar ? 'التقدير' : 'Grade'}</th><th>{ar ? 'من نسبة (%)' : 'Min %'}</th><th>{ar ? 'نقاط GPA' : 'GPA points'}</th><th>{ar ? 'رسوب' : 'Fail'}</th><th /></tr></thead>
              <tbody>
                {form.bands.map((b, i) => (
                  <tr key={i}>
                    <td><input className="form-input" style={{ width: 80 }} maxLength={8} value={b.letter} onChange={(e) => setBand(i, 'letter', e.target.value)} /></td>
                    <td><input className="form-input" style={{ width: 100 }} type="number" min="0" max="100" step="0.5" value={b.min_percent} onChange={(e) => setBand(i, 'min_percent', e.target.value)} /></td>
                    <td><input className="form-input" style={{ width: 100 }} type="number" min="0" max="10" step="0.1" value={b.points} onChange={(e) => setBand(i, 'points', e.target.value)} /></td>
                    <td><input type="checkbox" checked={!!b.is_fail} onChange={(e) => setBand(i, 'is_fail', e.target.checked)} /></td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => delBand(i)}><Icon name="trash" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={addBand}><Icon name="plus" size={13} /> {ar ? 'إضافة تقدير' : 'Add grade'}</button>
          <small className="is-muted" style={{ display: 'block', marginTop: 6 }}>{ar ? 'لازم يكون فيه تقدير يبدأ من 0%.' : 'One grade must start at 0%.'}</small>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
            <label>{ar ? 'اسم النظام (اختياري)' : 'Scale name (optional)'}<input className="form-input" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>{ar ? 'خانات المعدل العشرية' : 'GPA decimals'}<input className="form-input" type="number" min="0" max="4" value={form.gpa_decimals} onChange={(e) => setForm({ ...form, gpa_decimals: e.target.value })} /></label>
            <label>{ar ? 'تقدير الحرمان' : 'Deprivation grade'}<input className="form-input" maxLength={8} value={form.deprivation_letter} onChange={(e) => setForm({ ...form, deprivation_letter: e.target.value })} /></label>
          </div>
          <label className="cr-confirm" style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={form.deprivation_fails} onChange={(e) => setForm({ ...form, deprivation_fails: e.target.checked })} /> {ar ? 'الطالب المحروم (حد الغياب) يرسب تلقائيًا في المادة' : 'Deprived students (absence limit) automatically fail the course'}</label>
          <label className="cr-confirm" style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={form.require_approval} onChange={(e) => setForm({ ...form, require_approval: e.target.checked })} /> {ar ? 'نتيجة المادة تحتاج اعتماد الكلية/الجامعة قبل النشر (الدكتور/المعيد يرفعها للاعتماد فقط)' : 'Course results need faculty/university approval before publishing (instructors can only submit)'}</label>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={save}><Icon name="check" size={14} /> {ar ? 'حفظ' : 'Save'}</button>
            <button type="button" className="btn btn-outline" disabled={saving} onClick={useDefaults}>{ar ? 'تحميل القيم الافتراضية' : 'Load defaults'}</button>
            {data.own && <button type="button" className="btn btn-ghost" disabled={saving} onClick={reset}><Icon name="trash" size={14} /> {ar ? 'مسح والرجوع للموروث' : 'Remove & inherit'}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
