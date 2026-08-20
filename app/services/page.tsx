import PlatformFoundationHome from '@/components/home/PlatformFoundationHome';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export const revalidate = 86400;

export default async function ServicesPage() {
  const feed = await getTravelStoriesFeed();
  return <PlatformFoundationHome stories={feed.items} useStandardServiceImages />;
}
