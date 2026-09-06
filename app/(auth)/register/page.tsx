// src/app/(auth)/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import styles from './register.module.css';

export default function RegisterPage() {
    const { language, direction } = useLanguage();
    const isArabic = language === 'ar';
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
            if (data.session) router.push('/');
        });
    }, [router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (password.length < 6) {
            setError(isArabic ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName },
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        alert(isArabic ? '✅ تم إنشاء الحساب! رجاء تأكيد بريدك الإلكتروني.' : '✅ Account created! Please confirm your email.');
        router.push('/login');
    };

    return (
        <div className={styles.register} lang={language} dir={direction} style={{
            // Approved background asset used as a layer only; all content below is real HTML.
            backgroundColor: '#FAF8F4',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.18)), url("/brand/runtime/dir3com-login-background-approved.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            fontFamily: language === 'ar' ? 'var(--font-arabic)' : 'var(--font-latin)'
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(212, 175, 55, 0.25)',
                borderRadius: '24px',
                boxShadow: '0 26px 70px rgba(15, 23, 42, 0.10)',
                padding: '40px 30px'
            }}>
                <h1 style={{
                    fontFamily: 'inherit',
                    fontSize: '2rem',
                    color: '#D4AF37',
                    textAlign: 'center',
                    marginBottom: '5px'
                }}>
                    {isArabic ? 'إنشاء حساب' : 'Create account'}
                </h1>
                <p style={{ color: '#6B7280', textAlign: 'center', marginBottom: '30px' }}>
                    {isArabic ? 'انضم إلى DIR3COM واستمتع بتجربة سفر مخصصة' : 'Join DIR3COM and enjoy a personalized travel experience'}
                </p>

                {error && (
                    <div style={{
                        background: 'rgba(220,38,38,0.08)',
                        border: '1px solid rgba(220,38,38,0.35)',
                        borderRadius: '12px',
                        padding: '10px',
                        marginBottom: '20px',
                        color: '#b91c1c',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleRegister}>
                    <div style={{ marginBottom: '16px' }}>
                        <label htmlFor="register-name" style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{isArabic ? 'الاسم الكامل' : 'Full name'}</label>
                        <input
                            id="register-name"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={isArabic ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(15,23,42,0.12)',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '1rem',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label htmlFor="register-email" style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{isArabic ? 'البريد الإلكتروني' : 'Email'}</label>
                        <input
                            id="register-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@email.com"
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(15,23,42,0.12)',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '1rem',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="register-password" style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{isArabic ? 'كلمة المرور' : 'Password'}</label>
                        <input
                            id="register-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isArabic ? '•••••••• (6 أحرف على الأقل)' : '•••••••• (at least 6 characters)'}
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(15,23,42,0.12)',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '1rem',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: '#D4AF37',
                            color: '#334155',
                            border: 'none',
                            borderRadius: '30px',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                    >
                        {loading ? (isArabic ? 'جاري إنشاء الحساب...' : 'Creating account...') : (isArabic ? 'إنشاء حساب' : 'Create account')}
                    </button>
                </form>

                <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '20px' }}>
                    {isArabic ? 'لديك حساب بالفعل؟' : 'Already have an account?'}{' '}
                    <Link href="/login" style={{ color: '#D4AF37', textDecoration: 'none' }}>
                        {isArabic ? 'تسجيل الدخول' : 'Log in'}
                    </Link>
                </p>
            </div>
        </div>
    );
}
