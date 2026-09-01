import Link from 'next/link';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import type { BookingEngineRecord } from '@/lib/supabase/types';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';
import { isProductionBooking } from '@/lib/integration/executive-dashboard-contract';

async function getBookings() {
  const { supabase } = await requireAdminPageDataAccess('/admin/bookings');

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('synthetic', false)
    .eq('environment', 'production')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    return { bookings: [] as BookingEngineRecord[], error: true };
  }
  return {
    bookings: ((data || []) as BookingEngineRecord[]).filter(isProductionBooking),
    error: false,
  };
}

export default async function AdminBookingsPage() {
  const { bookings, error } = await getBookings();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="لوحة الإدارة" en="Admin platform" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="محرك حجوزات الإنتاج" en="Production booking engine" /></h1>
          </div>
          <Link href="/admin" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة إلى لوحة التحكم" en="Back to dashboard" /></Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 p-5 text-sm text-red-700">
            <AdminText ar="تعذر تحميل حجوزات الإنتاج. لم تُعرض حالة فارغة بديلة." en="Production bookings could not be loaded. No fallback empty state is shown." />
            <AdminRetryButton />
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[color:var(--color-border)] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#334155]"><AdminText ar="إدارة حجوزات الإنتاج" en="Manage Production bookings" /></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-start">
              <thead className="bg-white text-sm text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-3"><AdminText ar="المرجع" en="Reference" /></th>
                  <th className="px-5 py-3"><AdminText ar="العميل" en="Customer" /></th>
                  <th className="px-5 py-3"><AdminText ar="الخدمة" en="Service" /></th>
                  <th className="px-5 py-3"><AdminText ar="الحالة" en="Status" /></th>
                  <th className="px-5 py-3"><AdminText ar="الإجراء" en="Action" /></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                    <td className="px-5 py-4">{booking.booking_reference}</td>
                    <td className="px-5 py-4">{booking.customer_name || '—'}</td>
                    <td className="px-5 py-4">{booking.service_name || '—'}</td>
                    <td className="px-5 py-4"><BookingStatusBadge status={booking.status} /></td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/bookings/${booking.id}`} className="text-[#D4AF37] hover:underline"><AdminText ar="تفاصيل" en="Details" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
