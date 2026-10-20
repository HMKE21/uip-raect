import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../api/client';
import Icon from '../components/Icon';
import ReadinessRing from '../components/ReadinessRing';
import ProjectCard from '../components/ProjectCard';
import SiteFooter from '../components/SiteFooter';
import CountUp from '../components/CountUp';
import LandingNav from '../components/LandingNav';
import LandingBackdrop from '../components/LandingBackdrop';
import useScrollReveal from '../hooks/useScrollReveal';
import useAppDownload from '../hooks/useAppDownload';
import AppDownloadLink from '../components/AppDownloadLink';
import { roleHome } from '../config/roleHome';

/**
 * Landing page for both pillars of the platform (graduation projects + the Exam & Assessment System). Originally a port of app/Views/public/landing.php — Readiness Ring hero visual
 * (restyled in the Admin design language, classes .lp2-*, see styles/css/landing.css), same featured-projects grid
 * (GET /api/v1/public/landing). PublicLandingController redirects an
 * already-authenticated visitor straight to their dashboard instead of
 * rendering the page at all; mirrored here via useAuth() + <Navigate>,
 * since a SPA route can't do that server-side redirect before rendering.
 * Was previously hardcoded to "/dashboard" regardless of role, which sent
 * an already-authenticated student to the generic pilot Dashboard.jsx
 * instead of /student/dashboard — now routed through the same roleHome()
 * map Login.jsx/TwoFactor.jsx use, keyed off the decoded JWT's role claim.
 */
