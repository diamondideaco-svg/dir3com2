import type { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createSupabaseRequestClient } from '@/lib/supabase/server';

type AuthenticationResolver = typeof createSupabaseRequestClient;

function anonymousClientKey(request: NextRequest) {
  const platformAddress = process.env.VERCEL === '1'
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim().slice(0, 64)
    : null;
  if (!platformAddress) return 'anonymous';
  const digest = createHash('sha256').update(platformAddress).digest('hex').slice(0, 24);
  return `anonymous:${digest}`;
}

export async function resolveMarketplaceRequestContext(request: NextRequest, resolveAuthentication: AuthenticationResolver = createSupabaseRequestClient) {
  let userId: string | null = null;
  try {
    userId = (await resolveAuthentication(request))?.user.id ?? null;
  } catch {
    userId = null;
  }
  return { anonymous: !userId, clientKey: userId ? `authenticated:${userId}` : anonymousClientKey(request) };
}
