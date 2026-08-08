// src/app/(auth)/login/page.tsx
'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getPostLoginDestination } from '@/lib/auth/redirect';

export default function LoginPage() {
    return (
        <Suspense fallback={<div style={{ backgroundColor: '#0D1B2A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>جاري التحميل...</div>}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestedDestination = searchParams.get('redirect') ?? searchParams.get('next');
    const redirectTo = getPostLoginDestination(
        requestedDestination,
        typeof window === 'undefined' ? undefined : window.location.origin,
    );

    useEffect(() => {
        supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
            if (data.session) router.push(redirectTo);
        });
    }, [redirectTo, router]);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push(redirectTo);
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);

        const callbackParams = new URLSearchParams();
        callbackParams.set('redirect', redirectTo);
        callbackParams.set('next', redirectTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback?${callbackParams.toString()}`,
                skipBrowserRedirect: true,
            },
        });

        if (error) {
            setError(`❌ Google: ${error.message}`);
            setLoading(false);
            return;
        }

        if (data?.url) {
            window.location.assign(data.url);
        } else {
            setError('❌ Google: لم يتم إنشاء رابط التوجيه');
            setLoading(false);
        }
    };

    return (
        <div style={{
            backgroundColor: '#0D1B2A',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            fontFamily: 'Tajawal, sans-serif',
            direction: 'rtl'
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(212, 175, 55, 0.15)',
                borderRadius: '24px',
                padding: '40px 30px'
            }}>
                <h1 style={{
                    fontFamily: 'Playfair Display, serif',
                    fontSize: '2rem',
                    color: '#D4AF37',
                    textAlign: 'center',
                    marginBottom: '5px'
                }}>
                    تسجيل الدخول
                </h1>
                <p style={{ color: '#6B7280', textAlign: 'center', marginBottom: '30px' }}>
                    مرحباً بعودتك إلى dir3com
                </p>

                {error && (
                    <div style={{
                        background: 'rgba(255,0,0,0.1)',
                        border: '1px solid #ff4444',
                        borderRadius: '12px',
                        padding: '10px',
                        marginBottom: '20px',
                        color: '#ff6666',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: '#1A1A2E',
                        color: '#FFFFFF',
                        border: '1px solid #2A2A3E',
                        borderRadius: '12px',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        marginBottom: '20px'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 48 48">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                        <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                    </svg>
                    {loading ? 'جاري التحميل...' : 'تسجيل الدخول بـ Google'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', margin: '20px 0' }}>
                    <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #2A2A3E' }} />
                    <span style={{ color: '#4A5A6E', fontSize: '0.85rem' }}>أو</span>
                    <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #2A2A3E' }} />
                </div>

                <form onSubmit={handleEmailLogin}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>البريد الإلكتروني</label>
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
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#F4F1E8',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>كلمة المرور</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#F4F1E8',
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
                            color: '#0D1B2A',
                            border: 'none',
                            borderRadius: '30px',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                    >
                        {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '20px' }}>
                    ليس لديك حساب؟{' '}
                    <Link href="/register" style={{ color: '#D4AF37', textDecoration: 'none' }}>
                        إنشاء حساب جديد
                    </Link>
                </p>
            </div>
        </div>
    );
}
