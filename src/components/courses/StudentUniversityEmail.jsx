import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';

/**
 * الإيميل الجامعي (الطالب): العنوان الرسمي اللي ولّدته الجامعة، وبيتحوّل لإيميلك الشخصي. مفيش صندوق وارد على المنصة.
 * Backend: GET /api/v1/university-email/mine.
 */
export default function StudentUniversityEmail() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.get('/api/v1/university-email/mine', { locale }).then((j) => setData(j.data || {})).catch((e) => setError(errorMessage(e))); }, [locale]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(data.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'الإيميل الجامعي' : 'University email'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {ar ? 'عنوانك الرسمي في الجامعة. الرسائل المرسلة له بتتحوّل لإيميلك الشخصي.' : 'Your official university address. Mail sent to it is forwarded to your personal email.'}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {!data && !error ? <Skeleton h={90} count={1} /> : data && (
        <div className="ex-card">
          {!data.address ? (
            <EmptyState icon="mail" title={ar ? 'لم يتم إنشاء عنوان لك بعد' : 'No address has been created for you yet'} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span dir="ltr" style={{ fontSize: 20, fontWeight: 700 }}>{data.address}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ' : 'Copy')}</button>
              </div>
              <div className="att-nums"><span>{ar ? 'يتحوّل إلى' : 'Forwards to'} <b dir="ltr">{data.forwards_to}</b></span></div>
              <div className="is-muted" style={{ fontSize: 12 }}>{ar ? 'لتغيير الإيميل الشخصي اللي بيتحوّل له، حدّثه من إعدادات حسابك.' : 'To change where it forwards, update your personal email in account settings.'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
