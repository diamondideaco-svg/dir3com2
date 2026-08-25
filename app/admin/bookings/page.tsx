import Link from 'next/link';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookingEngineRecord } from '@/lib/supabase/types';

async function getBookings() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    return [] as BookingEngineRecord[];
  }
  return (data || []) as BookingEngineRecord[];
}

export default async function AdminBookingsPage() {
  const bookings = await getBookings();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">لوحة الإدارة</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]">Shield Booking Engine</h1>
          </div>
          <Link href="/admin" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة إلى لوحة التحكم</Link>
        </div>

        <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[color:var(--color-border)] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#334155]">إدارة الحجوزات</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right">
              <thead className="bg-white text-sm text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-3">المرجع</th>
                  <th className="px-5 py-3">العميل</th>
                  <th className="px-5 py-3">الخدمة</th>
                  <th className="px-5 py-3">الحالة</th>
                  <th className="px-5 py-3">الإجراء</th>
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
                      <Link href={`/admin/bookings/${booking.id}`} className="text-[#D4AF37] hover:underline">تفاصيل</Link>
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
