// src/app/(auth)/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const registerCopy = {
    ar: { loading: 'جاري التحميل...', title: 'إنشاء حساب', welcome: 'انضم إلى dir3com واستمتع بتجربة سفر مخصصة', fullName: 'الاسم الكامل', fullNamePlaceholder: 'أدخل اسمك الكامل', email: 'البريد الإلكتروني', password: 'كلمة المرور', passwordPlaceholder: '•••••••• (6 أحرف على الأقل)', minimum: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', submit: 'إنشاء حساب', submitting: 'جاري إنشاء الحساب...', existing: 'لديك حساب بالفعل؟', signIn: 'تسجيل الدخول', success: 'تم إنشاء الحساب! رجاء تأكيد بريدك الإلكتروني.' },
    en: { loading: 'Loading...', title: 'Create an account', welcome: 'Join dir3com for a tailored travel experience', fullName: 'Full name', fullNamePlaceholder: 'Enter your full name', email: 'Email', password: 'Password', passwordPlaceholder: '•••••••• (at least 6 characters)', minimum: 'Password must be at least 6 characters', submit: 'Create account', submitting: 'Creating account...', existing: 'Already have an account?', signIn: 'Sign in', success: 'Your account was created. Please confirm your email.' },
} as const;

export default function RegisterPage() {
    const { language, direction } = useLanguage();
    const t = registerCopy[language];
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
            setError(t.minimum);
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

        alert(t.success);
        router.push('/login');
    };

    return (
        <div style={{
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
            fontFamily: 'var(--font-arabic)',
            direction
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
                    fontFamily: 'var(--font-display)',
                    fontSize: '2rem',
                    color: '#D4AF37',
                    textAlign: 'center',
                    marginBottom: '5px'
                }}>
                    {t.title}
                </h1>
                <p style={{ color: '#6B7280', textAlign: 'center', marginBottom: '30px' }}>
                    {t.welcome}
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
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{t.fullName}</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t.fullNamePlaceholder}
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(15,23,42,0.12)',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{t.email}</label>
                        <input
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
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>{t.password}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t.passwordPlaceholder}
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(15,23,42,0.12)',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '1rem',
                                outline: 'none'
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
                        {loading ? t.submitting : t.submit}
                    </button>
                </form>

                <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '20px' }}>
                    {t.existing}{' '}
                    <Link href="/login" style={{ color: '#D4AF37', textDecoration: 'none' }}>
                        {t.signIn}
                    </Link>
                </p>
            </div>
        </div>
    );
}