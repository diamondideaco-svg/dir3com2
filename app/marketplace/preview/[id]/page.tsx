import RealMarketplacePreviewDetail from '@/components/public/RealMarketplacePreviewDetail';
import { getRealPreviewOffer } from '@/lib/marketplace/real-preview';

export const dynamic = 'force-dynamic';

export default async function RealMarketplacePreviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await getRealPreviewOffer(id);
  return <RealMarketplacePreviewDetail offer={offer} />;
}
