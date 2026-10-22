import { Fragment, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { ExKpi } from '../exam/examUi';
import { downloadAuthed } from '../../lib/download';

/**
 * كشف الدرجات والـ GPA (الطالب): النتايج المنشورة بس، لكل فصل وتراكمي + تفاصيل مكوّنات كل مادة + PDF.
 * Backend: GET /api/v1/grading/transcript · GET /api/v1/grading/transcript/pdf.
 */

const TYPE = { exam: ['امتحان', 'Exam'], assignment: ['تكليف', 'Assignment'], attendance: ['حضور', 'Attendance'], manual: ['أعمال فصلية', 'Coursework'] };

export default function StudentGrades() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get('/api/v1/grading/transcript', { locale }).then((j) => setData(j.data)).catch((e) => setError(errorMessage(e)));
  }, [locale]);

  const cum = data?.cumulative;

  return (
    <div className="ex-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'كشف الدرجات والمعدل' : 'Grades & GPA'}</h1>
          <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{ar ? 'نتايج موادك بعد ما يتم نشرها، والمعدل لكل فصل وتراكمي.' : 'Your published course results with term and cumulative GPA.'}</p>
        </div>
        <button type="button" className="btn btn-outline" disabled={!cum?.courses} onClick={() => downloadAuthed('/api/v1/grading/transcript/pdf', 'transcript.pdf', { locale }).catch((e) => setError(errorMessage(e)))}>
          <Icon name="download" size={14} /> {ar ? 'تحميل PDF' : 'Download PDF'}
        </button>
      </div>

      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {!data && !error ? <Skeleton h={100} count={3} /> : data && (
        <>
          <div className="ex-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <ExKpi label={ar ? 'المعدل التراكمي' : 'Cumulative GPA'} value={cum.gpa ?? '—'} icon="award" tone="good" />
            <ExKpi label={ar ? 'الساعات المسجّلة' : 'Attempted hours'} value={cum.attempted_hours} icon="layers" />
            <ExKpi label={ar ? 'الساعات المنجزة' : 'Earned hours'} value={cum.earned_hours} icon="check-circle" />
            <ExKpi label={ar ? 'مواد ظاهرة نتيجتها' : 'Graded courses'} value={cum.courses} icon="file" />
          </div>

          {data.terms.length === 0 ? (
            <div className="ex-card"><EmptyState icon="award" title={ar ? 'لا توجد نتائج منشورة بعد' : 'No published results yet'} /></div>
          ) : data.terms.map((t) => (
            <div className="ex-card" key={`${t.academic_year}-${t.semester}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <b>{t.academic_year ? `${ar ? 'السنة' : 'Year'} ${t.academic_year}` : (ar ? 'مواد أخرى' : 'Other courses')}{t.semester ? ` — ${ar ? 'الترم' : 'Semester'} ${t.semester}` : ''}</b>
                <span className="att-nums"><span>{ar ? 'معدل الفصل' : 'Term GPA'} <b>{t.gpa ?? '—'}</b></span><span>{ar ? 'التراكمي' : 'Cumulative'} <b>{t.cumulative_gpa ?? '—'}</b></span><span>{ar ? 'الساعات' : 'Hours'} <b>{t.attempted_hours}</b></span></span>
              </div>
              <div className="ex-table-wrap">
                <table className="ex-table">
                  <thead><tr><th>{ar ? 'الكود' : 'Code'}</th><th>{ar ? 'المادة' : 'Course'}</th><th>{ar ? 'الساعات' : 'Hours'}</th><th>%</th><th>{ar ? 'التقدير' : 'Grade'}</th><th>{ar ? 'النقاط' : 'Points'}</th><th /></tr></thead>
                  <tbody>
                    {t.courses.map((c) => (
                      <Fragment key={c.course_id}>
                        <tr>
                          <td dir="ltr">{c.code}</td><td>{c.name}{!c.counted && <small className="is-muted"> ({ar ? 'بدون ساعات — خارج المعدل' : 'no hours — excluded'})</small>}</td>
                          <td>{c.credit_hours ?? '—'}</td><td>{c.percentage}</td>
                          <td><span className={`att-pill att-pill--${c.is_fail ? 'absent' : 'present'}`}>{c.letter}</span>{c.deprived && <small className="is-muted"> {ar ? 'محروم' : 'deprived'}</small>}</td>
                          <td>{c.grade_points.toFixed(2)}</td>
                          <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open === c.course_id ? null : c.course_id)}>{ar ? 'التفاصيل' : 'Details'}</button></td>
                        </tr>
                        {open === c.course_id && (
                          <tr><td colSpan={7}>
                            <div className="att-nums" style={{ flexDirection: 'column', gap: 4 }}>
                              {(c.breakdown || []).map((b) => (
                                <span key={`${b.type}-${b.id}`}>{TYPE[b.type]?.[ar ? 0 : 1] || b.type}: <b>{b.title}</b> — {b.points} / {b.weight}{b.percentage != null ? ` (${b.percentage}%)` : ''}</span>
                              ))}
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {data.in_progress.length > 0 && (
            <div className="ex-card">
              <b>{ar ? 'مواد لم تظهر نتيجتها بعد' : 'Results pending'}</b>
              <div className="att-nums" style={{ marginTop: 8 }}>{data.in_progress.map((c) => <span key={c.course_id}>{c.code} — {c.name}</span>)}</div>
            </div>
          )}

          <div className="ex-card">
            <b>{ar ? 'نظام التقديرات المعتمد' : 'Grading scale'}</b>
            <div className="att-nums" style={{ marginTop: 8 }}>
              {data.scale.bands.map((b) => <span key={b.letter}><b>{b.letter}</b> ≥ {b.min_percent}% = {b.points.toFixed(2)}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
