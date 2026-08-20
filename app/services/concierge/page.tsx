import { ServicePageContent } from '@/components/services/ServicePageContent';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export default async function ConciergePage() {
  const feed = await getTravelStoriesFeed();
  return <ServicePageContent service="concierge" stories={feed.items} />;
}
