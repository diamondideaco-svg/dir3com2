'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Chrome } from '@/components/v6/Chrome';
import { CustomerFooter } from '@/components/v6/CustomerChrome';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { supabase } from '@/lib/supabase/client';
import { RecoveryError, requestPasswordRecovery, updateRecoveredPassword, validateRecoverySession, type RecoveryIdentity, type RecoveryFailure } from '@/lib/auth/password-recovery';
import styles from './password-recovery.module.css';

const copy = {
  en: {
    forgot: 'Forgot password?', reset: 'Reset password',
    intro: 'Enter your account email to request a password recovery link.',
    resetIntro: 'Choose a new password for your account.',
    email: 'Email address', password: 'New password', confirmation: 'Confirm new password',
    send: 'Send recovery link', update: 'Update password', back: 'Back to sign in',
    busy: 'Please wait…', checking: 'Checking your recovery session…',
    accepted: 'If an account matches this email, recovery instructions have been requested. Check your inbox.',
    updated: 'Your password has been updated.', retry: 'Request a new recovery link',
    signOutError: 'Your password was updated, but we could not close this session. Try returning to sign in again.',
    errors: {
      'invalid-session': 'This recovery session is missing, invalid or expired. Request a new recovery link.',
      'password-required': 'Enter and confirm your new password.',
      'password-short': 'Password must be at least 6 characters.',
      'password-mismatch': 'Passwords do not match.',
      'request-failed': 'Could not request recovery instructions. Please try again.',
      'update-failed': 'Could not update your password. Check your new password and try again.',
    },
  },
  ar: {
    forgot: 'نسيت كلمة المرور؟', reset: 'إعادة تعيين كلمة المرور',
    intro: 'أدخل بريد حسابك الإلكتروني لطلب رابط استعادة كلمة المرور.',
    resetIntro: 'اختر كلمة مرور جديدة لحسابك.',
    email: 'البريد الإلكتروني', password: 'كلمة المرور الجديدة', confirmation: 'تأكيد كلمة المرور الجديدة',
    send: 'إرسال رابط الاستعادة', update: 'تحديث كلمة المرور', back: 'العودة إلى تسجيل الدخول',
    busy: 'يرجى الانتظار…', checking: 'جارٍ التحقق من جلسة الاستعادة…',
    accepted: 'إذا كان هناك حساب مرتبط بهذا البريد، فقد تم طلب تعليمات الاستعادة. تحقق من بريدك الوارد.',
    updated: 'تم تحديث كلمة المرور.', retry: 'طلب رابط استعادة جديد',
    signOutError: 'تم تحديث كلمة المرور، لكن تعذّر إغلاق هذه الجلسة. حاول العودة إلى تسجيل الدخول مرة أخرى.',
    errors: {
      'invalid-session': 'جلسة الاستعادة مفقودة أو غير صالحة أو منتهية. اطلب رابط استعادة جديدًا.',
      'password-required': 'أدخل كلمة المرور الجديدة وأكّدها.',
      'password-short': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
      'password-mismatch': 'كلمتا المرور غير متطابقتين.',
      'request-failed': 'تعذّر طلب تعليمات الاستعادة. حاول مرة أخرى.',
      'update-failed': 'تعذّر تحديث كلمة المرور. تحقق من كلمة المرور الجديدة وحاول مرة أخرى.',
    },
  },
} as const;

export default function PasswordRecovery({ mode }: { mode: 'forgot' | 'reset' }) {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const [identity, setIdentity] = useState<RecoveryIdentity | null>(null);
  const [checking, setChecking] = useState(mode === 'reset');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<RecoveryFailure | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (mode !== 'reset') return;
    let cancelled = false;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const callbackFailed = ['error', 'error_code', 'error_description'].some(key => url.searchParams.has(key) || fragment.has(key));
    async function initialize() {
      try {
        // Let the shared SDK finish its one-time PKCE exchange before URL cleanup.
        const validated = await validateRecoverySession(supabase.auth);
        if (callbackFailed) throw new RecoveryError('invalid-session');
        if (!cancelled) setIdentity(validated);
      } catch { if (!cancelled) setError('invalid-session'); }
      finally {
        if (!cancelled) {
          for (const key of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
          url.hash = '';
          window.history.replaceState(window.history.state, '', url.pathname + url.search);
          setChecking(false);
        }
      }
    }
    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { setIdentity(null); setError('invalid-session'); }
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [mode]);

  async function returnToLogin() {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      window.location.replace('/login');
    } catch { setSignOutError(true); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null); setAccepted(false);
    try {
      if (mode === 'forgot') {
        await requestPasswordRecovery(supabase.auth, email, window.location.origin);
        setAccepted(true);
      } else {
        if (!identity) throw new RecoveryError('invalid-session');
        await updateRecoveredPassword(supabase.auth, identity, password, confirmation);
        setUpdated(true); setPassword(''); setConfirmation('');
        await returnToLogin();
      }
    } catch (failure) {
      const code = failure instanceof RecoveryError ? failure.code : mode === 'forgot' ? 'request-failed' : 'update-failed';
      setError(code);
      if (code === 'invalid-session') setIdentity(null);
    } finally { submitting.current = false; setBusy(false); }
  }

  const invalid = mode === 'reset' && !checking && !identity;
  return <Chrome footerInContent>
    <div className={styles.scene} lang={language} dir={direction} data-recovery-mode={mode}>
      <div className={styles.stage}>
        <section className={styles.card} aria-labelledby="recovery-title">
          <h1 id="recovery-title">{mode === 'forgot' ? t.forgot : t.reset}</h1>
          <p className={styles.intro}>{mode === 'forgot' ? t.intro : t.resetIntro}</p>
          {updated ? <div role="status"><p>{t.updated}</p>{signOutError && <p>{t.signOutError}</p>}<button type="button" className={styles.primary} disabled={busy} onClick={() => void returnToLogin()}>{t.back}</button></div> : <>
            {checking && <p role="status" className={styles.notice}>{t.checking}</p>}
            {error && <p id="recovery-error" role="alert" className={styles.error}>{t.errors[error]}</p>}
            {accepted && <p role="status" className={styles.notice}>{t.accepted}</p>}
            <form onSubmit={submit} aria-busy={busy} aria-describedby={error ? 'recovery-error' : undefined}>
              {mode === 'forgot' ? <div className={styles.field}><label htmlFor="recovery-email">{t.email}</label><input id="recovery-email" name="email" type="email" autoComplete="email" dir="ltr" required value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setAccepted(false); }} /></div> : <>
                <div className={styles.field}><label htmlFor="recovery-password">{t.password}</label><input id="recovery-password" name="password" type="password" autoComplete="new-password" required value={password} disabled={busy || checking || invalid} onChange={event => setPassword(event.target.value)} /></div>
                <div className={styles.field}><label htmlFor="recovery-confirmation">{t.confirmation}</label><input id="recovery-confirmation" name="confirmation" type="password" autoComplete="new-password" required value={confirmation} disabled={busy || checking || invalid} onChange={event => setConfirmation(event.target.value)} /></div>
              </>}
              <button className={styles.primary} type="submit" disabled={busy || checking || invalid}>{busy ? t.busy : mode === 'forgot' ? t.send : t.update}</button>
            </form>
            {invalid && <Link className={styles.retry} href="/auth/forgot-password">{t.retry}</Link>}
            <Link className={styles.back} href="/login">{t.back}</Link>
          </>}
        </section>
      </div>
      <CustomerFooter surface="image" className={styles.footer} />
    </div>
  </Chrome>;
}
