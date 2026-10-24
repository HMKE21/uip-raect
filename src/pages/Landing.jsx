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
 * Landing page (.lp2 palette + .lp3 layout, see styles/css/landing.css and landing-v3.css).
 *
 * UIP is no longer "projects + exams": it is a whole campus in one tab — chat, voice/video calls (1:1 and groups),
 * video meetings, a cloud "My PC" desktop with a code editor / office files / terminal, an AI assistant and tutor,
 * exams, graduation projects and the staff portals. The page is built around that: the hero is a miniature of the
 * My PC desktop (drawn in CSS, no screenshots) and each section shows the real thing in a small window.
 *
 * An already-authenticated visitor is sent to their dashboard (same as before, via roleHome()).
 * Live numbers come from GET /api/v1/public/landing and are never hard-coded.
 */

/* ---------- small window frame used by every mock ---------- */
function Win({ title, icon, className = '', children, style }) {
  return (
    <div className={`lp3-win ${className}`} style={style} aria-hidden="true">
      <div className="lp3-win__bar">
        <span className="lp3-win__title">{icon && <Icon name={icon} size={12} />}{title}</span>
        <span className="lp3-win__ctl"><i /><i /><i /></span>
      </div>
      <div className="lp3-win__body">{children}</div>
    </div>
  );
}

function Av({ children, tone = 1 }) {
  return <span className={`lp3-av lp3-av--${tone}`}>{children}</span>;
}

function ChatMock({ t }) {
  return (
    <div className="lp3-chat">
      <div className="lp3-msg"><Av tone={2}>{t('S', 'س')}</Av><p>{t('Who is presenting first tomorrow?', 'مين هيعرض الأول بكرة؟')}</p></div>
      <div className="lp3-msg"><Av tone={3}>{t('M', 'م')}</Av><p>{t('Me. Starting a call so we can rehearse.', 'أنا. هبدأ مكالمة نراجع فيها.')}</p></div>
      <div className="lp3-msg lp3-msg--card">
        <Av tone={3}>{t('M', 'م')}</Av>
        <div className="lp3-callcard">
          <b><Icon name="video" size={13} /> {t('Group video call', 'مكالمة فيديو جماعية')}</b>
          <span className="lp3-callcard__btn">{t('Join call', 'انضم للمكالمة')}</span>
        </div>
      </div>
      <div className="lp3-msg lp3-msg--me"><p>{t('Joining now', 'داخل دلوقتي')}</p></div>
    </div>
  );
}

function MeetMock({ t, big = false }) {
  const tiles = [['A', 1, true], ['N', 2, false], ['Y', 3, false], ['R', 4, false]];
  return (
    <div className={`lp3-meet ${big ? 'lp3-meet--big' : ''}`}>
      <div className="lp3-meet__grid">
        {tiles.map(([c, tone, speaking]) => (
          <div key={c} className={`lp3-tile ${speaking ? 'is-speaking' : ''}`}>
            <Av tone={tone}>{c}</Av>
          </div>
        ))}
      </div>
      <div className="lp3-meet__bar">
        <i><Icon name="mic" size={11} /></i>
        <i><Icon name="video" size={11} /></i>
        <i><Icon name="screen-share" size={11} /></i>
        <i><Icon name="hand" size={11} /></i>
        <i className="is-end" title={t('Leave', 'خروج')}><Icon name="logout" size={11} /></i>
      </div>
    </div>
  );
}

function CodeMock({ t }) {
  return (
    <div className="lp3-code">
      <pre dir="ltr" className="lp3-code__src">
        <span className="c-k">def</span> <span className="c-f">average</span>(nums):{'\n'}
        {'    '}<span className="c-k">return</span> <span className="c-f">sum</span>(nums) / <span className="c-f">len</span>(nums){'\n'}
        {'\n'}
        <span className="c-f">print</span>(<span className="c-f">average</span>([])) <span className="c-c"># ?</span>
      </pre>
      <div className="lp3-tutor">
        <span className="lp3-tutor__who"><Icon name="ai-spark" size={13} /> {t('AI tutor', 'المعلم الذكي')}</span>
        <p>{t('An empty list divides by zero. Check len(nums) first, then decide what to return.', 'القايمة الفاضية هتقسم على صفر. اتأكد من len(nums) الأول وبعدين قرر هترجّع إيه.')}</p>
      </div>
    </div>
  );
}

