// src/app/admin/page.tsx
import Link from 'next/link';
import AdminStats from '@/components/admin/AdminStats';
import BookingsTable from '@/components/admin/BookingsTable';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function getAdminData() {
    const supabase = await createSupabaseServerClient();

    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

    if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        return { bookings: [], stats: { total: 0, pending: 0, confirmed: 0, completed: 0, revenue: 0 } };
    }

    const stats = {
        total: bookings?.length || 0,
        pending: bookings?.filter((b: { status?: string | null }) => b.status === 'pending').length || 0,
        confirmed: bookings?.filter((b: { status?: string | null }) => b.status === 'confirmed').length || 0,
        completed: bookings?.filter((b: { status?: string | null }) => b.status === 'completed').length || 0,
        revenue: bookings?.reduce((sum: number, b: { total_price?: number | null }) => sum + (b.total_price || 0), 0) || 0,
    };

    return { bookings: bookings || [], stats };
}

export default async function AdminPage() {
    const { bookings, stats } = await getAdminData();

    return (
        <div style={{
            backgroundColor: '#0D1B2A',
            minHeight: '100vh',
            color: '#F4F1E8',
            fontFamily: 'Tajawal, sans-serif',
            direction: 'rtl',
            padding: '40px 20px'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
                            🛡️ لوحة التحكم
                        </h1>
                        <p style={{ color: '#8A9BB0', fontSize: '0.95rem' }}>
                            إدارة الحجوزات والخدمات
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
                        ← العودة إلى الموقع
                    </Link>
                </div>

                <AdminStats stats={stats} />

                <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    <Link href="/admin/dashboard" style={{
                        background: 'linear-gradient(135deg, #D4AF37, #8B5E3C)',
                        color: '#0D1B2A',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        fontWeight: 700
                    }}>
                        📊 لوحة القيادة التنفيذية
                    </Link>
                    <Link href="/admin/finance" style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: '#F4F1E8',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        💼 إدارة التمويل والثقة
                    </Link>
                    <Link href="/admin/operations" style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: '#F4F1E8',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        🔧 العمليات
                    </Link>
                    <Link href="/admin/verification" style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: '#F4F1E8',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        🛡️ التحقق والسمعة
                    </Link>
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(212, 175, 55, 0.1)',
                    borderRadius: '20px',
                    padding: '24px',
                    marginTop: '30px'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <h2 style={{
                            fontFamily: 'Playfair Display, serif',
                            fontSize: '1.5rem',
                            color: '#FFFFFF'
                        }}>
                            📋 الحجوزات
                        </h2>
                        <span style={{
                            color: '#8A9BB0',
                            fontSize: '0.85rem'
                        }}>
                            إجمالي: {stats.total} حجز
                        </span>
                    </div>

                    <BookingsTable bookings={bookings} />
                </div>
            </div>
        </div>
    );
}