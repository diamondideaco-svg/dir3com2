import { ServicePageContent } from '@/components/services/ServicePageContent';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export default async function StayPage() {
  const feed = await getTravelStoriesFeed();
  return <ServicePageContent service="stay" stories={feed.items} />;
}
