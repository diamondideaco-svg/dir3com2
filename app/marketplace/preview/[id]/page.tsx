import RealMarketplacePreviewDetail from '@/components/public/RealMarketplacePreviewDetail';
import { getRealPreviewOffer } from '@/lib/marketplace/real-preview';

export const dynamic = 'force-dynamic';

export default async function RealMarketplacePreviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const offer = await getRealPreviewOffer(id, {
    city: typeof query.city === 'string' ? query.city : undefined,
    checkIn: typeof query.checkIn === 'string' ? query.checkIn : undefined,
    checkOut: typeof query.checkOut === 'string' ? query.checkOut : undefined,
  });
  return <RealMarketplacePreviewDetail offer={offer} />;
}
