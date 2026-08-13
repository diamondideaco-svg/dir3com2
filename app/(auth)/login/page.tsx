// src/app/(auth)/login/page.tsx
 'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getPostLoginDestination } from '@/lib/auth/redirect';

export default function LoginPage() {
    return (
        <Suspense fallback={<div style={{ backgroundColor: '#08111c', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>جاري التحميل...</div>}>
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
            background: 'radial-gradient(circle at 80% 14%, rgba(212,175,55,0.12), transparent 22%), linear-gradient(180deg, #08111c 0%, #050b13 100%)',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 16px',
            fontFamily: 'Tajawal, sans-serif',
            direction: 'rtl',
            color: '#FFFFFF'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '520px',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '28px',
                border: '1px solid rgba(212, 175, 55, 0.24)',
                background: 'linear-gradient(180deg, rgba(7,13,24,0.97) 0%, rgba(10,18,30,0.98) 100%)',
                boxShadow: '0 36px 80px rgba(0,0,0,0.35)',
                padding: '28px 20px'
            }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 8%, rgba(212,175,55,0.13), transparent 34%)' }} />
                <div style={{ position: 'relative', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                        <div style={{ width: '84px', height: '84px', borderRadius: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,0.5)', background: 'linear-gradient(180deg, #24150d 0%, #09101a 100%)', color: '#D4AF37', fontSize: '2.2rem', fontWeight: 900 }}>
                            3
                        </div>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.03em' }}>dir3com</div>
                    <div style={{ marginTop: '6px', color: '#D4AF37', fontSize: '0.78rem', letterSpacing: '0.24em' }}>YOUR SHIELD FOR TOURISM.</div>
                    <h1 style={{
                        fontSize: '2rem',
                        color: '#D4AF37',
                        textAlign: 'center',
                        marginTop: '18px',
                        marginBottom: '8px'
                    }}>
                        تسجيل الدخول
                    </h1>
                    <p style={{ color: 'rgba(245,245,245,0.72)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.8 }}>
                        مرحباً بعودتك إلى dir3com
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(255,0,0,0.12)',
                        border: '1px solid rgba(255,120,120,0.7)',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        marginBottom: '18px',
                        color: '#FFB4B4',
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
                        padding: '12px 14px',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#FFFFFF',
                        border: '1px solid rgba(212,175,55,0.24)',
                        borderRadius: '18px',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        marginBottom: '18px'
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', margin: '18px 0' }}>
                    <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(212,175,55,0.18)' }} />
                    <span style={{ color: 'rgba(245,245,245,0.52)', fontSize: '0.85rem' }}>أو</span>
                    <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(212,175,55,0.18)' }} />
                </div>

                <form onSubmit={handleEmailLogin}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(245,245,245,0.74)' }}>البريد الإلكتروني</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@email.com"
                            required
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '16px',
                                border: '1px solid rgba(212,175,55,0.16)',
                                background: 'rgba(255,255,255,0.03)',
                                color: '#FFFFFF',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(245,245,245,0.74)' }}>كلمة المرور</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '16px',
                                border: '1px solid rgba(212,175,55,0.16)',
                                background: 'rgba(255,255,255,0.03)',
                                color: '#FFFFFF',
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
                            background: 'linear-gradient(180deg, #f1d27d 0%, #c9972f 100%)',
                            color: '#08111c',
                            border: 'none',
                            borderRadius: '999px',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                    >
                        {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', color: 'rgba(245,245,245,0.7)', marginTop: '20px' }}>
                    ليس لديك حساب؟{' '}
                    <Link href="/register" style={{ color: '#D4AF37', textDecoration: 'none' }}>
                        إنشاء حساب جديد
                    </Link>
                </p>
            </div>
        </div>
    );
}
