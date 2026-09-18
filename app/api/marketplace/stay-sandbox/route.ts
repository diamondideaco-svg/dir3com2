import { stayDemoEnabled } from '@/lib/marketplace/stay-demo-mode';
import { parseStayDemoQuery } from '@/lib/marketplace/stay-demo';
import { searchStayDemo } from '@/lib/marketplace/stay-demo-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!stayDemoEnabled()) return Response.json({ status: 'disabled', cards: [] }, { status: 403, headers });
  const query = parseStayDemoQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ status: 'invalid_search', cards: [] }, { status: 400, headers });
  const result = await searchStayDemo(query);
  return Response.json(result, { status: result.status === 'rate_limited' ? 429 : result.status === 'unavailable' ? 503 : 200,
    headers: { ...headers, ...(result.status === 'rate_limited' ? { 'Retry-After': '2' } : {}) } });
}
