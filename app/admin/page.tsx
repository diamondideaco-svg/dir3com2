// src/app/admin/page.tsx
import Link from 'next/link';
import AdminStats from '@/components/admin/AdminStats';
import BookingsTable from '@/components/admin/BookingsTable';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import { isConfirmedProductionRevenue, isProductionBooking } from '@/lib/integration/executive-dashboard-contract';
import { attachAuthoritativeCustomerName } from '@/lib/admin/booking-customer';

async function getAdminData() {
    const { supabase } = await requireAdminPageDataAccess('/admin');

    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, booking_reference, user_id, guest_name, guest_email, product_name, status, payment_status, total_amount, total_price, currency, synthetic, environment, source_channel, deleted_at, created_at')
        .eq('synthetic', false)
        .eq('environment', 'production')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        return { bookings: [], stats: null, error: true };
    }

    const ownerIds = [...new Set((bookings ?? []).map((booking) => booking.user_id).filter((id): id is string => Boolean(id)))];
    const profileNames = new Map<string, string>();
    if (ownerIds.length) {
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name').in('id', ownerIds);
        if (profilesError) {
            console.error('Error fetching booking customer profiles:', profilesError);
            return { bookings: [], stats: null, error: true };
        }
        for (const profile of profiles ?? []) profileNames.set(profile.id, profile.full_name);
    }

    const productionBookings = (bookings ?? []).filter(isProductionBooking).map((booking) => attachAuthoritativeCustomerName(booking, profileNames));
    const revenueBookings = productionBookings.filter(isConfirmedProductionRevenue);

    const stats = {
        total: productionBookings.length,
        pending: productionBookings.filter((booking) => booking.status === 'pending').length,
        confirmed: productionBookings.filter((booking) => booking.status === 'confirmed').length,
        completed: productionBookings.filter((booking) => booking.status === 'completed').length,
        revenue: revenueBookings.reduce((sum, booking) => sum + Number(booking.total_amount ?? booking.total_price ?? 0), 0),
    };

    return { bookings: productionBookings, stats, error: false };
}

export default async function AdminPage() {
    const { bookings, stats, error } = await getAdminData();

    return (
        <div style={{
            backgroundColor: '#FAF8F4',
            minHeight: '100vh',
            color: '#334155',
            fontFamily: 'var(--font-arabic)',
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
                            fontFamily: 'var(--font-display)',
                            fontSize: '2.5rem',
                            color: '#D4AF37',
                            marginBottom: '5px'
                        }}>
                            🛡️ <AdminText ar="لوحة التحكم" en="Admin dashboard" />
                        </h1>
                        <p style={{ color: '#8A9BB0', fontSize: '0.95rem' }}>
                            <AdminText ar="إدارة حجوزات الإنتاج والخدمات" en="Manage Production bookings and services" />
                        </p>
                    </div>
                    <Link href="/" style={{
                        background: '#FFFFFF',
                        color: '#334155',
                        padding: '8px 20px',
                        borderRadius: '30px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.9rem'
                    }}>
                        <AdminText ar="← العودة إلى الموقع" en="← Back to site" />
                    </Link>
                </div>

                {error || !stats ? (
                    <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-5 text-red-700">
                        <AdminText ar="تعذر تحميل بيانات حجوزات الإنتاج. لم تُعرض قيم بديلة." en="Production booking data could not be loaded. No fallback values are shown." />
                        <AdminRetryButton />
                    </div>
                ) : (
                    <AdminStats stats={stats} />
                )}

                <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    <Link href="/admin/dashboard" style={{
                        background: 'linear-gradient(135deg, #D4AF37, #8B5E3C)',
                        color: '#334155',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        fontWeight: 700
                    }}>
                        📊 <AdminText ar="لوحة القيادة التنفيذية" en="Executive dashboard" />
                    </Link>
                    <Link href="/admin/finance" style={{
                        background: '#FFFFFF',
                        color: '#334155',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        💼 <AdminText ar="إدارة التمويل والثقة" en="Finance and trust" />
                    </Link>
                    <Link href="/admin/operations" style={{
                        background: '#FFFFFF',
                        color: '#334155',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        🔧 <AdminText ar="العمليات" en="Operations" />
                    </Link>
                    <Link href="/admin/verification" style={{
                        background: '#FFFFFF',
                        color: '#334155',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        🛡️ <AdminText ar="التحقق والسمعة" en="Verification and reputation" />
                    </Link>
                </div>

                <div style={{
                    background: '#FFFFFF',
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
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.5rem',
                            color: '#FFFFFF'
                        }}>
                            📋 <AdminText ar="حجوزات الإنتاج" en="Production bookings" />
                        </h2>
                        <span style={{
                            color: '#8A9BB0',
                            fontSize: '0.85rem'
                        }}>
                            {stats ? <><AdminText ar="الإجمالي" en="Total" />: {stats.total}</> : <AdminText ar="غير متاح" en="Unavailable" />}
                        </span>
                    </div>

                    {!error && <BookingsTable bookings={bookings} />}
                </div>
            </div>
        </div>
    );
}
