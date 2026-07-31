import Link from 'next/link';
import { redirect } from 'next/navigation';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookingEngineRecord } from '@/lib/supabase/types';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getCustomerBookings() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-bookings'));
  }

  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as BookingEngineRecord[];
}

function getBookingServiceName(booking: BookingEngineRecord) {
  const value = booking.service_name ?? (booking as BookingEngineRecord & { product_name?: string | null }).product_name;
  return value || '—';
}

function getBookingAmount(booking: BookingEngineRecord) {
  const value = booking.total_amount ?? booking.total_price;
  return value ?? 0;
}

export default async function MyBookingsPage() {
  const bookings = await getCustomerBookings();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">حجوزاتي</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Shield Booking Engine</h1>
        </div>

        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">المرجع</p>
                  <p className="text-lg font-semibold text-white">{booking.booking_reference}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">الخدمة</p>
                  <p className="text-lg font-semibold text-white">{getBookingServiceName(booking)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">المبلغ</p>
                  <p className="text-lg font-semibold text-white">{getBookingAmount(booking)} {booking.currency || 'SAR'}</p>
                </div>
                <BookingStatusBadge status={booking.status} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/my-bookings/${booking.id}`} className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0D1B2A]">عرض التفاصيل</Link>
                <Link href={`/my-bookings/${booking.id}/review`} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">تقييم الحجز</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