function ExplorerMock({ t }) {
  const rows = [
    ['folder', t('Graduation project', 'مشروع التخرج'), '—'],
    ['file', t('Report.docx', 'التقرير.docx'), '2.4 MB'],
    ['file', 'slides.pptx', '8.1 MB'],
    ['terminal', 'main.py', '3 KB'],
    ['archive', 'dataset.zip', '41 MB'],
  ];
  return (
    <ul className="lp3-files">
      {rows.map(([ic, name, size]) => (
        <li key={name}><Icon name={ic} size={14} /><span dir="auto">{name}</span><em>{size}</em></li>
      ))}
    </ul>
  );
}

function ExamMock({ t }) {
  return (
    <div className="lp3-exam">
      <div className="lp3-exam__top"><span><Icon name="clock" size={13} /> 21:42</span><span>{t('Question 14 of 20', 'سؤال 14 من 20')}</span></div>
      <p>{t('Which HTTP status code means a resource was created?', 'أي كود HTTP بيدل إن المورد اتعمل بنجاح؟')}</p>
      <ul>
        <li>200</li>
        <li className="is-picked"><Icon name="check-circle" size={14} /> 201</li>
        <li>204</li>
        <li>301</li>
      </ul>
      <small><Icon name="shield" size={12} /> {t('Answers auto-save. The server keeps the time.', 'الإجابات بتتحفظ تلقائيًا والسيرفر هو اللي بيحسب الوقت.')}</small>
    </div>
  );
}

