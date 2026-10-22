import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { ExKpi } from '../exam/examUi';
import { Field, FormModal, FormSection } from '../people/formUi';
import { downloadAuthed } from '../../lib/download';

/**
 * تكليفاتي (الطالب): كل تكليفات مواده، التسليم (نص و/أو ملف)، إعادة التسليم قبل التصحيح، والدرجة والتعليق.
 * Backend: GET /api/v1/assignments/my · POST /api/v1/assignments/courses/{id}/{aid}/submit.
 */

export const STATE = {
  open: { ar: 'مطلوب', en: 'To do', cls: 'late' },
  late_open: { ar: 'متأخر — لسه مفتوح', en: 'Overdue — still open', cls: 'absent' },
  missed: { ar: 'فاتك الموعد', en: 'Missed', cls: 'absent' },
  submitted: { ar: 'تم التسليم', en: 'Submitted', cls: 'excused' },
  returned: { ar: 'مطلوب تعديل', en: 'Needs changes', cls: 'late' },
  graded: { ar: 'تم التصحيح', en: 'Graded', cls: 'present' },
};

export const fmtDate = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');
export const fmtSize = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function dueText(a, ar) {
  if (!a.due_at) return ar ? 'بدون موعد' : 'No deadline';
  const ms = new Date(String(a.due_at).replace(' ', 'T')).getTime() - Date.now();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const span = d ? (ar ? `${d} يوم` : `${d}d`) : (ar ? `${h} ساعة` : `${h}h`);
  return ms >= 0 ? (ar ? `باقي ${span}` : `${span} left`) : (ar ? `متأخر ${span}` : `${span} overdue`);
}

export default function StudentAssignments() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('todo');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => api.get('/api/v1/assignments/my', { locale }).then((j) => setRows(j.data || [])), [locale]);
  useEffect(() => { load().catch((e) => setError(errorMessage(e))).finally(() => setLoading(false)); }, [load]);

  const groups = useMemo(() => ({
    todo: rows.filter((a) => ['open', 'late_open', 'returned'].includes(a.state)),
    done: rows.filter((a) => ['submitted', 'graded'].includes(a.state)),
    missed: rows.filter((a) => a.state === 'missed'),
  }), [rows]);
  const shown = groups[tab] || [];
  const graded = rows.filter((a) => a.state === 'graded');

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'التكليفات' : 'Assignments'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{ar ? 'تكليفات موادك: سلّم قبل الموعد وتابع درجاتك وتعليقات الدكتور.' : 'Your course assignments: submit before the deadline and track grades and feedback.'}</p>
      </div>

      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      <div className="ex-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <ExKpi label={ar ? 'مطلوب منك' : 'To do'} value={groups.todo.length} icon="clock" tone={groups.todo.length ? 'bad' : 'good'} />
        <ExKpi label={ar ? 'تم تسليمها' : 'Submitted'} value={groups.done.length} icon="check-circle" tone="good" />
        <ExKpi label={ar ? 'فاتها الموعد' : 'Missed'} value={groups.missed.length} icon="alert-triangle" tone={groups.missed.length ? 'bad' : ''} />
        <ExKpi label={ar ? 'تم تصحيحها' : 'Graded'} value={graded.length} icon="award" />
      </div>

      <div className="ex-card">
        <div className="att-tabs">
          {[['todo', ar ? 'المطلوبة' : 'To do'], ['done', ar ? 'المسلّمة' : 'Submitted'], ['missed', ar ? 'الفائتة' : 'Missed']].map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l} ({groups[k].length})</button>
          ))}
        </div>
        {loading ? <Skeleton h={80} count={3} /> : shown.length === 0 ? (
          <EmptyState icon="check-circle" title={ar ? 'لا توجد تكليفات هنا' : 'Nothing here'} />
        ) : (
          <div className="as-list">
            {shown.map((a) => {
              const st = STATE[a.state] || STATE.open;
              const canSubmit = a.state !== 'graded' && a.state !== 'missed';
              return (
                <div key={a.id} className="as-card">
                  <div className="as-card__head">
                    <div>
                      <span className="att-course__code">{a.course?.code}</span>
                      <div className="att-course__name">{a.title}</div>
                      <small className="is-muted">{a.course?.name}</small>
                    </div>
                    <span className={`att-pill att-pill--${st.cls}`}>{ar ? st.ar : st.en}</span>
                  </div>
                  {a.body && <p className="as-body">{a.body}</p>}
                  <div className="att-nums">
                    <span><Icon name="clock" size={12} /> {fmtDate(a.due_at)} · <b>{dueText(a, ar)}</b></span>
                    <span>{ar ? 'الدرجة العظمى' : 'Max'} <b>{a.max_score}</b></span>
                    {a.weight != null && <span>{ar ? 'الوزن' : 'Weight'} <b>{a.weight}%</b></span>}
                  </div>
                  {a.submission?.status === 'graded' && (
                    <div className="st-alert"><Icon name="award" size={15} /><span><b>{a.submission.score} / {a.max_score}</b>{a.submission.feedback ? ` — ${a.submission.feedback}` : ''}</span></div>
                  )}
                  {a.submission?.status === 'returned' && (
                    <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={15} /><span>{ar ? 'الدكتور طلب تعديل: ' : 'Changes requested: '}{a.submission.feedback || ''}</span></div>
                  )}
                  {a.submission && <small className="is-muted">{ar ? 'آخر تسليم' : 'Last submitted'}: {fmtDate(a.submission.submitted_at)}{a.submission.is_late ? (ar ? ' (متأخر)' : ' (late)') : ''}{a.submission.file_name ? ` · ${a.submission.file_name}` : ''}</small>}
                  <div className="as-actions">
                    {a.has_file && <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadAuthed(`/api/v1/assignments/courses/${a.course_id}/${a.id}/file`, a.file_name).catch((e) => setError(errorMessage(e)))}><Icon name="download" size={13} /> {ar ? 'مرفق التكليف' : 'Attachment'}</button>}
                    {a.submission?.has_file && <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadAuthed(`/api/v1/assignments/courses/${a.course_id}/${a.id}/submissions/${a.submission.student_id}/file`, a.submission.file_name).catch((e) => setError(errorMessage(e)))}><Icon name="paperclip" size={13} /> {ar ? 'ملف تسليمي' : 'My file'}</button>}
                    {canSubmit && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setNotice(null); setDialog(a); }}><Icon name="upload" size={13} /> {a.submission ? (ar ? 'إعادة التسليم' : 'Resubmit') : (ar ? 'تسليم' : 'Submit')}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dialog && <SubmitDialog a={dialog} ar={ar} locale={locale} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); setNotice(m); load().catch(() => {}); }} />}
    </div>
  );
}

