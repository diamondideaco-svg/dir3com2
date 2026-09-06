'use client';

import { useState, useEffect, useRef, useMemo, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { FiArrowRight, FiEye, FiEyeOff, FiGlobe, FiLock, FiMail, FiPhone, FiSun, FiUser } from 'react-icons/fi';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaWhatsapp, FaXTwitter, FaUniversalAccess } from 'react-icons/fa6';
import { FcGoogle } from 'react-icons/fc';
import { supabase } from '@/lib/supabase/client';
import { buildOAuthCallbackUrl } from '@/lib/auth/oauth-callback';
import { getPostLoginDestination } from '@/lib/auth/redirect';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { normalizeRegisterContact, registerCountries, getCountryCallingCode, registerSocialLinks, type CountryCode } from '@/lib/auth/register-contact';
import styles from './register.module.css';

const socialIcons = { facebook: FaFacebookF, instagram: FaInstagram, linkedin: FaLinkedinIn, tiktok: FaTiktok, x: FaXTwitter, whatsapp: FaWhatsapp };
const subscribeToBrowser = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export default function RegisterPage() {
    const { language, direction, setLanguage } = useLanguage();
    const ar = language === 'ar';
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [fullName, setFullName] = useState('');
    const [country, setCountry] = useState<CountryCode>('SA');
    const [phone, setPhone] = useState('');
    const phoneInput = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [largeText, setLargeText] = useState(false);
    const [warmSurface, setWarmSurface] = useState(false);
    const [consent, setConsent] = useState(false);
    const consentInput = useRef<HTMLInputElement>(null);
    const socials = registerSocialLinks;
    // Node/browser ICU versions differ: localize only after the identical SSR snapshot hydrates.
    const browserReady = useSyncExternalStore(subscribeToBrowser, browserSnapshot, serverSnapshot);
    const countries = useMemo(() => {
        if (!browserReady) return registerCountries.map(code => ({ code, name: String(code) }));
        const names = new Intl.DisplayNames([language], { type: 'region' });
        return registerCountries.map(code => ({ code, name: names.of(code) || code }))
            .sort((a, b) => a.name.localeCompare(b.name, language));
    }, [language, browserReady]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
            if (data.session) router.push('/');
        });
    }, [router]);

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < 6) {
            setError(ar ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
            return;
        }
        if (password !== confirmation) {
            setError(ar ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
            return;
        }
        const contact = normalizeRegisterContact(country, phone);
        if (!contact) {
            setError(ar ? 'أدخل رقم هاتف صالحًا للدولة المختارة.' : 'Enter a valid phone number for the selected country.');
            phoneInput.current?.focus();
            return;
        }
        setLoading(true);
        try {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName, registration_contact: contact } },
        });
        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }
        alert(ar ? '✅ تم إنشاء الحساب! رجاء تأكيد بريدك الإلكتروني.' : '✅ Account created! Please confirm your email.');
        router.push('/login');
        } catch {
            setError(ar ? 'تعذّر إنشاء الحساب. حاول مرة أخرى.' : 'Unable to create account. Please try again.');
            setLoading(false);
        }
    };

    // Same Google provider and trusted callback builder used by Login.
    const handleGoogle = async () => {
        if (!consent) {
            setError(ar ? 'يرجى الموافقة على الشروط وسياسة الخصوصية للمتابعة.' : 'Please accept the terms and privacy policy to continue.');
            consentInput.current?.focus();
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: buildOAuthCallbackUrl(window.location.origin, getPostLoginDestination(null)),
                    skipBrowserRedirect: true,
                },
            });
            if (oauthError || !data?.url) {
                setError(ar ? 'تعذّر بدء تسجيل الدخول باستخدام Google. حاول مرة أخرى.' : 'Unable to start Google sign-in. Please try again.');
                setLoading(false);
                return;
            }
            window.location.assign(data.url);
        } catch {
            setError(ar ? 'تعذّر بدء تسجيل الدخول باستخدام Google. حاول مرة أخرى.' : 'Unable to start Google sign-in. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className={styles.register} lang={language} dir={direction} data-large={largeText} data-warm={warmSurface}
            style={{ fontFamily: language === 'ar' ? 'var(--font-arabic)' : 'var(--font-latin)' }}>
            <a className={styles.skip} href="#register-form">{ar ? 'انتقل إلى إنشاء الحساب' : 'Skip to registration'}</a>
            <header className={styles.header}>
                <Link href="/" className={styles.logo} aria-label="dir3com"><Image src="/brand/runtime/dir3com-logo-approved-cropped.png" alt="dir3com" width={188} height={74} unoptimized preload /></Link>
                <nav className={styles.tools} aria-label={ar ? 'أدوات العرض' : 'Display controls'}>
                    <button type="button" aria-label={ar ? 'تكبير النص' : 'Increase text size'} aria-pressed={largeText} onClick={() => setLargeText(!largeText)}><FaUniversalAccess /></button>
                    <button type="button" aria-label={ar ? 'تبديل المظهر' : 'Toggle appearance'} aria-pressed={warmSurface} onClick={() => setWarmSurface(!warmSurface)}><FiSun /></button>
                    <div className={styles.languages}><button type="button" lang="ar" aria-pressed={ar} onClick={() => setLanguage('ar')}>العربية</button><button type="button" lang="en" aria-pressed={!ar} onClick={() => setLanguage('en')}>EN <FiGlobe /></button></div>
                    <Link href="/" className={styles.home}><FiArrowRight />{ar ? 'العودة إلى الرئيسية' : 'Back to home'}</Link>
                </nav>
            </header>
            <main className={styles.stage}>
                <div className={styles.composition}>
                    <section className={styles.panel} aria-labelledby="register-title">
                        <h1 id="register-title">{ar ? 'إنشاء حساب' : 'Create account'}</h1>
                        <p className={styles.intro}>{ar ? 'انضم إلى dir3com وابدأ رحلتك المميزة' : 'Join dir3com and begin your exceptional journey'}</p>
                        <nav className={styles.tabs} aria-label={ar ? 'الحساب' : 'Account'}><a href="#register-form" aria-current="page">{ar ? 'إنشاء حساب' : 'Create account'}</a><Link href="/login">{ar ? 'تسجيل الدخول' : 'Log in'}</Link></nav>
                        {error && <p role="alert" className={styles.error}>{error}</p>}
                        <form id="register-form" onSubmit={handleRegister}>
                            <div className={styles.field}><label htmlFor="register-name">{ar ? 'الاسم الكامل' : 'Full name'}</label><div className={styles.input}><FiUser aria-hidden="true" /><input id="register-name" type="text" autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder={ar ? 'أدخل اسمك الكامل' : 'Enter your full name'} /></div></div>
                            <div className={styles.field}><label htmlFor="register-email">{ar ? 'البريد الإلكتروني' : 'Email'}</label><div className={styles.input}><FiMail aria-hidden="true" /><input id="register-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={ar ? 'أدخل بريدك الإلكتروني' : 'Enter your email'} /></div></div>
                            <div className={styles.field}><label htmlFor="register-phone">{ar ? 'رقم الجوال' : 'Phone number'}</label><div className={`${styles.input} ${styles.phone}`}><FiPhone aria-hidden="true" /><input id="register-phone" ref={phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} placeholder={ar ? 'أدخل رقم الجوال' : 'Enter phone number'} aria-describedby="register-contact-note" /><div className={styles.country}><span dir="ltr" aria-hidden="true">+{getCountryCallingCode(country)}⌄</span><select id="register-country" aria-label={ar ? 'الدولة ورمز الاتصال' : 'Country and calling code'} autoComplete="country" required value={country} onChange={e => setCountry(e.target.value as CountryCode)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name} (+{getCountryCallingCode(c.code)})</option>)}</select></div></div></div>
                            <div className={styles.field}><label htmlFor="register-password">{ar ? 'كلمة المرور' : 'Password'}</label><div className={styles.input}><FiLock aria-hidden="true" /><input id="register-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder={ar ? 'أدخل كلمة المرور' : 'Enter password'} /><button type="button" onClick={() => setVisible(!visible)} aria-label={ar ? (visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور') : (visible ? 'Hide password' : 'Show password')} aria-pressed={visible}>{visible ? <FiEyeOff /> : <FiEye />}</button></div></div>
                            <div className={styles.field}><label htmlFor="register-confirmation">{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}</label><div className={styles.input}><FiLock aria-hidden="true" /><input id="register-confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={ar ? 'أعد إدخال كلمة المرور' : 'Re-enter password'} /></div></div>
                            <div className={styles.consent}><input id="register-consent" type="checkbox" required ref={consentInput} checked={consent} onChange={e => setConsent(e.target.checked)} /><label htmlFor="register-consent">{ar ? 'أوافق على ' : 'I agree to the '}<Link href="/terms">{ar ? 'الشروط والأحكام' : 'terms'}</Link>{ar ? ' و' : ' and '}<Link href="/privacy">{ar ? 'سياسة الخصوصية' : 'privacy policy'}</Link></label></div>
                            <button className={styles.submit} type="submit" disabled={loading}>{loading ? (ar ? 'جاري إنشاء الحساب...' : 'Creating account...') : (ar ? 'إنشاء حساب' : 'Create account')}</button>
                        </form>
                        <div className={styles.separator}>{ar ? 'أو تابع باستخدام' : 'Or continue with'}</div>
                        <button className={styles.google} type="button" disabled={loading} onClick={handleGoogle}><FcGoogle aria-hidden="true" />{ar ? 'المتابعة باستخدام Google' : 'Continue with Google'}</button>
                        <p id="register-contact-note" className={styles.contactNote}>{ar ? 'يُحفظ الهاتف مع التسجيل بالبريد دون تحقق SMS. Google مسار دخول منفصل.' : 'Phone is saved with email registration, without SMS verification. Google is a separate sign-in flow.'}</p>
                        <p className={styles.login}>{ar ? 'لديك حساب بالفعل؟ ' : 'Already have an account? '}<Link href="/login">{ar ? 'تسجيل الدخول' : 'Log in'}</Link></p>
                    </section>
                    <section className={styles.hero} aria-labelledby="register-hero"><h2 id="register-hero">{ar ? <>من فكرة السفرة إلى<br />سلامة الرجعة</> : <>From your first travel idea<br />to your safe return</>}</h2><p>{ar ? <>أنشئ حسابك الآن وابدأ رحلتك مع<br /><span dir="ltr">dir3com</span> لتجربة سفر فاخرة وآمنة.</> : <>Create your account and begin your journey with <span>dir3com</span> for a luxurious, safe travel experience.</>}</p></section>
                    <footer className={styles.footer}>
                        <section><h2>{ar ? 'عن الشركة' : 'Company'}</h2><Link href="/about">{ar ? 'من نحن' : 'About us'}</Link><Link href="/terms">{ar ? 'الشروط والأحكام' : 'Terms and conditions'}</Link><Link href="/privacy">{ar ? 'سياسة الخصوصية' : 'Privacy policy'}</Link><Link href="/support">{ar ? 'مركز المساعدة' : 'Help center'}</Link></section>
                        <section><h2>{ar ? 'خدماتنا' : 'Services'}</h2>{['Drive', 'Stay', 'Concierge', 'VIP', 'Fly'].map(family => <Link key={family} href={`/services/${family.toLowerCase()}`}>dir3 {family}</Link>)}</section>
<section><h2>{ar ? 'تواصل معنا' : 'Contact us'}</h2><a href="https://wa.me/966532867009"><FaWhatsapp />{ar ? 'السعودية: ' : 'Saudi Arabia: '}<bdi>+966 53 286 7009</bdi></a><a href="https://wa.me/201011676418"><FaWhatsapp />{ar ? 'مصر: ' : 'Egypt: '}<bdi>+20 101 167 6418</bdi></a><a href="mailto:info@dir3com.com"><FiMail />info@dir3com.com</a><a href="https://www.dir3com.com"><FiGlobe />www.dir3com.com</a><a href="https://www.dir3com.net"><FiGlobe />www.dir3com.net</a><div className={styles.socials}>{socials.map(s => { const Icon = socialIcons[s.channel]; return <a key={s.channel} href={s.href} aria-label={s.label} rel="noopener noreferrer" target="_blank"><Icon /></a>; })}</div></section>
                    </footer>
                    <p className={styles.copyright}>{ar ? 'جميع الحقوق محفوظة © 2026 dir3com' : '© 2026 dir3com. All rights reserved.'}</p>
                </div>
            </main>
        </div>
    );
}
