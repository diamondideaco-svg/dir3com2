import { NextResponse } from 'next/server';
import { normalizeMarketplaceSearchRequest, runMarketplaceAISearch } from '@/lib/ai';
import { getMarketplaceSnapshot } from '@/lib/marketplace/server';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const snapshot = await getMarketplaceSnapshot();

    const normalizedRequest = normalizeMarketplaceSearchRequest({
      query: typeof body.query === 'string' ? body.query : '',
      destination: typeof body.destination === 'string' ? body.destination : 'all',
      serviceType: typeof body.serviceType === 'string' ? body.serviceType : 'all',
      dates: {
        checkIn: typeof body.checkIn === 'string' ? body.checkIn : undefined,
        checkOut: typeof body.checkOut === 'string' ? body.checkOut : undefined,
      },
      travelers: typeof body.travelers === 'string' ? body.travelers : 'all',
      budget: typeof body.budget === 'string' ? body.budget : 'all',
      language: body.language === 'en' || body.language === 'mixed' ? body.language : 'ar',
      userIntent: typeof body.userIntent === 'string' ? body.userIntent : typeof body.query === 'string' ? body.query : '',
      family: typeof body.family === 'string' ? (body.family as never) : undefined,
      collection: typeof body.collection === 'string' ? (body.collection as never) : 'all',
      sort: typeof body.sort === 'string' ? (body.sort as never) : 'recommended',
      availability: typeof body.availability === 'string' ? (body.availability as never) : 'all',
      page: typeof body.page === 'number' ? body.page : Number(body.page ?? 1),
      pageSize: typeof body.pageSize === 'number' ? body.pageSize : Number(body.pageSize ?? 9),
    });

    const payload = await runMarketplaceAISearch({
      request: normalizedRequest,
      services: snapshot.services,
      source: snapshot.source,
      hasRealData: snapshot.hasRealData,
      generatedAt: snapshot.generatedAt,
    });

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
