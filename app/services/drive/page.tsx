import { ServicePageContent } from '@/components/services/ServicePageContent';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export default async function DrivePage() {
  const feed = await getTravelStoriesFeed();
  return <ServicePageContent service="drive" stories={feed.items} />;
}
