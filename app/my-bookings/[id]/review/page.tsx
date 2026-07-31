import Link from 'next/link';
import { redirect } from 'next/navigation';
import { submitReviewAction } from '@/lib/actions/booking-actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookingEngineRecord } from '@/lib/supabase/types';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getBooking(id: string, userId: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('profile_id', userId)
    .single();

  return (data || null) as BookingEngineRecord | null;
}

export default async function BookingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget(`/my-bookings/${id}/review`));
  }

  const booking = await getBooking(id, user.id);

  if (!booking) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white">الحجز غير موجود.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-white/10 bg-white/5 p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تقييم الحجز</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{booking.booking_reference}</h1>
        </div>
        <form action={submitReviewAction} className="space-y-4">
          <input type="hidden" name="bookingId" value={booking.id} />
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">العنوان</span>
            <input name="title" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
          </label>
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">التقييم (١-٥)</span>
            <input type="number" min="1" max="5" name="rating" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
          </label>
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">التعليق</span>
            <textarea name="comment" rows={5} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#0D1B2A]">حفظ التقييم</button>
            <Link href="/my-bookings" className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200">إلغاء</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
