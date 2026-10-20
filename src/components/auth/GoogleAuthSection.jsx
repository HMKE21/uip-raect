import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { roleHome } from '../../config/roleHome';
import { useLanguage } from '../../context/LanguageContext';
import { getGoogleConfig } from '../../lib/googleAuth';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * The "or continue with Google" block used on Login and Register.
 *  - existing account  -> signed in, straight to its portal (or the 2FA step);
 *  - no account yet    -> /auth/google/complete, where the student fills in what Google couldn't give us.
 * Renders nothing when Google sign-in isn't configured.
 */
export default function GoogleAuthSection({ onError, placement = 'after' }) {
  const { loginWithGoogle } = useAuth();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    getGoogleConfig().then((c) => { if (alive) setEnabled(c.enabled); });
    return () => { alive = false; };
  }, []);

  async function handleToken(idToken) {
    onError?.(null);
    setBusy(true);
    try {
      const r = await loginWithGoogle(idToken);
      if (r.needsRegistration) {
        navigate('/auth/google/complete', { state: { registration: r } });
      } else if (r.requiresTwoFactor) {
        navigate('/auth/two-factor', { state: { challengeToken: r.challengeToken } });
      } else {
        navigate(roleHome(r.role), { replace: true });
      }
    } catch (err) {
      onError?.(err instanceof ApiError ? errorMessage(err) : (locale === 'ar' ? 'حصل خطأ. جرّب تاني.' : 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  const divider = (
    <div className="auth-divider" role="separator"><span>{locale === 'ar' ? 'أو' : 'or'}</span></div>
  );
  return (
    <div className={`auth-google-section auth-google-section--${placement}`}>
      {placement === 'after' && divider}
      <GoogleSignInButton onToken={handleToken} onError={onError} disabled={busy} />
      {placement === 'before' && divider}
    </div>
  );
}