function SubmitDialog({ a, ar, locale, onClose, onDone }) {
  const [body, setBody] = useState(a.submission?.body || '');
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const hasExisting = a.submission?.has_file && !removeFile;

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!body.trim() && !file && !hasExisting) { setError(ar ? 'اكتب إجابتك أو ارفع ملفًا.' : 'Write your answer or upload a file.'); return; }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('locale', locale);
      fd.append('body', body.trim());
      if (file) fd.append('file', file);
      else if (removeFile) fd.append('remove_file', '1');
      const j = await api.postForm(`/api/v1/assignments/courses/${a.course_id}/${a.id}/submit`, fd);
      onDone(j?.message);
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <FormModal title={ar ? 'تسليم التكليف' : 'Submit assignment'} subtitle={a.title} icon="upload" onClose={onClose} onSubmit={submit} saving={saving} submitLabel={ar ? 'تسليم' : 'Submit'} error={error}>
      <FormSection title={ar ? 'إجابتك' : 'Your answer'} hint={a.is_past_due ? (ar ? 'الموعد فات — هيتسجّل التسليم كمتأخر.' : 'Deadline passed — this will be marked late.') : undefined}>
        <Field label={ar ? 'نص الإجابة (اختياري لو هترفع ملف)' : 'Answer text (optional if you upload a file)'} wide>
          <textarea className="form-input" rows={6} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label={ar ? 'ملف' : 'File'} wide hint={ar ? 'pdf, docx, pptx, zip, صور، وملفات كود (py, java, cpp, js, ipynb…) — حتى 20 ميجا' : 'pdf, docx, pptx, zip, images and code files (py, java, cpp, js, ipynb…) — up to 20 MB'}>
          {hasExisting && !file && (
            <div className="cm-current"><Icon name="paperclip" size={14} /> <bdi>{a.submission.file_name}</bdi>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoveFile(true)}><Icon name="trash" size={13} /> {ar ? 'إزالة' : 'Remove'}</button></div>
          )}
          {removeFile && !file && <div className="cm-current"><span>{ar ? 'سيتم حذف الملف الحالي.' : 'The current file will be removed.'}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoveFile(false)}>{ar ? 'تراجع' : 'Undo'}</button></div>}
          <input className="form-input" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && <small className="pf-hint">{file.name} · {fmtSize(file.size)}</small>}
        </Field>
      </FormSection>
    </FormModal>
  );
}
