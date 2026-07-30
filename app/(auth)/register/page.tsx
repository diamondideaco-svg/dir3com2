// src/app/(auth)/register/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

export default function RegisterPage() {
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
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
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

        alert('✅ تم إنشاء الحساب! رجاء تأكيد بريدك الإلكتروني.');
        router.push('/login');
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
                    إنشاء حساب
                </h1>
                <p style={{ color: '#6B7280', textAlign: 'center', marginBottom: '30px' }}>
                    انضم إلى DIR3COM واستمتع بتجربة سفر مخصصة
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

                <form onSubmit={handleRegister}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', color: '#6B7280' }}>الاسم الكامل</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="أدخل اسمك الكامل"
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
                            placeholder="•••••••• (6 أحرف على الأقل)"
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
                        {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '20px' }}>
                    لديك حساب بالفعل؟{' '}
                    <Link href="/login" style={{ color: '#D4AF37', textDecoration: 'none' }}>
                        تسجيل الدخول
                    </Link>
                </p>
            </div>
        </div>
    );
}