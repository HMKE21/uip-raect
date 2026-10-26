import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../config/roleHome';
import { myPcPath } from '../config/myPc';
import { useIsMobileOS } from '../desktop/useIsMobileOS';
import { useVirtualMode } from './virtualMode';
import './virtual.css';

/** Little illustration of the desktop: three windows, a Dock. Pure CSS (see virtual.css). */
export function ModeArt() {
  return (
    <div className="vm-art" aria-hidden="true">
      <div className="vm-art__bar"><i /><i /><i /></div>
      <div className="vm-art__win vm-art__win--a"><b /><u /><u /><u /></div>
      <div className="vm-art__win vm-art__win--b"><b /><span /><span /></div>
      <div className="vm-art__win vm-art__win--c"><b /><u /><u /></div>
      <div className="vm-art__dock"><i style={{ background: '#38bdf8' }} /><i style={{ background: '#a78bfa' }} /><i style={{ background: '#f87171' }} /><i style={{ background: '#4ade80' }} /><i style={{ background: '#fbbf24' }} /></div>
    </div>
  );
}

/**
 * The switch for the virtual mode. Used in Settings ▸ UIP OS (inside the desktop) and in the portal's top bar launcher.
 * Turning it ON takes the student into the desktop; turning it OFF takes them back to the normal portal.
 */
export default function ModeCard({ onDone, inDesktop = false }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const tt = (en, a) => (ar ? a : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const vm = useVirtualMode();
  const mobile = useIsMobileOS();
  const [err, setErr] = useState('');

  if (!vm.supported) return null;

  const toggle = async () => {
    setErr('');
    const next = !vm.enabled;
    try {
      await vm.setEnabled(next);
      onDone?.(next);
      navigate(next ? myPcPath(user?.role) : roleHome(user?.role), { replace: !next });
    } catch (e) {
      setErr(e?.message || tt('Could not change the mode. Try again.', 'مقدرناش نغيّر الوضع. جرّب تاني.'));
    }
  };

  const unavailable = !vm.available && !vm.enabled;
  return (
    <div className={`vm-card${vm.enabled ? ' is-on' : ''}`}>
      <ModeArt />
      <div className="vm-card__body">
        <h3>{tt('UIP OS — Virtual mode', 'UIP OS — الوضع الافتراضي')}</h3>
        <p>{tt(
          'Work on the whole platform from inside your own computer: courses, exams, grades, messages and projects open as windows next to your files, with a Dock, a Start menu and your wallpaper.',
          'اشتغل على المنصة كلها من جوّه جهازك الخاص: المواد والامتحانات والدرجات والرسائل والمشاريع بتفتح كنوافذ جنب ملفاتك، مع Dock وقائمة Start وخلفيتك.',
        )}</p>
        <ul className="vm-card__pts">
          <li><Icon name="check-circle" size={14} /> {tt('Everything in the portal, as apps', 'كل اللي في المنصة كتطبيقات')}</li>
          <li><Icon name="check-circle" size={14} /> {tt('Several pages side by side, snap & virtual desktops', 'أكتر من صفحة جنب بعض، وSnap وأسطح مكتب متعددة')}</li>
          <li><Icon name="check-circle" size={14} /> {tt('Follows you to every device — switch back any time', 'بتتابعك على أي جهاز — وترجع للعادي في أي وقت')}</li>
        </ul>
        {mobile && <p className="vm-card__note">{tt('On phones, UIP OS lives inside My PC: open My PC and tap the apps button.', 'على الموبايل، UIP OS بيشتغل جوه «جهازي»: افتح جهازي واضغط زرار التطبيقات.')}</p>}
        {unavailable && <p className="vm-card__note vm-card__note--warn">{tt('Virtual mode is not available for your account right now.', 'الوضع الافتراضي مش متاح لحسابك حاليًا.')}</p>}
        {err && <p className="vm-card__note vm-card__note--err" role="alert">{err}</p>}
        <div className="vm-card__btns">
          <button type="button" className={`btn ${vm.enabled ? 'btn-outline' : 'btn-primary'}`} disabled={vm.busy || unavailable} onClick={toggle}>
            {vm.enabled ? tt('Switch back to the normal portal', 'الرجوع للمنصة العادية') : tt('Switch to UIP OS', 'التحويل إلى UIP OS')}
          </button>
          {vm.enabled && !inDesktop && <button type="button" className="btn btn-outline" onClick={() => navigate(myPcPath(user?.role))}>{tt('Open the desktop', 'فتح سطح المكتب')}</button>}
        </div>
      </div>
    </div>
  );
}

/** Top-bar button of the normal portal: opens the card in a dialog. Hidden once the mode is on (the desktop has its own switch) and on phones. */
export function VirtualLauncher() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const vm = useVirtualMode();
  const mobile = useIsMobileOS();
  const [open, setOpen] = useState(false);
  if (!vm.supported || !vm.available || vm.enabled || mobile) return null;
  const label = ar ? 'الوضع الافتراضي (UIP OS)' : 'Virtual mode (UIP OS)';
  return (
    <>
      <button type="button" className="topbar__icon-btn vm-launch" onClick={() => setOpen(true)} aria-label={label} title={label}>
        <Icon name="monitor" size={18} />
      </button>
      {open && (
        <div className="modal-overlay vm-modal" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vm-modal__box">
            <button type="button" className="vm-modal__x" onClick={() => setOpen(false)} aria-label={ar ? 'إغلاق' : 'Close'}><Icon name="x" size={16} /></button>
            <ModeCard onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
