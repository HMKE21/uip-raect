import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../api/client';
import Icon from '../components/Icon';
import SiteFooter from '../components/SiteFooter';
import LandingNav from '../components/LandingNav';
import LandingBackdrop from '../components/LandingBackdrop';

/**
 * Port of app/Views/public/verify-certificate.php — same form + found/
 * revoked/not-found states, talking to GET /api/v1/public/verify-certificate
 * instead of the PHP-rendered ?number= query. Same "a revoked certificate
 * still resolves, clearly marked" rule as the PHP page. Restyled in the Admin
 * design language (.lp2-* / .lp2-vc-*, see styles/css/landing.css).
 */
export default function VerifyCertificate() {
  const { locale } = useLanguage();
  const isAr = locale === 'ar';
  const t = (en, ar) => (isAr ? ar : en);
  const [searchParams, setSearchParams] = useSearchParams();

  const [draft, setDraft] = useState(searchParams.get('number') || '');
  const [number, setNumber] = useState(searchParams.get('number') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runLookup = (value) => {
    const trimmed = value.trim();
    setNumber(trimmed);
    setSearchParams(trimmed ? { number: trimmed } : {});
    if (!trimmed) { setSearched(false); setResult(null); return; }
    setLoading(true);
    setSearched(true);
    api.get(`/api/v1/public/verify-certificate?number=${encodeURIComponent(trimmed)}`)
      .then((json) => setResult(json.data?.result || null))
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  };

  const pick = (en, ar) => (isAr ? (ar || en) : (en || ar));
  const university = result ? pick(result.university_name_en, result.university_name_ar) : '';
  const degree = result ? pick(result.degree_title_en, result.degree_title_ar) : '';
  const revoked = result?.status === 'revoked';

  const rows = result ? [
    [t('Name', 'الاسم'), pick(result.student_name_en, result.student_name_ar) || result.student_name],
    [t('University', 'الجامعة'), university],
    !revoked && degree ? [t('Degree', 'الدرجة'), degree] : null,
    !revoked && result.graduation_date ? [t('Graduation date', 'تاريخ التخرج'), result.graduation_date] : null,
    [t('Certificate number', 'رقم الشهادة'), number],
  ].filter((r) => r && r[1]) : [];

  return (
    <div className="lp2 lp2-page lp2--fx">
      <LandingNav />

      <div className="lp2-vc-stage">
      <LandingBackdrop compact />
      <main className="lp2-vc">
        <div className="lp2-vc__head animate-rise-in">
          <span className="lp2-icon lp2-icon--lg"><Icon name="shield" size={24} /></span>
          <h1>{t('Verify a Graduation Certificate', 'التحقق من شهادة التخرج')}</h1>
          <p>
            {t(
              'Enter the certificate number printed on the certificate to verify its authenticity.',
              'أدخل رقم الشهادة الموجود أسفل الشهادة المطبوعة للتحقق من صحتها.'
            )}
          </p>
        </div>

        <form className="lp2-vc__form" onSubmit={(e) => { e.preventDefault(); runLookup(draft); }}>
          <div className="lp2-vc__field">
            <Icon name="search" size={16} />
            <input
              className="form-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('e.g. UIP-3-2026-0001', 'مثال: UIP-3-2026-0001')}
              aria-label={t('Certificate number', 'رقم الشهادة')}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || draft.trim() === ''}>
            {loading ? t('Checking…', 'جارِ التحقق…') : t('Verify', 'تحقق')}
          </button>
        </form>

        <div className="lp2-vc__result" role="status" aria-live="polite">
          {loading && (
            <div className="lp2-vc-card lp2-vc-card--loading">
              <span className="lp2-spinner" aria-hidden="true" />
              {t('Checking…', 'جارِ التحقق…')}
            </div>
          )}

          {!loading && searched && number !== '' && (
            !result ? (
              <div className="lp2-vc-card lp2-vc-card--bad">
                <div className="lp2-vc-card__head">
                  <span className="lp2-vc-card__icon"><Icon name="x-circle" size={22} /></span>
                  <div>
                    <h2>{t('Certificate number not found.', 'رقم الشهادة غير صحيح.')}</h2>
                    <p>{t('Make sure the number matches exactly what is printed.', 'تأكد من إدخال الرقم كما هو مطبوع بالضبط.')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`lp2-vc-card ${revoked ? 'lp2-vc-card--warn' : 'lp2-vc-card--ok'}`}>
                <div className="lp2-vc-card__head">
                  <span className="lp2-vc-card__icon"><Icon name={revoked ? 'alert-triangle' : 'check-circle'} size={22} /></span>
                  <div>
                    <h2>{revoked ? t('This certificate has been revoked.', 'هذه الشهادة ملغاة.') : t('Valid certificate.', 'شهادة صحيحة وسارية.')}</h2>
                    <span className="lp2-vc-status">{revoked ? t('Revoked', 'ملغاة') : t('Verified', 'موثّقة')}</span>
                  </div>
                </div>
                <dl className="lp2-vc-facts">
                  {rows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd dir={label === t('Certificate number', 'رقم الشهادة') ? 'ltr' : undefined}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          )}
        </div>
      </main>
      </div>

      <SiteFooter />
    </div>
  );
}
