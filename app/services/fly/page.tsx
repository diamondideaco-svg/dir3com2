import { ServicePageContent } from '@/components/services/ServicePageContent';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export default async function FlyPage() {
  const feed = await getTravelStoriesFeed();
  return <ServicePageContent service="fly" stories={feed.items} />;
}
