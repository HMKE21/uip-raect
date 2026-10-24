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
 * Landing page (.lp4, see styles/css/landing-v4.css; palette tokens from .lp2 in landing.css).
 * Hero with a composed product scene + live numbers, a bento grid of mini UIs (chat, meetings, My PC, AI, exams), the project
 * publishing steps, role tabs and the app download band. Live numbers come from GET /api/v1/public/landing and are never hard-coded.
 * An already-authenticated visitor is sent to their dashboard via roleHome().
 */

export default function Landing() {
  const { status, user } = useAuth();
  const { locale } = useLanguage();
  const isAr = locale === 'ar';
  const t = (en, ar) => (isAr ? ar : en);
  const app = useAppDownload();

  const [featured, setFeatured] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [role, setRole] = useState('students');

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
    ['users', liveStats?.active_students, t('active students', 'طالب نشط')],
    ['building', liveStats?.partner_universities, t('partner universities', 'جامعة شريكة')],
    ['layers', liveStats?.published_projects, t('published projects', 'مشروع منشور')],
    ['sparkles', liveStats?.projects_scored, t('projects scored by AI', 'مشروع اتقيّم بالذكاء الاصطناعي')],
  ];

  const steps = [
    ['upload', t('Upload', 'ارفع'), t('Describe your idea and attach files or your GitHub repo.', 'اكتب فكرتك وأضف ملفاتك أو رابط GitHub.')],
    ['sparkles', t('Get scored', 'خد تقييمك'), t('AI rates feasibility, market fit, documentation and innovation.', 'الذكاء الاصطناعي يقيّم الجدوى والسوق والتوثيق والابتكار.')],
    ['check-circle', t('Get approved', 'اتعتمد'), t('Your university reviews it before it goes public.', 'جامعتك تراجعه قبل ما يتنشر.')],
    ['globe', t('Get discovered', 'اتكتشف'), t('Published projects are open to universities and companies.', 'المشاريع المنشورة بتظهر للجامعات والشركات.')],
  ];

  const audiences = [
    ['students', t('Students', 'الطلاب'), [
      t('Courses, timetable, attendance and grades', 'المواد والجدول والحضور والدرجات'),
      t('Assignments and exams in one place', 'التكاليف والامتحانات في مكان واحد'),
      t('Portfolio, patents and GitHub link', 'بورتفوليو وبراءات اختراع وربط GitHub'),
      t('Graduation certificate with public verification', 'شهادة تخرج بتتحقق منها أي جهة'),
    ]],
    ['staff', t('Instructors', 'الدكاترة والمشرفون'), [
      t('Question banks and exam builder', 'بنوك أسئلة ومنشئ امتحانات'),
      t('AI-assisted grading you review', 'تصحيح بمساعدة الذكاء الاصطناعي وبمراجعتك'),
      t('Course content, attendance, timetable', 'محتوى المواد والحضور والجدول'),
      t('Project grading and similarity checks', 'تقييم المشاريع وفحص التشابه'),
    ]],
    ['uni', t('Universities', 'الجامعات والكليات'), [
      t('Approve student projects and graduation', 'اعتماد المشاريع والتخرج'),
      t('Registration, fees, summer terms', 'التسجيل والرسوم والفصل الصيفي'),
      t('University email and announcements', 'البريد الجامعي والإعلانات'),
      t('Chat oversight and reports', 'متابعة الشات والبلاغات'),
    ]],
    ['data', t('Data and security', 'فرق البيانات والأمن'), [
      t('Dashboards, KPIs, forecasting, data quality', 'لوحات ومؤشرات وتنبؤ وجودة بيانات'),
      t('Exam analytics and AI insights', 'تحليلات الامتحانات ورؤى الذكاء الاصطناعي'),
      t('Incidents, alerts and security logs', 'الحوادث والتنبيهات وسجلات الأمان'),
      t('Sessions and device control', 'التحكم في الجلسات والأجهزة'),
    ]],
  ];
  const activeRole = audiences.find(([k]) => k === role) || audiences[0];

  const signals = [
    [t('Feasibility', 'الجدوى'), 90],
    [t('Market fit', 'ملاءمة السوق'), 84],
    [t('Documentation', 'التوثيق'), 78],
    [t('Innovation', 'الابتكار'), 92],
  ];

  const chips = (arr) => (
    <ul className="lp4-chips">{arr.map(([ic, label]) => <li key={label}><Icon name={ic} size={14} />{label}</li>)}</ul>
  );

  return (
    <div className="lp2 lp4">
      <LandingNav anchors />

      {/* ============================ HERO ============================ */}
      <header className="lp4-hero">
        <div className="lp4-glow" aria-hidden="true" />
        <div className="lp4-shell lp4-hero__grid">
          <div className="lp4-hero__copy">
            <span className="lp4-pill"><span className="lp4-dot" /> {t('The all-in-one campus platform', 'منصة الجامعة المتكاملة')}</span>
            <h1>
              {t('Your whole university, ', 'جامعتك كلها، ')}
              <span className="lp4-grad">{t('in one place.', 'في مكان واحد.')}</span>
            </h1>
            <p className="lp4-lead">
              {t(
                'Chat, video meetings, exams, graduation projects and a cloud PC, with an AI tutor beside you. Stop switching between ten different tools.',
                'شات واجتماعات فيديو وامتحانات ومشاريع تخرج وجهاز سحابي، ومعاك معلم ذكي جنبك. كفاية تنقّل بين عشر أدوات مختلفة.',
              )}
            </p>
            <div className="lp4-cta">
              <Link to="/auth/register" className="btn btn-primary btn-lg">{t('Create a free account', 'اعمل حساب مجاني')} <Icon name="arrow-right" size={16} /></Link>
              <Link to="/auth/login" className="btn btn-outline btn-lg">{t('Log in', 'تسجيل الدخول')}</Link>
              {app && <AppDownloadLink app={app} className="btn btn-outline btn-lg" iconSize={18} logo />}
            </div>
            <p className="lp4-note"><Icon name="check" size={16} /> {t('Free for students. No credit card.', 'مجاني للطلاب. من غير كريدت كارد.')}</p>
          </div>

          {/* product composition */}
          <div className="lp4-stage" aria-hidden="true">
            <div className="lp4-win lp4-win--main">
              <div className="lp4-win__bar"><i /><i /><i /><b>{t('Graduation project team', 'فريق مشروع التخرج')}</b><em>{t('4 online', '4 أونلاين')}</em></div>
              <div className="lp4-chat">
                <div className="lp4-msg"><span className="lp4-av lp4-av--a">S</span><p>{t('Uploaded the final report. Can you review chapter 3?', 'رفعت التقرير النهائي. تراجع الفصل التالت؟')}</p></div>
                <div className="lp4-msg"><span className="lp4-av lp4-av--b">O</span><p>{t('On it. The AI flagged two weak points in the market section.', 'تمام. الذكاء الاصطناعي لقى نقطتين ضعف في قسم السوق.')}</p></div>
                <div className="lp4-msg lp4-msg--me"><p>{t('Joining the meeting now 🎥', 'داخل الاجتماع دلوقتي 🎥')}</p></div>
                <div className="lp4-poll">
                  <strong>{t('Poll: meeting time', 'استطلاع: ميعاد الاجتماع')}</strong>
                  <div><span style={{ width: '72%' }} />{t('Sat 6 PM', 'السبت 6 م')}<b>72%</b></div>
                  <div><span style={{ width: '28%' }} />{t('Sun 4 PM', 'الأحد 4 م')}<b>28%</b></div>
                </div>
              </div>
            </div>

            <div className="lp4-float lp4-float--score">
              <div className="lp4-float__title">{t('AI Readiness', 'جاهزية المشروع')} <span>{t('Sample', 'مثال')}</span></div>
              <div className="lp4-float__score">
                <ReadinessRing score={87} size={96} caption="" />
                <div className="lp4-signals">
                  {signals.map(([label, v]) => (
                    <div key={label}><div><span>{label}</span><strong>{v}</strong></div><i><b style={{ width: `${v}%` }} /></i></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lp4-float lp4-float--exam">
              <span className="lp4-icon lp4-icon--amber"><Icon name="lock" size={16} /></span>
              <div><strong>{t('Exam in progress', 'امتحان شغال')}</strong><small>{t('Secure mode · 42:10 left', 'الوضع الآمن · باقي 42:10')}</small></div>
            </div>

            <div className="lp4-float lp4-float--call">
              <div className="lp4-faces"><span className="lp4-av lp4-av--a">S</span><span className="lp4-av lp4-av--b">O</span><span className="lp4-av lp4-av--c">M</span><span className="lp4-av lp4-av--d">+3</span></div>
              <small><Icon name="meeting-type" size={13} /> {t('Live meeting', 'اجتماع مباشر')}</small>
            </div>
          </div>
        </div>

        <div className="lp4-shell">
          <ul className="lp4-stats">
            {stats.map(([ic, num, label]) => (
              <li key={label}>
                <span className="lp4-stats__ico"><Icon name={ic} size={20} /></span>
                <div>
                  <strong>{num == null ? '—' : <CountUp value={num} locale="en" />}</strong>
                  <span>{label}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <main>
        {/* ============================ FEATURES (bento) ============================ */}
        <section className="lp4-section lp4-shell" id="talk">
          <div className="lp4-head">
            <span className="lp4-eyebrow">{t('What you get', 'اللي هتلاقيه')}</span>
            <h2>{t('Everything a campus runs on, already connected', 'كل اللي الجامعة بتشتغل بيه، متوصّل ببعضه')}</h2>
            <p>{t('One account, one login, one place for your files, classes, exams and conversations.', 'حساب واحد وتسجيل دخول واحد ومكان واحد لملفاتك ومحاضراتك وامتحاناتك ومحادثاتك.')}</p>
          </div>

          <div className="lp4-bento">
            {/* chat + calls */}
            <article className="lp4-tile lp4-tile--chat">
              <div className="lp4-tile__text">
                <span className="lp4-icon"><Icon name="chat" size={18} /></span>
                <h3>{t('Chat and calls', 'شات ومكالمات')}</h3>
                <p>{t('Direct and group chat with voice notes, polls, location, stories and pinned messages. Voice and video calls for one person or a whole group.', 'شات فردي وجماعي مع رسائل صوتية واستطلاعات ولوكيشن وستوريز ورسائل مثبّتة. ومكالمات صوت وفيديو لشخص أو لمجموعة كاملة.')}</p>
              </div>
              <div className="lp4-mini lp4-mini--bubbles" aria-hidden="true">
                <span className="lp4-bub">{t('Lecture moved to 10 AM', 'المحاضرة اتنقلت 10 الصبح')}</span>
                <span className="lp4-bub lp4-bub--me">{t('Thanks! 👍', 'شكرًا! 👍')}</span>
                <span className="lp4-bub">{t('Who has the lab notes?', 'مين معاه ملخص المعمل؟')}</span>
                <span className="lp4-bub lp4-bub--me">{t('Check the shared folder', 'شوف الفولدر المشترك')}</span>
                <span className="lp4-bub lp4-bub--voice"><Icon name="audio-wave" size={16} /> 0:24</span>
              </div>
            </article>

            {/* meetings */}
            <article className="lp4-tile lp4-tile--meet" id="meetings">
              <div className="lp4-tile__text">
                <span className="lp4-icon"><Icon name="meeting-type" size={18} /></span>
                <h3>{t('Video meetings', 'اجتماعات فيديو')}</h3>
                <p>{t('Join from a link with a waiting room, screen sharing, raised hands and recording. Every participant lands in the attendance report with join time, leave time and duration.', 'ادخل من رابط مع غرفة انتظار ومشاركة شاشة ورفع إيد وتسجيل. وكل مشارك بيتحفظ في تقرير الحضور بوقت الدخول والخروج والمدة.')}</p>
              </div>
              <div className="lp4-mini lp4-mini--grid" aria-hidden="true">
                <span className="lp4-tilev lp4-tilev--a">S</span><span className="lp4-tilev lp4-tilev--b">O</span>
                <span className="lp4-tilev lp4-tilev--c">M</span><span className="lp4-tilev lp4-tilev--d"><Icon name="screen-share" size={18} /></span>
              </div>
            </article>

            {/* My PC */}
            <article className="lp4-tile lp4-tile--pc" id="pc">
              <div className="lp4-tile__text">
                <span className="lp4-icon"><Icon name="hard-drive" size={18} /></span>
                <h3>{t('My PC, in your browser', 'My PC جوه متصفحك')}</h3>
                <p>{t('Files with share links and version history, a code editor with a terminal, Word, Excel, PowerPoint and PDF editing. It follows you to any phone or laptop.', 'ملفات مع روابط مشاركة وسجل نسخ، ومحرر أكواد مع ترمينال، وتعديل Word وExcel وPowerPoint وPDF. وبيمشي معاك على أي موبايل أو لابتوب.')}</p>
              </div>
              <ul className="lp4-files" aria-hidden="true">
                <li><Icon name="folder" size={16} /> {t('Graduation project', 'مشروع التخرج')}<small>12 {t('files', 'ملف')}</small></li>
                <li><Icon name="file" size={16} /> report-final.docx<small>v4</small></li>
                <li><Icon name="terminal" size={16} /> main.py<small>{t('edited now', 'اتعدّل دلوقتي')}</small></li>
              </ul>
            </article>

            {/* AI */}
            <article className="lp4-tile lp4-tile--ai" id="ai">
              <div className="lp4-tile__text">
                <span className="lp4-icon"><Icon name="ai-spark" size={18} /></span>
                <h3>{t('AI beside you, not instead of you', 'ذكاء اصطناعي جنبك، مش بدالك')}</h3>
                <p>{t('An AI tutor inside the code editor explains errors and reviews your code. It points to the problem and you fix it.', 'معلم ذكي جوه محرر الأكواد بيشرح الأخطاء وبيراجع كودك. بيشاور على المشكلة وإنت اللي بتحلها.')}</p>
              </div>
              <div className="lp4-code" aria-hidden="true">
                <code><i>1</i> total = sum(grades) / len(grade)</code>
                <div className="lp4-code__tip"><Icon name="sparkles" size={14} /> {t('`grade` is not defined. Did you mean `grades`?', 'المتغير `grade` مش معرّف. قصدك `grades`؟')}</div>
              </div>
            </article>

            {/* Exams */}
            <article className="lp4-tile lp4-tile--exam" id="exams">
              <div className="lp4-tile__text">
                <span className="lp4-icon"><Icon name="layers" size={18} /></span>
                <h3>{t('Exams that run themselves', 'امتحانات بتمشي لوحدها')}</h3>
                <p>{t('Reusable question banks, targeting by faculty, year or group, a secure mode that logs tab switches, and AI grading suggestions the instructor approves.', 'بنوك أسئلة قابلة لإعادة الاستخدام، وتوجيه لكلية أو سنة أو مجموعة، ووضع آمن بيسجل تبديل التابات، واقتراحات تصحيح بالذكاء الاصطناعي يعتمدها الدكتور.')}</p>
              </div>
              <div className="lp4-quiz" aria-hidden="true">
                <strong>{t('Q3 · Which structure uses LIFO?', 'س3 · أي بنية بيانات بتستخدم LIFO؟')}</strong>
                <span><i />{t('Queue', 'Queue')}</span>
                <span className="is-on"><i />{t('Stack', 'Stack')}</span>
                <span><i />{t('Heap', 'Heap')}</span>
              </div>
            </article>
          </div>
        </section>

        {/* ============================ PROJECTS ============================ */}
        <section className="lp4-section lp4-shell" id="projects">
          <div className="lp4-head">
            <span className="lp4-eyebrow">{t('Projects', 'المشاريع')}</span>
            <h2>{t('Publish your graduation project and get found', 'انشر مشروع تخرجك واتكتشف')}</h2>
          </div>
          <ol className="lp4-steps">
            {steps.map(([ic, title, desc], i) => (
              <li key={title}>
                <span className="lp4-step__ico"><Icon name={ic} size={20} /></span>
                <span className="lp4-step__n">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </li>
            ))}
          </ol>

          {featured.length > 0 && (
            <>
              <div className="lp4-row">
                <h3>{t('Published on UIP', 'اتنشر على UIP')}</h3>
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

        {/* ============================ ROLES ============================ */}
        <section className="lp4-section lp4-shell" id="roles">
          <div className="lp4-head">
            <span className="lp4-eyebrow">{t('Roles', 'الأدوار')}</span>
            <h2>{t('One account, the right tools for your role', 'حساب واحد، والأدوات المناسبة لدورك')}</h2>
          </div>
          <div className="lp4-roles">
            <div className="lp4-tabs" role="tablist">
              {audiences.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={k === activeRole[0]} className={k === activeRole[0] ? 'is-on' : ''} onClick={() => setRole(k)}>{label}</button>
              ))}
            </div>
            <ul className="lp4-roles__list" role="tabpanel">
              {activeRole[2].map((x) => <li key={x}><span><Icon name="check" size={14} /></span>{x}</li>)}
            </ul>
          </div>
        </section>

        {app && (
          <section className="lp4-section lp4-shell" id="app">
            <div className="lp4-app">
              <div className="lp4-app__info">
                <span className="lp4-app__logo"><img src="/images/logo/uip-mark.png" srcSet="/images/logo/uip-mark@2x.png 2x" alt="UIP" /></span>
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

        <div className="lp4-shell lp4-final-wrap">
          <div className="lp4-final">
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
