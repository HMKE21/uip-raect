import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../config/roleHome';
import Icon from './Icon';
import useAppDownload from '../hooks/useAppDownload';
import AppDownloadLink from './AppDownloadLink';

/**
 * Sticky top bar for the public pages restyled in the Admin design language
 * (Landing, Explore, Privacy, Verify Certificate, error pages). Must be
 * rendered inside a `.lp2` wrapper — that wrapper carries the palette (see
 * styles/css/landing.css). `anchors` shows the in-page links used by the
 * landing page. Below 820px the links collapse into a hamburger menu.
 */
export default function LandingNav({ anchors = false }) {
  const { locale, toggleLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const app = useAppDownload();
  const isAr = locale === 'ar';
  const t = (en, ar) => (isAr ? ar : en);

  // Close the mobile menu on navigation, Escape, or when the viewport grows.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const mq = window.matchMedia('(min-width: 821px)');
    const onMq = () => { if (mq.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => { document.removeEventListener('keydown', onKey); mq.removeEventListener('change', onMq); };
  }, [open]);

  const links = (
    <>
      {anchors ? (
        <>
          <a href="#how">{t('Projects', 'المشاريع')}</a>
          <a href="#exams">{t('Exams', 'الامتحانات')}</a>
          <a href="#roles">{t("Who it's for", 'لمين المنصة')}</a>
        </>
      ) : (
        <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>{t('Home', 'الرئيسية')}</Link>
      )}
      <Link to="/projects" aria-current={pathname.startsWith('/projects') ? 'page' : undefined}>{t('Explore Projects', 'استكشف المشاريع')}</Link>
      <Link to="/verify-certificate" aria-current={pathname.startsWith('/verify-certificate') ? 'page' : undefined}>{t('Verify a Certificate', 'التحقق من شهادة')}</Link>
      {app && <AppDownloadLink app={app} withIcon={false} logo iconSize={14} className="app-dl--nav" labels={{ download: t('Get the app', 'حمّل التطبيق') }} />}
    </>
  );

  return (
    <nav className="lp2-nav">
      <div className="lp2-shell lp2-nav__inner">
        <Link to="/" className="lp2-brand">
          <span className="lp2-brand__mark"><img src="/images/logo/uip-mark.png" srcSet="/images/logo/uip-mark@2x.png 2x" alt="" /></span>
          <span className="lp2-brand__text">UIP</span>
        </Link>
        <div className="lp2-nav__links">{links}</div>
        <div className="lp2-nav__actions">
          <button type="button" className="lp2-icon-btn" onClick={toggleLocale} aria-label={t('العربية', 'English')} title={t('العربية', 'English')}>
            <Icon name="globe" size={16} />
          </button>
          <button type="button" className="lp2-icon-btn" onClick={toggleTheme} aria-label={t('Toggle theme', 'تبديل المظهر')} title={t('Toggle theme', 'تبديل المظهر')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          {status === 'authenticated' ? (
            <Link to={roleHome(user?.role)} className="btn btn-primary btn-sm lp2-nav__cta">{t('Dashboard', 'لوحة التحكم')}</Link>
          ) : (
            <>
              <Link to="/auth/login" className="lp2-nav__login">{t('Log in', 'تسجيل الدخول')}</Link>
              <Link to="/auth/register" className="btn btn-primary btn-sm lp2-nav__cta">{t('Get Started Free', 'ابدأ مجانًا')}</Link>
            </>
          )}
          <button
            type="button" className="lp2-icon-btn lp2-nav__burger"
            aria-expanded={open} aria-controls="lp2-mobile-menu"
            aria-label={t('Menu', 'القائمة')} onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'x' : 'menu'} size={18} />
          </button>
        </div>
      </div>

      {open && (
        <div className="lp2-nav__mobile" id="lp2-mobile-menu">
          <div className="lp2-shell">
            {links}
            {status !== 'authenticated' && <Link to="/auth/login">{t('Log in', 'تسجيل الدخول')}</Link>}
          </div>
        </div>
      )}
    </nav>
  );
}
