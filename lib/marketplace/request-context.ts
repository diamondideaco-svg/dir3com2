import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';

type AuthenticationResolver = typeof createSupabaseRequestClient;

export async function resolveMarketplaceRequestContext(
  request: NextRequest,
  resolveAuthentication: AuthenticationResolver = createSupabaseRequestClient,
) {
  let userId: string | null = null;
  try {
    userId = (await resolveAuthentication(request))?.user.id ?? null;
  } catch {
    userId = null;
  }

  return {
    anonymous: !userId,
    clientKey: userId ? `authenticated:${userId}` : 'anonymous',
  };
}
