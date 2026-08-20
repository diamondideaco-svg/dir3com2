import { ServicePageContent } from '@/components/services/ServicePageContent';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export default async function VipPage() {
  const feed = await getTravelStoriesFeed();
  return <ServicePageContent service="vip" stories={feed.items} />;
}
