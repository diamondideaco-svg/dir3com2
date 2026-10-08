import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isMarketplaceRequestReference } from '@/lib/marketplace/customer-requests';
import { DRIVE_REQUEST_FIELDS, type DriveRequestRecord } from '@/lib/drive/record';
import { isAppLanguage } from '@/lib/i18n/config';
import DriveRequestReview from '@/components/drive/DriveRequestReview';

export default async function DriveRequestPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ language?: string | string[] }> }) {
  const { reference } = await params;
  if (!isMarketplaceRequestReference(reference)) notFound();
  const { language } = await searchParams;
  const notificationLanguage = isAppLanguage(language) ? language : undefined;
  const destination = `/my-requests/${reference}/drive${notificationLanguage ? `?language=${notificationLanguage}` : ''}`;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  // Explicit owner predicate in addition to RLS: Operations must use its own queue.
  const { data, error } = await supabase.from('marketplace_requests').select(DRIVE_REQUEST_FIELDS)
    .eq('request_reference', reference).eq('user_id', user.id).maybeSingle();
  if (error) throw new Error('Unable to load Drive request.');
  if (!data) notFound();
  return <DriveRequestReview request={data as unknown as DriveRequestRecord} notificationLanguage={notificationLanguage} />;
}
