import Link from 'next/link';
import BookingTimeline from '@/components/booking/BookingTimeline';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import PartnerAssignmentCard from '@/components/booking/PartnerAssignmentCard';
import SettlementCard from '@/components/booking/SettlementCard';
import ReviewCard from '@/components/booking/ReviewCard';
import { cancelBookingLifecycleAction, completeBookingLifecycleAction } from '@/lib/actions/operations-actions';
import type { BookingEngineRecord, BookingStatusHistoryRecord, PartnerAssignmentRecord, PartnerSettlementRecord, BookingReviewRecord } from '@/lib/supabase/types';

async function getBooking(id: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: bookingData }, { data: historyData }, { data: assignmentData }, { data: settlementData }, { data: reviewData }] = await Promise.all([
    supabase.from('bookings').select('*').eq('id', id).single(),
    supabase.from('booking_status_history').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
    supabase.from('partner_assignments').select('*').eq('booking_id', id).order('assigned_at', { ascending: true }),
    supabase.from('partner_settlements').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
    supabase.from('booking_reviews').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
  ]);

  return {
    booking: (bookingData || null) as BookingEngineRecord | null,
    history: (historyData || []) as BookingStatusHistoryRecord[],
    assignments: (assignmentData || []) as PartnerAssignmentRecord[],
    settlements: (settlementData || []) as PartnerSettlementRecord[],
    reviews: (reviewData || []) as BookingReviewRecord[],
  };
}

export default async function AdminBookingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { booking, history, assignments, settlements, reviews } = await getBooking(id);

  const resultMessages: Record<string, string> = {
    booking_completed: 'تم تحديث الحجز إلى مكتمل بنجاح.',
    booking_cancelled: 'تم تحديث الحجز إلى ملغي بنجاح.',
  };

  if (!booking) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white">الحجز غير موجود.</div>;
  }

  const resultMessage = query?.result ? resultMessages[query.result] ?? null : null;

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تفاصيل الحجز</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{booking.booking_reference}</h1>
          </div>
          <Link href="/admin/bookings" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
        </div>

        <div className="mb-6 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--color-muted)]">العميل</p>
              <p className="text-lg font-semibold text-white">{booking.customer_name || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted)]">الخدمة</p>
              <p className="text-lg font-semibold text-white">{booking.service_name || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted)]">المبلغ</p>
              <p className="text-lg font-semibold text-white">{booking.total_amount ?? 0} {booking.currency || 'SAR'}</p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>

          {resultMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{resultMessage}</div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <form action={completeBookingLifecycleAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0D1B2A]">تمييز كمكتمل</button>
            </form>
            <form action={cancelBookingLifecycleAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">إلغاء الحجز</button>
            </form>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <BookingTimeline history={history} />
            {assignments.length > 0 && assignments.map((assignment) => <PartnerAssignmentCard key={assignment.id} assignment={assignment} />)}
            {settlements.length > 0 && settlements.map((settlement) => <SettlementCard key={settlement.id} settlement={settlement} />)}
            {reviews.length > 0 && reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="text-lg font-semibold text-white">ملاحظات</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{booking.notes || 'لا توجد ملاحظات.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