function Point({ icon, children }) {
  return <li><span className="lp3-pt__ico"><Icon name={icon} size={16} /></span><span>{children}</span></li>;
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

  return (
    <div className="lp2 lp3">
      <LandingNav anchors />

      {/* ------------------------------------------------------------- hero */}
      <header className="lp3-hero">
        <div className="lp3-shell lp3-hero__grid">
          <div className="lp3-hero__copy">
            <h1>{t('Your whole campus, in one tab.', 'جامعتك كلها في تبويب واحد.')}</h1>
            <p className="lp3-lead">
              {t(
                'Chat and call your groups, meet on video, sit exams, publish your graduation project, and write code on your own cloud PC, with an AI tutor next to you.',
                'اتكلم مع مجموعاتك واتصل بيهم، اجتمع بالفيديو، امتحن، انشر مشروع تخرجك، واكتب كود على جهازك الشخصي السحابي، ومعاك معلم ذكي جنبك.',
              )}
            </p>
            <div className="lp3-cta">
              <Link to="/auth/register" className="btn btn-primary btn-lg">{t('Create a free account', 'اعمل حساب مجاني')}</Link>
              <Link to="/auth/login" className="btn btn-outline btn-lg">{t('Log in', 'تسجيل الدخول')}</Link>
              {app && <AppDownloadLink app={app} className="btn btn-outline btn-lg" iconSize={18} logo />}
            </div>
            <p className="lp3-note">{t('Free for students. No credit card.', 'مجاني للطلاب. من غير كريدت كارد.')}</p>
          </div>

          <div className="lp3-stage">
            <div className="lp3-desk" aria-label={t('A preview of the My PC desktop', 'معاينة لسطح مكتب My PC')} role="img">
              <Win title={t('Project team', 'فريق المشروع')} icon="chat" className="lp3-w lp3-w--chat"><ChatMock t={t} /></Win>
              <Win title={t('Rehearsal', 'بروفة العرض')} icon="video" className="lp3-w lp3-w--meet"><MeetMock t={t} /></Win>
              <Win title="main.py" icon="terminal" className="lp3-w lp3-w--code"><CodeMock t={t} /></Win>
              <div className="lp3-dock" aria-hidden="true">
                {['folder', 'terminal', 'note', 'calendar', 'chat', 'video', 'ai-spark'].map((n) => <i key={n}><Icon name={n} size={14} /></i>)}
              </div>
            </div>
          </div>
        </div>

        <div className="lp3-shell">
          <ul className="lp3-stats">
            {stats.map(([num, label]) => (
              <li key={label}><strong>{num == null ? '—' : <CountUp value={num} locale={locale} />}</strong><span>{label}</span></li>
            ))}
          </ul>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------- talk */}
        <section className="lp3-row lp3-shell" id="talk">
          <div className="lp3-row__text">
            <h2>{t('Talk, call and meet without leaving UIP', 'اتكلم واتصل واجتمع من غير ما تسيب UIP')}</h2>
            <p>{t('Study groups, class chats and project teams get everything they need to stay in touch.', 'مجموعات المذاكرة وشاتات الدفعات وفرق المشاريع عندهم كل اللي يحتاجوه عشان يفضلوا على تواصل.')}</p>
            <ul className="lp3-points">
              <Point icon="chat">{t('Direct and group chat with voice notes, polls, location, stories and pinned messages.', 'شات فردي وجماعي مع رسائل صوتية واستطلاعات ولوكيشن وستوريز ورسائل مثبّتة.')}</Point>
              <Point icon="phone">{t('Voice and video calls, one to one or for a whole group.', 'مكالمات صوت وفيديو، فردية أو لمجموعة كاملة.')}</Point>
              <Point icon="meeting-type">{t('Video meetings you join from a link, with a waiting room, screen sharing, raised hands, polls and recording.', 'اجتماعات فيديو بتدخلها من رابط، مع غرفة انتظار ومشاركة شاشة ورفع إيد واستطلاعات وتسجيل.')}</Point>
              <Point icon="shield">{t('Everyone is warned when someone screenshots or records a meeting.', 'الكل بيتنبّه لو حد صوّر الشاشة أو سجّلها أثناء الاجتماع.')}</Point>
            </ul>
          </div>
          <div className="lp3-row__art">
            <Win title={t('Study group', 'مجموعة المذاكرة')} icon="users" className="lp3-win--flow"><MeetMock t={t} big /></Win>
          </div>
        </section>

        {/* -------------------------------------------------------- my pc */}
        <section className="lp3-row lp3-row--flip lp3-shell" id="pc">
          <div className="lp3-row__text">
            <h2>{t('My PC: a personal computer that lives in your browser', 'جهازك الشخصي My PC جوه متصفحك')}</h2>
            <p>{t('Your files, tools and settings follow you to any phone or laptop. Open it and it looks like a desktop.', 'ملفاتك وأدواتك وإعداداتك معاك على أي موبايل أو لابتوب. تفتحه تلاقيه سطح مكتب كامل.')}</p>
            <ul className="lp3-points">
              <Point icon="folder">{t('Folders and files with share links, version history and storage you can see.', 'مجلدات وملفات مع روابط مشاركة وسجل نسخ ومساحة تخزين واضحة.')}</Point>
              <Point icon="terminal">{t('A code editor with autocomplete for many languages, plus a terminal.', 'محرر أكواد بإكمال تلقائي لعدة لغات، مع ترمينال.')}</Point>
              <Point icon="file">{t('Open and edit Word, Excel, PowerPoint and PDF files, or browse ZIP archives.', 'افتح وعدّل ملفات Word وExcel وPowerPoint وPDF، أو تصفّح ملفات ZIP.')}</Point>
              <Point icon="note">{t('Notes, calendar and calculator, with wallpapers, a lock screen and window snapping.', 'ملاحظات وتقويم وآلة حاسبة، مع خلفيات وشاشة قفل وتقسيم النوافذ.')}</Point>
            </ul>
          </div>
          <div className="lp3-row__art">
            <Win title={t('This PC', 'جهازي')} icon="monitor" className="lp3-win--flow"><ExplorerMock t={t} /></Win>
          </div>
        </section>

        {/* ----------------------------------------------------------- ai */}
        <section className="lp3-row lp3-shell" id="ai">
          <div className="lp3-row__text">
            <h2>{t('AI that works beside you, not instead of you', 'ذكاء اصطناعي جنبك، مش بدالك')}</h2>
            <p>{t('Ask, get explained, get reviewed. It points to the problem and you fix it.', 'اسأل واتشرحلك واتراجعلك. بيشاور على المشكلة وإنت اللي بتحلها.')}</p>
            <ul className="lp3-points">
              <Point icon="ai-spark">{t('A tutor inside the code editor that explains errors and reviews your code.', 'معلم جوه محرر الأكواد بيشرح الأخطاء وبيراجع كودك.')}</Point>
              <Point icon="bot">{t('An assistant chat for questions about your courses, projects and the platform.', 'شات مساعد للأسئلة عن موادك ومشاريعك والمنصة.')}</Point>
              <Point icon="sparkles">{t('An AI readiness score for every project: feasibility, market, documentation, innovation.', 'درجة جاهزية لكل مشروع: الجدوى والسوق والتوثيق والابتكار.')}</Point>
              <Point icon="bar-chart">{t('AI analysis and insights for instructors, universities and data teams.', 'تحليلات ورؤى بالذكاء الاصطناعي للدكاترة والجامعات وفرق البيانات.')}</Point>
            </ul>
          </div>
          <div className="lp3-row__art">
            <Win title="main.py" icon="terminal" className="lp3-win--flow"><CodeMock t={t} /></Win>
            <div className="lp3-ring" aria-hidden="true">
              <ReadinessRing score={87} size={116} caption={t('Readiness', 'الجاهزية')} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- exams */}
        <section className="lp3-row lp3-row--flip lp3-shell" id="exams">
          <div className="lp3-row__text">
            <h2>{t('Exams that run themselves', 'امتحانات بتمشي لوحدها')}</h2>
            <p>{t('From the question bank to the analytics dashboard, with nothing to stitch together.', 'من بنك الأسئلة لحد لوحة التحليلات، من غير ما تجمّع أدوات.')}</p>
            <ul className="lp3-points">
              <Point icon="layers">{t('Reusable question banks. MCQ, true/false, short answer and essay.', 'بنوك أسئلة قابلة لإعادة الاستخدام: اختيار من متعدد وصح/غلط وإجابة قصيرة ومقالي.')}</Point>
              <Point icon="users">{t('Target a faculty, department, year, group or single students.', 'وجّه الامتحان لكلية أو قسم أو سنة أو مجموعة أو طلاب بعينهم.')}</Point>
              <Point icon="lock">{t('Secure mode logs tab switches and can snapshot the camera. One active session per student.', 'الوضع الآمن بيسجل تبديل التابات وممكن يصوّر بالكاميرا. جلسة واحدة نشطة لكل طالب.')}</Point>
              <Point icon="ai-spark">{t('Grading with AI suggestions that the instructor approves, then results and CSV export.', 'تصحيح باقتراحات ذكاء اصطناعي يعتمدها الدكتور، ثم النتائج والتصدير CSV.')}</Point>
            </ul>
          </div>
          <div className="lp3-row__art">
            <Win title={t('Exam in progress', 'امتحان جارٍ')} icon="clock" className="lp3-win--flow"><ExamMock t={t} /></Win>
          </div>
        </section>

        {/* ----------------------------------------------------- projects */}
        <section className="lp3-block lp3-shell" id="projects">
          <div className="lp3-block__head">
            <h2>{t('Publish your graduation project and get found', 'انشر مشروع تخرجك واتكتشف')}</h2>
          </div>
          <ol className="lp3-steps">
            {steps.map(([title, desc], i) => (
              <li key={title}><b>{i + 1}</b><h3>{title}</h3><p>{desc}</p></li>
            ))}
          </ol>
          {featured.length > 0 && (
            <>
              <div className="lp3-block__head lp3-block__head--row">
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

        {/* ------------------------------------------------------ roles */}
        <section className="lp3-block lp3-shell" id="roles">
          <div className="lp3-block__head">
            <h2>{t('One account, the right tools for your role', 'حساب واحد، والأدوات المناسبة لدورك')}</h2>
          </div>
          <div className="lp3-aud">
            {audiences.map(([title, items]) => (
              <div key={title}>
                <h3>{title}</h3>
                <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>

        {app && (
          <section className="lp3-block lp3-shell" id="app">
            <div className="lp3-app">
              <span className="lp3-app__logo"><img src="/images/logo/uip-mark.png" srcSet="/images/logo/uip-mark@2x.png 2x" alt="UIP" /></span>
              <div className="lp3-app__text">
                <h2>{app.native ? t('Enjoying UIP? Share the app with your friends', 'عجبتك UIP؟ شارك التطبيق مع أصحابك') : t('Take UIP with you', 'خد UIP معاك')}</h2>
                <p>{app.native ? t('Send the download link on WhatsApp, Telegram or anywhere you like.', 'ابعت رابط التحميل على واتساب أو تيليجرام أو أي مكان.') : t('Calls, chat and notifications work best in the Android app.', 'المكالمات والشات والإشعارات بتشتغل أحسن في تطبيق الأندرويد.')}</p>
              </div>
              {app.native ? (
                <AppDownloadLink app={app} className="btn btn-primary btn-lg" iconSize={18} logo />
              ) : (
                <a href={app.url} className="btn btn-primary btn-lg app-dl" target="_blank" rel="noopener noreferrer">
                  <Icon name="download" size={18} /> {t('Download for Android', 'تحميل للأندرويد')}
                </a>
              )}
            </div>
            {!app.native && <p className="lp3-app__note">{t('If Android asks, allow installing from this source. The file is an .apk.', 'لو أندرويد سألك، اسمح بالتثبيت من المصدر ده. الملف .apk.')}</p>}
          </section>
        )}

        <section className="lp3-shell lp3-final">
          <h2>{t('Open your campus. It takes a minute.', 'افتح جامعتك. بياخد دقيقة.')}</h2>
          <Link to="/auth/register" className="btn btn-primary btn-lg">{t('Create a free account', 'اعمل حساب مجاني')}</Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
