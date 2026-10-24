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
import useAppDownload from '../hooks/useAppDownload';
import AppDownloadLink from '../components/AppDownloadLink';
import { roleHome } from '../config/roleHome';

/**
 * Landing page — simple and clean (.lp2 design, see styles/css/landing.css).
 * Hero + live numbers, then one card grid per pillar (chat & meetings, My PC, AI, exams), the project publishing steps,
 * roles and the app download band. No drawn mock windows: every section is plain cards so the page stays light and readable
 * in both languages and both themes. Live numbers come from GET /api/v1/public/landing and are never hard-coded.
 * An already-authenticated visitor is sent to their dashboard via roleHome().
 */

function Section({ id, eyebrow, title, sub, children }) {
  return (
    <section className="lp2-section lp2-shell" id={id}>
      <div className="lp2-head">
        <span className="lp2-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {sub && <p className="lp2-head__sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Cards({ items }) {
  return (
    <div className="lp2-features">
      {items.map(([icon, title, desc]) => (
        <div className="lp2-card" key={title}>
          <span className="lp2-icon"><Icon name={icon} size={18} /></span>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { status, user } = useAuth();
  const { locale } = useLanguage();
  const isAr = locale === 'ar';
  const t = (en, ar) => (isAr ? ar : en);
  const app = useAppDownload();

  const [featured, setFeatured] = useState([]);
  const [liveStats, setLiveStats] = useState(null);

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

  if (status === 'authenticated') {
    return <Navigate to={roleHome(user?.role)} replace />;
  }

  const stats = [
    [liveStats?.active_students, t('active students', 'طالب نشط')],
    [liveStats?.partner_universities, t('partner universities', 'جامعة شريكة')],
    [liveStats?.published_projects, t('published projects', 'مشروع منشور')],
    [liveStats?.projects_scored, t('projects scored by AI', 'مشروع اتقيّم بالذكاء الاصطناعي')],
  ];

  const steps = [
    [t('Upload', 'ارفع'), t('Describe your idea and attach files or your GitHub repo.', 'اكتب فكرتك وأضف ملفاتك أو رابط GitHub.')],
    [t('Get scored', 'خد تقييمك'), t('AI rates feasibility, market fit, documentation and innovation.', 'الذكاء الاصطناعي يقيّم الجدوى والسوق والتوثيق والابتكار.')],
    [t('Get approved', 'اتعتمد'), t('Your university reviews it before it goes public.', 'جامعتك تراجعه قبل ما يتنشر.')],
    [t('Get discovered', 'اتكتشف'), t('Published projects are open to universities and companies.', 'المشاريع المنشورة بتظهر للجامعات والشركات.')],
  ];

  const audiences = [
    [t('Students', 'الطلاب'), [
      t('Courses, timetable, attendance and grades', 'المواد والجدول والحضور والدرجات'),
      t('Assignments and exams in one place', 'التكاليف والامتحانات في مكان واحد'),
      t('Portfolio, patents and GitHub link', 'بورتفوليو وبراءات اختراع وربط GitHub'),
      t('Graduation certificate with public verification', 'شهادة تخرج بتتحقق منها أي جهة'),
    ]],
    [t('Instructors and supervisors', 'الدكاترة والمشرفون'), [
      t('Question banks and exam builder', 'بنوك أسئلة ومنشئ امتحانات'),
      t('AI-assisted grading you review', 'تصحيح بمساعدة الذكاء الاصطناعي وبمراجعتك'),
      t('Course content, attendance, timetable', 'محتوى المواد والحضور والجدول'),
      t('Project grading and similarity checks', 'تقييم المشاريع وفحص التشابه'),
    ]],
    [t('Universities and faculties', 'الجامعات والكليات'), [
      t('Approve student projects and graduation', 'اعتماد المشاريع والتخرج'),
      t('Registration, fees, summer terms', 'التسجيل والرسوم والفصل الصيفي'),
      t('University email and announcements', 'البريد الجامعي والإعلانات'),
      t('Chat oversight and reports', 'متابعة الشات والبلاغات'),
    ]],
    [t('Data and security teams', 'فرق البيانات والأمن'), [
      t('Dashboards, KPIs, forecasting, data quality', 'لوحات ومؤشرات وتنبؤ وجودة بيانات'),
      t('Exam analytics and AI insights', 'تحليلات الامتحانات ورؤى الذكاء الاصطناعي'),
      t('Incidents, alerts and security logs', 'الحوادث والتنبيهات وسجلات الأمان'),
      t('Sessions and device control', 'التحكم في الجلسات والأجهزة'),
    ]],
  ];


  const talk = [
    ['chat', t('Chat', 'شات'), t('Direct and group chat with voice notes, polls, location, stories and pinned messages.', 'شات فردي وجماعي مع رسائل صوتية واستطلاعات ولوكيشن وستوريز ورسائل مثبّتة.')],
    ['phone', t('Calls', 'مكالمات'), t('Voice and video calls, one to one or for a whole group.', 'مكالمات صوت وفيديو، فردية أو لمجموعة كاملة.')],
    ['meeting-type', t('Video meetings', 'اجتماعات فيديو'), t('Join from a link, with a waiting room, screen sharing, raised hands, polls and recording.', 'ادخل من رابط، مع غرفة انتظار ومشاركة شاشة ورفع إيد واستطلاعات وتسجيل.')],
    ['shield', t('Attendance report', 'تقرير الحضور'), t('Every participant is kept in the attendance report, with join time, leave time and duration.', 'كل مشارك بيتحفظ في تقرير الحضور بوقت الدخول والخروج والمدة.')],
  ];
  const pc = [
    ['folder', t('Files', 'ملفات'), t('Folders with share links, version history and storage you can see.', 'مجلدات مع روابط مشاركة وسجل نسخ ومساحة تخزين واضحة.')],
    ['terminal', t('Code editor', 'محرر أكواد'), t('Autocomplete for many languages, plus a terminal.', 'إكمال تلقائي لعدة لغات، مع ترمينال.')],
    ['file', t('Office files', 'ملفات Office'), t('Open and edit Word, Excel, PowerPoint and PDF files, or browse ZIP archives.', 'افتح وعدّل ملفات Word وExcel وPowerPoint وPDF، أو تصفّح ملفات ZIP.')],
    ['note', t('Notes and calendar', 'ملاحظات وتقويم'), t('Notes, calendar and calculator, with wallpapers and window snapping.', 'ملاحظات وتقويم وآلة حاسبة، مع خلفيات وتقسيم النوافذ.')],
  ];
  const ai = [
    ['ai-spark', t('AI tutor', 'معلم ذكي'), t('Inside the code editor: explains errors and reviews your code.', 'جوه محرر الأكواد: بيشرح الأخطاء وبيراجع كودك.')],
    ['bot', t('Assistant', 'مساعد'), t('Ask about your courses, projects and the platform.', 'اسأل عن موادك ومشاريعك والمنصة.')],
    ['sparkles', t('Readiness score', 'درجة الجاهزية'), t('Every project is rated on feasibility, market, documentation and innovation.', 'كل مشروع بيتقيّم على الجدوى والسوق والتوثيق والابتكار.')],
    ['bar-chart', t('Insights', 'تحليلات'), t('AI analysis for instructors, universities and data teams.', 'تحليلات بالذكاء الاصطناعي للدكاترة والجامعات وفرق البيانات.')],
  ];
  const exams = [
    ['layers', t('Question banks', 'بنوك أسئلة'), t('Reusable. MCQ, true/false, short answer and essay.', 'قابلة لإعادة الاستخدام: اختيار من متعدد وصح/غلط وإجابة قصيرة ومقالي.')],
    ['users', t('Targeting', 'توجيه الامتحان'), t('A faculty, department, year, group or single students.', 'لكلية أو قسم أو سنة أو مجموعة أو طلاب بعينهم.')],
    ['lock', t('Secure mode', 'الوضع الآمن'), t('Logs tab switches and can snapshot the camera. One active session per student.', 'بيسجل تبديل التابات وممكن يصوّر بالكاميرا. جلسة واحدة نشطة لكل طالب.')],
    ['ai-spark', t('Grading', 'التصحيح'), t('AI suggestions the instructor approves, then results and CSV export.', 'اقتراحات ذكاء اصطناعي يعتمدها الدكتور، ثم النتائج والتصدير CSV.')],
  ];
  const signals = [
    [t('Feasibility', 'الجدوى'), 90],
    [t('Market fit', 'ملاءمة السوق'), 84],
    [t('Documentation', 'التوثيق'), 78],
    [t('Innovation', 'الابتكار'), 92],
  ];

  return (
    <div className="lp2">
      <LandingNav anchors />

      <header className="lp2-hero">
        <div className="lp2-shell lp2-hero__grid">
          <div className="animate-rise-in">
            <span className="lp2-pill"><Icon name="sparkles" size={14} /> {t('Chat, calls, exams, projects and AI, in one platform', 'شات ومكالمات وامتحانات ومشاريع وذكاء اصطناعي، في منصة واحدة')}</span>
            <h1>
              {t('Everything your university needs. ', 'كل اللي جامعتك محتاجاه. ')}
              <span>{t('All on UIP.', 'كله على UIP.')}</span>
            </h1>
            <p className="lp2-lead">
              {t(
                'Chat and call your groups, meet on video, sit exams, publish your graduation project and write code on your own cloud PC, with an AI assistant and tutor beside you.',
                'اتكلم مع مجموعاتك واتصل بيهم، اجتمع بالفيديو، امتحن، انشر مشروع تخرجك واكتب كود على جهازك الشخصي السحابي، ومعاك مساعد ومعلم ذكي جنبك.',
              )}
            </p>
            <div className="lp2-hero__ctas">
              <Link to="/auth/register" className="btn btn-primary btn-lg">{t('Create a free account', 'اعمل حساب مجاني')}</Link>
              <Link to="/auth/login" className="btn btn-outline btn-lg">{t('Log in', 'تسجيل الدخول')}</Link>
              {app && <AppDownloadLink app={app} className="btn btn-outline btn-lg" iconSize={18} logo />}
            </div>
            <p className="lp2-note"><Icon name="check" size={16} /> {t('Free for students. No credit card.', 'مجاني للطلاب. من غير كريدت كارد.')}</p>
          </div>

          <div className="lp2-mock" aria-hidden="true">
            <div className="lp2-mock__bar">
              <span className="lp2-mock__title">{t('AI Readiness Score', 'درجة الجاهزية بالذكاء الاصطناعي')}</span>
              <span className="lp2-mock__sample">{t('Sample', 'مثال')}</span>
            </div>
            <div className="lp2-mock__body">
              <ReadinessRing score={87} size={132} caption={t('Readiness', 'الجاهزية')} />
              <div className="lp2-signals">
                {signals.map(([label, v]) => (
                  <div key={label}>
                    <div className="lp2-signal__top"><span>{label}</span><strong>{v}</strong></div>
                    <div className="lp2-signal__track"><span style={{ width: `${v}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lp2-shell">
          <div className="lp2-stats">
            {stats.map(([num, label]) => (
              <div key={label}>
                <div className="lp2-stats__num">{num == null ? '—' : <CountUp value={num} locale={locale} />}</div>
                <div className="lp2-stats__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main>
        <Section id="talk" eyebrow={t('Chat and meetings', 'الشات والاجتماعات')} title={t('Talk, call and meet without leaving UIP', 'اتكلم واتصل واجتمع من غير ما تسيب UIP')} sub={t('Study groups, class chats and project teams get everything they need to stay in touch.', 'مجموعات المذاكرة وشاتات الدفعات وفرق المشاريع عندهم كل اللي يحتاجوه عشان يفضلوا على تواصل.')}>
          <Cards items={talk} />
        </Section>

        <Section id="pc" eyebrow="My PC" title={t('A personal computer that lives in your browser', 'جهاز شخصي جوه متصفحك')} sub={t('Your files, tools and settings follow you to any phone or laptop.', 'ملفاتك وأدواتك وإعداداتك معاك على أي موبايل أو لابتوب.')}>
          <Cards items={pc} />
        </Section>

        <Section id="ai" eyebrow={t('AI', 'الذكاء الاصطناعي')} title={t('AI that works beside you, not instead of you', 'ذكاء اصطناعي جنبك، مش بدالك')} sub={t('Ask, get explained, get reviewed. It points to the problem and you fix it.', 'اسأل واتشرحلك واتراجعلك. بيشاور على المشكلة وإنت اللي بتحلها.')}>
          <Cards items={ai} />
        </Section>

        <Section id="exams" eyebrow={t('Exams', 'الامتحانات')} title={t('Exams that run themselves', 'امتحانات بتمشي لوحدها')} sub={t('From the question bank to the analytics dashboard, with nothing to stitch together.', 'من بنك الأسئلة لحد لوحة التحليلات، من غير ما تجمّع أدوات.')}>
          <Cards items={exams} />
        </Section>

        <section className="lp2-section lp2-shell" id="projects">
          <div className="lp2-head">
            <span className="lp2-eyebrow">{t('Projects', 'المشاريع')}</span>
            <h2>{t('Publish your graduation project and get found', 'انشر مشروع تخرجك واتكتشف')}</h2>
          </div>
          <div className="lp2-steps">
            {steps.map(([title, desc], i) => (
              <div className="lp2-card" key={title}>
                <div className="lp2-step__top"><span className="lp2-icon"><Icon name="check" size={18} /></span><span className="lp2-step__num">0{i + 1}</span></div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
          {featured.length > 0 && (
            <>
              <div className="lp2-head lp2-head--row" style={{ marginTop: 40 }}>
                <h2 style={{ fontSize: 22 }}>{t('Published on UIP', 'اتنشر على UIP')}</h2>
                <Link to="/projects" className="btn btn-outline">{t('Explore all projects', 'استكشف كل المشاريع')} <Icon name="arrow-right" size={16} /></Link>
              </div>
              <div className="public-projects-grid">
                {featured.map((p, i) => (
                  <ProjectCard key={p.uuid || p.slug || i} project={p} locale={locale} index={i} showUniversity />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="lp2-section lp2-shell" id="roles">
          <div className="lp2-head">
            <span className="lp2-eyebrow">{t('Roles', 'الأدوار')}</span>
            <h2>{t('One account, the right tools for your role', 'حساب واحد، والأدوات المناسبة لدورك')}</h2>
          </div>
          <div className="lp2-roles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {audiences.map(([title, items]) => (
              <div className="lp2-card" key={title}>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, display: 'grid', gap: 6, fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {items.map((x) => <li key={x}>{x}</li>)}
                </ul>
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
                  <h2>{app.native ? t('Enjoying UIP? Share the app with your friends', 'عجبتك UIP؟ شارك التطبيق مع أصحابك') : t('Take UIP with you', 'خد UIP معاك')}</h2>
                  <p>{app.native ? t('Send the download link on WhatsApp, Telegram or anywhere you like.', 'ابعت رابط التحميل على واتساب أو تيليجرام أو أي مكان.') : t('Calls, chat and notifications work best in the Android app.', 'المكالمات والشات والإشعارات بتشتغل أحسن في تطبيق الأندرويد.')}</p>
                </div>
              </div>
              {app.native ? (
                <AppDownloadLink app={app} className="btn btn-primary btn-lg" iconSize={18} logo />
              ) : (
                <a href={app.url} className="btn btn-primary btn-lg app-dl" target="_blank" rel="noopener noreferrer">
                  <Icon name="download" size={18} /> {t('Download for Android', 'تحميل للأندرويد')}
                </a>
              )}
            </div>
            {!app.native && <p className="lp2-app__note">{t('If Android asks, allow installing from this source. The file is an .apk.', 'لو أندرويد سألك، اسمح بالتثبيت من المصدر ده. الملف .apk.')}</p>}
          </section>
        )}

        <div className="lp2-shell lp2-cta-wrap">
          <div className="lp2-cta">
            <h2>{t('Open your campus. It takes a minute.', 'افتح جامعتك. بياخد دقيقة.')}</h2>
            <p>{t('Free for students. No credit card.', 'مجاني للطلاب. من غير كريدت كارد.')}</p>
            <Link to="/auth/register" className="btn btn-lg">{t('Create a free account', 'اعمل حساب مجاني')}</Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
