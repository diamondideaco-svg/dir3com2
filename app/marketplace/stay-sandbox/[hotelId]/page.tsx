import { notFound } from 'next/navigation';
import StaySandbox from '@/components/stay/StaySandbox';
import { stayDemoEnabled } from '@/lib/marketplace/stay-demo-mode';
import { serializePageQuery } from '@/lib/marketplace/search-context';
import { nationalityOptions } from '@/lib/marketplace/discovery';

export const metadata = { robots: { index: false, follow: false } };
export default async function StaySandboxDetail({ params, searchParams }: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hotelId } = await params;
  if (!stayDemoEnabled() || !/^[A-Za-z0-9_-]{1,100}$/.test(hotelId)) notFound();
  return <StaySandbox hotelId={hotelId} initialSearch={serializePageQuery(await searchParams)} nationalities={{ ar: nationalityOptions('ar'), en: nationalityOptions('en') }}/>;
}
