'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FiMail } from 'react-icons/fi';
import { supabase } from '@/lib/supabase/client';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { Chrome } from './Chrome';
import styles from './v6.module.css';

export default function EmailVerification() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(true);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { try { const saved = sessionStorage.getItem('dir3com-verification-email') || ''; setEmail(saved); setEditing(!saved); } catch { /* Manual entry remains usable. */ } } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !/^\d{6}$/.test(digits.join(''))) return;
    inFlight.current = true; setBusy(true); setFailed(false);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: digits.join(''), type: 'email' });
      if (error || !data.user || !data.session || !data.user.email_confirmed_at) { setFailed(true); return; }
      try { sessionStorage.removeItem('dir3com-verification-email'); } catch { /* No auth state is stored here. */ }
      window.location.assign('/login-success');
    } catch { setFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function resend() {
    if (inFlight.current || seconds || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    inFlight.current = true; setBusy(true); setFailed(false); setSent(false);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (error) { setFailed(true); return; }
      setSent(true); setSeconds(60); setEditing(false); setDigits(Array(6).fill(''));
      try { sessionStorage.setItem('dir3com-verification-email', email.trim()); } catch { /* Manual entry remains usable. */ }
    } catch { setFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function changeDigit(index: number, raw: string) {
    const normalized = raw.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/\D/g, '').slice(0, 6 - index);
    setDigits(previous => { const next = [...previous]; next[index] = ''; [...normalized].forEach((digit, offset) => { next[index + offset] = digit; }); return next; });
    if (normalized) inputs.current[Math.min(5, index + normalized.length)]?.focus();
  }
  return <Chrome><div className={styles.authStage}>
    <section className={styles.authPanel} aria-labelledby="verify-heading">
      <FiMail className={styles.mailIcon} aria-hidden="true" />
      <h1 id="verify-heading">{ar ? 'تحقق من بريدك الإلكتروني' : 'Verify your email'}</h1>
      <p>{ar ? 'يرجى إدخال الرمز المرسل لإكمال إنشاء حسابك.' : 'Enter the emailed code to complete your account.'}</p>
      <form onSubmit={verify}>
        {(!email || editing) ? <label className={styles.field}>{ar ? 'البريد الإلكتروني' : 'Email address'}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label> : <p dir="ltr">{email}</p>}
        <fieldset disabled={busy}><legend className="sr-only">{ar ? 'رمز التحقق من ستة أرقام' : 'Six-digit verification code'}</legend><div className={styles.code}>{digits.map((digit, index) => <input key={index} ref={node => { inputs.current[index] = node; }} aria-label={ar ? `الرقم ${index + 1}` : `Digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} value={digit} required pattern="[0-9]" onChange={e => changeDigit(index, e.target.value)} onPaste={e => { e.preventDefault(); changeDigit(index, e.clipboardData.getData('text')); }} onKeyDown={e => { if (e.key === 'Backspace' && !digit && index) inputs.current[index - 1]?.focus(); }} />)}</div></fieldset>
        {failed && <p role="alert" className={styles.error}>{ar ? 'تعذّر إكمال التحقق. راجع الرمز والبريد وحاول مرة أخرى.' : 'Could not complete verification. Check your email and code, then try again.'}</p>}
        <button className={styles.primary} disabled={busy || !email || digits.some(d => !d)} type="submit">{ar ? 'تحقق من الرمز' : 'Verify code'}</button>
      </form>
      <p>{ar ? 'لم يصلك الرمز؟' : 'Did not receive a code?'}</p>
      <button type="button" className={styles.textButton} onClick={resend} disabled={busy || seconds > 0 || !email}>{ar ? 'إعادة الإرسال' : 'Resend'}{seconds > 0 ? ` (${seconds})` : ''}</button>
      {sent && <p role="status">{ar ? 'تم طلب إعادة الإرسال. تحقق من بريدك.' : 'Resend requested. Check your inbox.'}</p>}
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setEditing(true); setDigits(Array(6).fill('')); setFailed(false); setSent(false); }}><FiMail />{ar ? 'تغيير البريد الإلكتروني' : 'Change email address'}</button>
      <Link href="/login">{ar ? 'العودة إلى تسجيل الدخول' : 'Back to sign in'}</Link>
    </section>
    <section className={styles.authHero}><h2>{ar ? <>من فكرة السفرة<br />إلى سلامة الرجعة</> : <>From your first travel idea<br />to your safe return</>}</h2><p>{ar ? 'أنت على بُعد خطوة واحدة من تفعيل حسابك والاستمتاع بتجربة سفر آمنة.' : 'You are one step away from activating your account and enjoying a safe travel experience.'}</p></section>
  </div></Chrome>;
}
