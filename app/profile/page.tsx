// src/app/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

interface Booking {
    id: string;
    booking_reference: string;
    product_name: string;
    product_price: number;
    total_price: number;
    guest_name: string;
    guest_phone: string;
    arrival_date: string;
    departure_date: string;
    guests: number;
    status: string;
    payment_status: string;
    city: string;
    created_at: string;
    discount_amount: number;
}

export default function ProfilePage() {
    const router = useRouter();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState<string>('');

    useEffect(() => {
        async function fetchUserAndBookings() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                router.push('/login?redirect=/profile');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('full_name_ar')
                .eq('id', session.user.id)
                .single();
            if (userData?.full_name_ar) {
                setUserName(userData.full_name_ar);
            }

            const { data, error } = await supabase
                .from('bookings')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching bookings:', error);
            } else {
                setBookings(data || []);
            }
            setLoading(false);
        }

        fetchUserAndBookings();
    }, [router]);

    const getStatusLabel = (status: string) => {
        const map: Record<string, { label: string; color: string }> = {
            pending: { label: 'قيد الانتظار', color: '#f39c12' },
            confirmed: { label: 'مؤكد', color: '#2ecc71' },
            completed: { label: 'مكتمل', color: '#3498db' },
            cancelled: { label: 'ملغي', color: '#e74c3c' },
        };
        return map[status] || { label: status, color: '#8A9BB0' };
    };

    if (loading) {
        return (
            <div style={{
                backgroundColor: '#0D1B2A',
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#D4AF37',
                fontSize: '1.5rem',
                fontFamily: 'Tajawal, sans-serif'
            }}>
                جاري تحميل حجوزاتك...
            </div>
        );
    }

    return (
        <div style={{
            backgroundColor: '#0D1B2A',
            minHeight: '100vh',
            color: '#F4F1E8',
            fontFamily: 'Tajawal, sans-serif',
            direction: 'rtl',
            padding: '40px 20px'
        }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '30px',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <div>
                        <h1 style={{
                            fontFamily: 'Playfair Display, serif',
                            fontSize: '2.5rem',
                            color: '#D4AF37',
                            marginBottom: '5px'
                        }}>
                            📋 حجوزاتي
                        </h1>
                        <p style={{ color: '#8A9BB0', fontSize: '0.95rem' }}>
                            {userName ? `مرحباً ${userName}` : 'مرحباً بك'} – يمكنك متابعة جميع حجوزاتك من هنا
                        </p>
                    </div>
                    <Link href="/" style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: '#F4F1E8',
                        padding: '8px 20px',
                        borderRadius: '30px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.9rem'
                    }}>
                        ← العودة إلى الرئيسية
                    </Link>
                </div>

                {bookings.length === 0 ? (
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(212, 175, 55, 0.1)',
                        borderRadius: '20px',
                        padding: '60px 20px',
                        textAlign: 'center',
                        color: '#8A9BB0'
                    }}>
                        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '15px' }}>📭</span>
                        <p style={{ fontSize: '1.1rem' }}>لا توجد حجوزات حتى الآن</p>
                        <Link href="/services" style={{
                            color: '#D4AF37',
                            marginTop: '15px',
                            display: 'inline-block',
                            textDecoration: 'underline'
                        }}>
                            ابدأ بحجز خدمتك الأولى ←
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {bookings.map((booking) => {
                            const statusInfo = getStatusLabel(booking.status);
                            return (
                                <div key={booking.id} style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(212, 175, 55, 0.1)',
                                    borderRadius: '16px',
                                    padding: '20px 24px',
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '15px'
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            flexWrap: 'wrap'
                                        }}>
                                            <span style={{
                                                color: '#D4AF37',
                                                fontWeight: 'bold',
                                                fontSize: '0.9rem'
                                            }}>
                                                {booking.booking_reference}
                                            </span>
                                            <span style={{
                                                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                                                color: '#D4AF37',
                                                padding: '2px 12px',
                                                borderRadius: '12px',
                                                fontSize: '0.7rem',
                                                border: '1px solid rgba(212, 175, 55, 0.2)'
                                            }}>
                                                {booking.city}
                                            </span>
                                            {booking.discount_amount > 0 && (
                                                <span style={{
                                                    backgroundColor: 'rgba(231, 76, 60, 0.15)',
                                                    color: '#e74c3c',
                                                    padding: '2px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.65rem',
                                                    border: '1px solid #e74c3c40'
                                                }}>
                                                    خصم {booking.discount_amount} ريال
                                                </span>
                                            )}
                                        </div>
                                        <h3 style={{
                                            fontSize: '1.2rem',
                                            fontWeight: 'bold',
                                            color: '#FFFFFF',
                                            margin: '6px 0 4px'
                                        }}>
                                            {booking.product_name}
                                        </h3>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '12px',
                                            fontSize: '0.85rem',
                                            color: '#8A9BB0'
                                        }}>
                                            <span>📅 من {new Date(booking.arrival_date).toLocaleDateString('ar-EG')}</span>
                                            <span>→ إلى {new Date(booking.departure_date).toLocaleDateString('ar-EG')}</span>
                                            <span>👥 {booking.guests} ضيوف</span>
                                        </div>
                                        {/* ✅ زر التقييم – يظهر فقط للحجوزات المكتملة (completed) */}
                                        {booking.status === 'completed' && (
                                            <Link
                                                href={`/booking/${booking.id}/review`}
                                                style={{
                                                    background: '#D4AF37',
                                                    color: '#0D1B2A',
                                                    padding: '6px 16px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold',
                                                    textDecoration: 'none',
                                                    display: 'inline-block',
                                                    marginTop: '8px'
                                                }}
                                            >
                                                ✍️ تقييم الخدمة
                                            </Link>
                                        )}
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: '6px',
                                        minWidth: '120px'
                                    }}>
                                        <span style={{
                                            fontSize: '1.1rem',
                                            fontWeight: 'bold',
                                            color: '#D4AF37'
                                        }}>
                                            {booking.total_price || booking.product_price} ريال
                                        </span>
                                        <span style={{
                                            backgroundColor: `${statusInfo.color}20`,
                                            color: statusInfo.color,
                                            padding: '2px 14px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            border: `1px solid ${statusInfo.color}40`
                                        }}>
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}