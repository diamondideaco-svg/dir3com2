import Link from 'next/link';
import { redirect } from 'next/navigation';
import BookingTimeline from '@/components/booking/BookingTimeline';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import PartnerAssignmentCard from '@/components/booking/PartnerAssignmentCard';
import SettlementCard from '@/components/booking/SettlementCard';
import ReviewCard from '@/components/booking/ReviewCard';
import type { BookingEngineRecord, BookingStatusHistoryRecord, PartnerAssignmentRecord, PartnerSettlementRecord, BookingReviewRecord } from '@/lib/supabase/types';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getBooking(id: string, userId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: bookingData } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!bookingData) {
    return {
      booking: null,
      history: [] as BookingStatusHistoryRecord[],
      assignments: [] as PartnerAssignmentRecord[],
      settlements: [] as PartnerSettlementRecord[],
      reviews: [] as BookingReviewRecord[],
    };
  }

  const [{ data: historyData }, { data: assignmentData }, { data: settlementData }, { data: reviewData }] = await Promise.all([
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

export default async function MyBookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget(`/my-bookings/${id}`));
  }

  const { booking, history, assignments, settlements, reviews } = await getBooking(id, user.id);

  if (!booking) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white">الحجز غير موجود.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تفاصيل الحجز</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{booking.booking_reference}</h1>
          </div>
          <Link href="/my-bookings" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        <div className="mb-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">الخدمة</p>
              <p className="text-lg font-semibold text-white">{booking.service_name || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">المبلغ</p>
              <p className="text-lg font-semibold text-white">{booking.total_amount ?? 0} {booking.currency || 'SAR'}</p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <BookingTimeline history={history} />
            {assignments.length > 0 && assignments.map((assignment) => <PartnerAssignmentCard key={assignment.id} assignment={assignment} />)}
            {settlements.length > 0 && settlements.map((settlement) => <SettlementCard key={settlement.id} settlement={settlement} />)}
            {reviews.length > 0 && reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">ملاحظات</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{booking.notes || 'لا توجد ملاحظات.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