export default function Landing() {
  const { status, user } = useAuth();
  const { locale } = useLanguage();
  const isAr = locale === 'ar';
  const t = (en, ar) => (isAr ? ar : en);
  const app = useAppDownload();

  const [featured, setFeatured] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [tab, setTab] = useState('project');

  useEffect(() => {
    let alive = true;
    api.get('/api/v1/public/landing')
      .then((json) => {
        if (!alive) return;
        setFeatured(json.data?.featured || []);
        setLiveStats(json.data?.stats || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Scroll-reveal: cards / headings fade + rise as they enter the viewport (skipped for reduced motion).
  useScrollReveal('.lp2--fx main .lp2-head, .lp2--fx main .lp2-card, .lp2--fx main .lp2-flow__item, .lp2--fx main .pp-card, .lp2--fx main .lp2-cta', [featured.length], status !== 'authenticated');

  if (status === 'authenticated') {
    return <Navigate to={roleHome(user?.role)} replace />;
  }

  const steps = [
    ['upload', t('Upload your project', 'ارفع مشروعك'), t('Document your idea, attach your files, link your GitHub if you like.', 'وثّق فكرتك، أضف ملفاتك، واربط الكود على GitHub لو حابب.')],
    ['sparkles', t('Get your score', 'خد تقييمك'), t('AI analyzes feasibility, market fit, documentation, and innovation instantly.', 'الذكاء الاصطناعي يحلل الجدوى والسوق والتوثيق والابتكار فورًا.')],
    ['check-circle', t('University sign-off', 'اعتماد الجامعة'), t('Your university reviews and approves it before it goes public.', 'جامعتك تراجع وتعتمد المشروع قبل ما ينشر للعامة.')],
    ['eye', t('Get discovered', 'اتكتشف'), t('Your university and the wider platform see exactly this kind of work.', 'جامعتك ومنصات المنصة الأوسع تشوف مشاريع زي بتاعتك بالظبط.')],
  ];

  const roles = [
    ['award', t('Student', 'طالب'), t('Publish your graduation project, take your exams online, and see your results in one place.', 'انشر مشروع تخرجك، وادخل امتحاناتك أونلاين، وشوف نتايجك في مكان واحد.')],
    ['users', t('Instructor', 'دكتور / مدرّس'), t('Build question banks and exams, target the right students, and grade faster with AI assistance.', 'اعمل بنوك أسئلة وامتحانات، ووجّهها للطلاب المناسبين، وصحّح أسرع بمساعدة الذكاء الاصطناعي.')],
    ['building', t('University', 'جامعة'), t("Approve student projects and monitor exams and results across faculties.", 'اعتمد مشاريع الطلاب وتابع الامتحانات والنتائج على مستوى الكليات.')],
  ];

  const signals = [
    [t('Technical feasibility', 'الجدوى التقنية'), 91],
    [t('Market potential', 'إمكانات السوق'), 84],
    [t('Documentation', 'جودة التوثيق'), 88],
    [t('Innovation level', 'مستوى الابتكار'), 85],
  ];

  // Real platform numbers from GET /api/v1/public/landing (live DB counts, never hard-coded).
  const stats = [
    [liveStats?.projects_scored, t('Projects scored', 'مشروع اتقيّم')],
    [liveStats?.published_projects, t('Published projects', 'مشروع منشور')],
    [liveStats?.partner_universities, t('Partner universities', 'جامعة شريكة')],
    [liveStats?.active_students, t('Active students', 'طالب نشط')],
  ];

  const examFeatures = [
    ['layers', t('Question banks & exam builder', 'بنوك أسئلة ومنشئ امتحانات'), t('Build reusable banks, then compose exams with MCQ, true/false, short-answer and essay questions.', 'ابنِ بنوك أسئلة قابلة لإعادة الاستخدام، وركّب منها امتحانات (اختيار من متعدد، صح/خطأ، إجابة قصيرة، مقالي).')],
    ['users', t('Precise targeting', 'استهداف دقيق'), t('Assign an exam to a faculty, department, year, group, or even specific students.', 'وجّه الامتحان لكلية أو قسم أو فرقة أو مجموعة، أو لطلاب بعينهم.')],
    ['clock', t('Server-side timer & auto-save', 'مؤقت من السيرفر وحفظ تلقائي'), t('Answers save as students go, and time is enforced by the server, so a refresh or dropped connection never costs them work.', 'الإجابات بتتحفظ تلقائيًا والوقت بيتحسب من السيرفر، فالريفريش أو قطع النت مايضيّعش شغل الطالب.')],
    ['shield', t('Secure exam mode', 'وضع الامتحان الآمن'), t('Tab-switch and fullscreen events are logged, with optional camera snapshots and a single active session per student.', 'تسجيل تبديل التابات وخروج الشاشة الكاملة، مع لقطات كاميرا اختيارية وجلسة واحدة نشطة لكل طالب.')],
    ['ai-spark', t('AI-assisted grading', 'تصحيح بمساعدة الذكاء الاصطناعي'), t('MCQ is graded instantly; short-answer and essay get an AI suggestion that the instructor reviews and accepts.', 'الاختيار من متعدد بيتصحح فورًا، والإجابات القصيرة والمقالية بياخدوا اقتراح تصحيح من الذكاء الاصطناعي والدكتور بيراجعه ويعتمده.')],
    ['bar-chart', t('Analytics & results', 'تحليلات ونتائج'), t('Question-level analytics, instructor/faculty/university dashboards, result publishing and CSV export.', 'تحليلات على مستوى السؤال، ولوحات للدكتور والكلية والجامعة، ونشر النتائج وتصديرها.')],
  ];

  const examSteps = [
    t('Build', 'جهّز'), t('Target', 'استهدف'), t('Take', 'امتحن'), t('Grade', 'صحّح'), t('Analyze', 'حلّل'),
  ];

  const examLines = [
    [t('Questions answered', 'أسئلة تمت الإجابة عنها'), 14, 20],
    [t('Time elapsed', 'الوقت المنقضي'), 38, 60],
  ];

  return (
    <div className="lp2 lp2--fx">
      <LandingNav anchors />

      <header className="lp2-hero">
        <LandingBackdrop />
        <div className="lp2-shell lp2-hero__grid">
          <div className="animate-rise-in">
            <span className="lp2-pill"><Icon name="sparkles" size={14} /> {t('Projects and exams, one platform', 'مشاريع وامتحانات، في منصة واحدة')}</span>
            <h1>
              {t('Publish your projects. ', 'انشر مشاريعك. ')}
              <span>{t('Run your exams. All on UIP.', 'وادِّ امتحاناتك. كله على UIP.')}</span>
            </h1>
            <p className="lp2-lead">
              {t(
                'UIP brings graduation projects and a complete online exam system together: get an instant AI Readiness Score for your project, and build, run, grade and analyze exams, securely.',
                'UIP بتجمع مشاريع التخرج ومنصة امتحانات أونلاين متكاملة: خُد درجة جاهزية فورية لمشروعك بالذكاء الاصطناعي، وجهّز وادِّ وصحّح وحلّل الامتحانات بأمان.'
              )}
            </p>
            <div className="lp2-hero__ctas">
              <Link to="/auth/register" className="btn btn-primary btn-lg"><Icon name="sparkles" size={18} /> {t('Create your free account', 'انشئ حسابك المجاني')}</Link>
              <Link to="/auth/login" className="btn btn-outline btn-lg">{t('I already have an account', 'عندي حساب بالفعل')}</Link>
              {app && <AppDownloadLink app={app} className="btn btn-outline btn-lg" iconSize={18} logo />}
            </div>
            <p className="lp2-note"><Icon name="check-circle" size={14} /> {t('Free for students, always. No credit card required.', 'مجاني للطلاب دايمًا. مفيش بطاقة ائتمان مطلوبة.')}</p>
          </div>

          <div className="animate-rise-in" style={{ animationDelay: '.12s' }}>
            <div className="lp2-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'project'} className={tab === 'project' ? 'is-active' : ''} onClick={() => setTab('project')}><Icon name="projects" size={14} /> {t('Projects', 'المشاريع')}</button>
              <button type="button" role="tab" aria-selected={tab === 'exam'} className={tab === 'exam' ? 'is-active' : ''} onClick={() => setTab('exam')}><Icon name="note" size={14} /> {t('Exams', 'الامتحانات')}</button>
            </div>

            {tab === 'project' ? (
              <div className="lp2-mock" aria-label={t('Sample readiness score', 'عينة من درجة الجاهزية')}>
                <div className="lp2-mock__bar">
                  <span className="lp2-mock__title">{t('AI Readiness Score', 'درجة الجاهزية')}</span>
                  <span className="lp2-mock__sample">{t('Sample', 'عينة')}</span>
                </div>
                <div className="lp2-mock__body">
                  <ReadinessRing score={87} size={150} caption={t('Readiness', 'الجاهزية')} />
                  <div className="lp2-signals">
                    {signals.map(([label, value]) => (
                      <div className="lp2-signal" key={label}>
                        <div className="lp2-signal__top"><span>{label}</span><strong>{value}</strong></div>
                        <div className="lp2-signal__track"><span style={{ width: `${value}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lp2-mock__foot">
                  <span className="lp2-badge"><Icon name="check-circle" size={13} /> {t('Ready to publish', 'جاهز للنشر')}</span>
                  <span>{t('A sample of the score your project gets seconds after upload.', 'عينة من التقييم اللي مشروعك بياخده بعد ثواني من الرفع.')}</span>
                </div>
              </div>
            ) : (
              <div className="lp2-mock" aria-label={t('Sample exam session', 'عينة من جلسة امتحان')}>
                <div className="lp2-mock__bar">
                  <span className="lp2-mock__title">{t('Exam in progress', 'امتحان جارٍ')}</span>
                  <span className="lp2-mock__sample">{t('Sample', 'عينة')}</span>
                </div>
                <div className="lp2-exam">
                  <div className="lp2-exam__timer"><Icon name="clock" size={16} /> <strong>21:42</strong> <span>{t('left', 'متبقي')}</span></div>
                  <div className="lp2-exam__q">
                    <small>{t('Question 14 of 20', 'سؤال 14 من 20')}</small>
                    <p>{t('Which HTTP status code means a resource was created?', 'أي كود HTTP بيدل إن المورد اتعمل بنجاح؟')}</p>
                    <ul>
                      <li>200</li>
                      <li className="is-picked"><Icon name="check-circle" size={14} /> 201</li>
                      <li>204</li>
                      <li>301</li>
                    </ul>
                  </div>
                  {examLines.map(([label, v, max]) => (
                    <div className="lp2-signal" key={label}>
                      <div className="lp2-signal__top"><span>{label}</span><strong>{v}/{max}</strong></div>
                      <div className="lp2-signal__track"><span style={{ width: `${(v / max) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="lp2-mock__foot">
                  <span className="lp2-badge"><Icon name="shield" size={13} /> {t('Secure mode', 'وضع آمن')}</span>
                  <span>{t('Answers auto-save. The timer runs on the server.', 'الإجابات بتتحفظ تلقائيًا والمؤقت شغّال من السيرفر.')}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lp2-shell">
          <div className="lp2-stats">
            {stats.map(([num, label]) => (
              <div key={label}><div className="lp2-stats__num">{num == null ? '—' : <CountUp value={num} locale={locale} />}</div><div className="lp2-stats__label">{label}</div></div>
            ))}
          </div>
        </div>
      </header>

      <main>
        <section className="lp2-section lp2-shell" id="how">
          <div className="lp2-head">
            <span className="lp2-eyebrow">{t('Projects', 'المشاريع')}</span>
            <h2>{t('From upload to opportunity, in four steps', 'من الرفع للفرصة، في أربع خطوات')}</h2>
          </div>
          <div className="lp2-steps">
            {steps.map(([icon, title, desc], i) => (
              <div className="lp2-card lp2-step" key={title}>
                <div className="lp2-step__top">
                  <span className="lp2-icon"><Icon name={icon} size={18} /></span>
                  <span className="lp2-step__num">0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp2-section lp2-shell" id="exams">
          <div className="lp2-head">
            <span className="lp2-eyebrow">{t('Exams', 'الامتحانات')}</span>
            <h2>{t('A complete online exam platform, built in', 'منصة امتحانات أونلاين متكاملة، جوّه المنصة')}</h2>
            <p className="lp2-head__sub">{t('Everything from the question bank to the analytics dashboard, with no extra tools to stitch together.', 'من بنك الأسئلة لحد لوحة التحليلات، من غير أدوات إضافية تلزق فيها.')}</p>
          </div>
          <div className="lp2-flow" aria-label={t('Exam workflow', 'مراحل الامتحان')}>
            {examSteps.map((label, i) => (
              <span key={label} className="lp2-flow__item"><b>{i + 1}</b>{label}</span>
            ))}
          </div>
          <div className="lp2-features">
            {examFeatures.map(([icon, title, desc]) => (
              <div className="lp2-card" key={title}>
                <span className="lp2-icon"><Icon name={icon} size={18} /></span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {featured.length > 0 && (
          <section className="lp2-section lp2-shell" id="featured">
            <div className="lp2-head lp2-head--row">
              <div>
                <span className="lp2-eyebrow">{t('Featured', 'مشاريع مميزة')}</span>
                <h2>{t('Some of the best work published on the platform', 'من أفضل اللي اتنشر على المنصة')}</h2>
              </div>
              <Link to="/projects" className="btn btn-outline">{t('Explore all projects', 'استكشف كل المشاريع')} <Icon name="arrow-right" size={16} /></Link>
            </div>
            <div className="public-projects-grid">
              {featured.map((p, i) => (
                <ProjectCard key={p.uuid || p.slug || i} project={p} locale={locale} index={i} showUniversity />
              ))}
            </div>
          </section>
        )}

        <section className="lp2-section lp2-shell" id="roles">
          <div className="lp2-head">
            <span className="lp2-eyebrow">{t("Who it's for", 'مين يستفيد')}</span>
            <h2>{t('One platform, every side of learning and innovation', 'منصة واحدة، لكل أطراف التعليم والابتكار')}</h2>
          </div>
          <div className="lp2-roles">
            {roles.map(([icon, title, desc]) => (
              <div className="lp2-card lp2-role" key={title}>
                <span className="lp2-icon"><Icon name={icon} size={20} /></span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {app && (
          <section className="lp2-section lp2-shell" id="app">
            <div className="lp2-card lp2-app">
              <div className="lp2-app__info">
                <span className="lp2-app__logo"><img src="/images/logo/uip-mark.png" srcSet="/images/logo/uip-mark@2x.png 2x" alt="UIP" /></span>
                <div>
                  <span className="lp2-eyebrow">{t('Mobile app', 'تطبيق الموبايل')}{app.version ? ` · v${app.version}` : ''}</span>
                  <h2>{app.native ? t('Enjoying UIP? Share the app with your friends', 'عجبتك UIP؟ شارك التطبيق مع أصحابك') : t('Take UIP with you — get the Android app', 'خد UIP معاك — حمّل تطبيق الأندرويد')}</h2>
                  <p>{app.native ? t('Send the download link on WhatsApp, Telegram or anywhere you like.', 'ابعت رابط التحميل على واتساب أو تيليجرام أو أي مكان.') : t('Exams, messages and notifications on your phone, even when the app is closed.', 'الامتحانات والرسائل والإشعارات على موبايلك، حتى لو التطبيق مقفول.')}</p>
                </div>
              </div>
              {app.native ? (
                <AppDownloadLink app={app} className="btn btn-primary btn-lg" iconSize={18} logo />
              ) : (
                <a href={app.url} className="btn btn-primary btn-lg app-dl" target="_blank" rel="noopener noreferrer">
                  <span className="app-dl__logo" aria-hidden="true"><img src="/images/logo/uip-mark.png" srcSet="/images/logo/uip-mark@2x.png 2x" alt="" width="28" height="28" /></span>
                  <Icon name="download" size={18} /> {t('Download for Android', 'تحميل للأندرويد')}
                </a>
              )}
            </div>
            {!app.native && <p className="lp2-app__note">{t('If Android asks, allow installing from this source. The file is an .apk.', 'لو أندرويد سألك، اسمح بالتثبيت من المصدر ده. الملف بصيغة .apk.')}</p>}
          </section>
        )}

        <section className="lp2-shell lp2-cta-wrap">
          <div className="lp2-cta">
            <h2>{t('Ready to publish your project or run your next exam?', 'جاهز تنشر مشروعك أو تعمل امتحانك الجاي؟')}</h2>
            <p>{t('Signup takes under a minute.', 'التسجيل بياخد أقل من دقيقة.')}</p>
            <Link to="/auth/register" className="btn btn-lg">{t('Create your free account now', 'انشئ حسابك المجاني الآن')}</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
