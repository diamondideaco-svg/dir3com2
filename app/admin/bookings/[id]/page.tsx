import Link from 'next/link';
import { notFound } from 'next/navigation';
import BookingTimeline from '@/components/booking/BookingTimeline';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import PartnerAssignmentCard from '@/components/booking/PartnerAssignmentCard';
import SettlementCard from '@/components/booking/SettlementCard';
import ReviewCard from '@/components/booking/ReviewCard';
import { AdminCurrency, AdminText, AdminUnavailableControl } from '@/components/admin/AdminLocale';
import { isProductionBooking } from '@/lib/integration/executive-dashboard-contract';
import type { BookingEngineRecord, BookingStatusHistoryRecord, PartnerAssignmentRecord, PartnerSettlementRecord, BookingReviewRecord } from '@/lib/supabase/types';
import { attachAuthoritativeCustomerName } from '@/lib/admin/booking-customer';

async function getBooking(id: string) {
  const { supabase } = await requireAdminPageDataAccess(`/admin/bookings/${id}`);
  const { data: bookingData, error: bookingError } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
  if (bookingError) return { booking: null, error: true, missing: false, history: [], assignments: [], settlements: [], reviews: [] };
  const rawBooking = (bookingData || null) as BookingEngineRecord | null;
  if (!rawBooking || !isProductionBooking(rawBooking)) return { booking: null, error: false, missing: true, history: [], assignments: [], settlements: [], reviews: [] };
  const profileNames = new Map<string, string>();
  if (rawBooking.user_id) {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name').eq('id', rawBooking.user_id).maybeSingle();
    if (profileError) return { booking: null, error: true, missing: false, history: [], assignments: [], settlements: [], reviews: [] };
    if (profile) profileNames.set(profile.id, profile.full_name);
  }
  const booking = attachAuthoritativeCustomerName(rawBooking, profileNames);

  const [historyRes, assignmentRes, settlementRes, reviewRes] = await Promise.all([
    supabase.from('booking_status_history').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
    supabase.from('partner_assignments').select('*').eq('booking_id', id).order('assigned_at', { ascending: true }),
    supabase.from('partner_settlements').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
    supabase.from('booking_reviews').select('*').eq('booking_id', id).order('created_at', { ascending: true }),
  ]);
  if (historyRes.error || assignmentRes.error || settlementRes.error || reviewRes.error) return { booking, error: true, missing: false, history: [], assignments: [], settlements: [], reviews: [] };

  return {
    booking,
    error: false,
    missing: false,
    history: (historyRes.data || []) as BookingStatusHistoryRecord[],
    assignments: (assignmentRes.data || []) as PartnerAssignmentRecord[],
    settlements: (settlementRes.data || []) as PartnerSettlementRecord[],
    reviews: (reviewRes.data || []) as BookingReviewRecord[],
  };
}

export default async function AdminBookingDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ result?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const { booking, error, missing, history, assignments, settlements, reviews } = await getBooking(id);
  const transitionSucceeded = query.result === 'booking_completed' || query.result === 'booking_cancelled';
  if (missing) notFound();
  if (!booking || error) return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white"><AdminText ar="تعذر تحميل تفاصيل حجز الإنتاج. لم تُعرض بيانات بديلة." en="Production booking details could not be loaded. No fallback data is shown." /></div>;

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="تفاصيل حجز الإنتاج" en="Production booking details" /></p><h1 className="mt-2 text-3xl font-semibold text-white">{booking.booking_reference}</h1></div>
          <Link href="/admin/bookings" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>
        <div className="mb-6 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm text-[var(--color-muted)]"><AdminText ar="العميل" en="Customer" /></p><p className="text-lg font-semibold text-white">{booking.customer_name || '—'}</p></div>
            <div><p className="text-sm text-[var(--color-muted)]"><AdminText ar="الخدمة" en="Service" /></p><p className="text-lg font-semibold text-white">{booking.product_name || '—'}</p></div>
            <div><p className="text-sm text-[var(--color-muted)]"><AdminText ar="المبلغ" en="Amount" /></p><p className="text-lg font-semibold text-white"><AdminCurrency value={Number(booking.total_amount ?? booking.total_price ?? 0)} currency={booking.currency || 'SAR'} /></p></div>
            <BookingStatusBadge status={booking.status} />
          </div>
          {transitionSucceeded ? <div className="mt-4 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><AdminText ar="تم تحديث حالة الحجز بنجاح." en="The booking status was updated successfully." /></div> : null}
          {query.error ? <div className="mt-4 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"><AdminText ar="تعذر تحديث الحالة بأمان. حدّث الصفحة وحاول مرة أخرى." en="The status could not be updated safely. Refresh and try again." /></div> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <AdminUnavailableControl ar="تمييز كمكتمل" en="Mark completed" reasonAr="غير متاح حتى تُنفَّذ عملية خادم ذرّية تربط تغيير الحالة بسجل التدقيق." reasonEn="Unavailable until an atomic server workflow binds the state change to its audit record." className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0D1B2A]" />
            <AdminUnavailableControl ar="إلغاء الحجز" en="Cancel booking" reasonAr="غير متاح حتى تُنفَّذ عملية خادم ذرّية تربط تغيير الحالة بسجل التدقيق." reasonEn="Unavailable until an atomic server workflow binds the state change to its audit record." className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6"><BookingTimeline history={history} />{assignments.map((assignment) => <PartnerAssignmentCard key={assignment.id} assignment={assignment} />)}{settlements.map((settlement) => <SettlementCard key={settlement.id} settlement={settlement} />)}{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div>
          <div className="space-y-6"><div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6"><h2 className="text-lg font-semibold text-white"><AdminText ar="ملاحظات" en="Notes" /></h2><p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{booking.notes || <AdminText ar="لا توجد ملاحظات." en="No notes." />}</p></div></div>
        </div>
      </div>
    </div>
  );
}
