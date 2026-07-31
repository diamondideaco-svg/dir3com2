'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeMessage, sanitizeNumber, sanitizeText } from '@/lib/security/validation';

export async function submitReviewAction(formData: FormData) {
  const bookingId = sanitizeText(formData.get('bookingId')?.toString(), '');
  const title = sanitizeText(formData.get('title')?.toString(), '').slice(0, 120);
  const rating = sanitizeNumber(formData.get('rating'), 0);
  const comment = sanitizeMessage(formData.get('comment')?.toString(), '');

  if (!bookingId || rating < 1 || rating > 5) return;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (!booking) return;

  await supabase.from('booking_reviews').insert({ booking_id: bookingId, customer_id: user.id, rating: Math.round(rating), title, comment });
  revalidatePath('/my-bookings');
}
