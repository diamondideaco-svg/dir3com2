import { NextResponse } from 'next/server';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';

export const revalidate = 86_400;

export async function GET() {
  const feed = await getTravelStoriesFeed();
  return NextResponse.json(feed, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
  });
}
