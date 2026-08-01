import { createApiClient } from '@/services/api/client';
import { adaptMyAccountResponse, adaptMyBookingsResponse, type MyAccountResponse, type MyBookingsResponse } from '@/services/api/contracts';
import type { MobileApiResult } from '@/types/result';

type AccessTokenGetter = () => Promise<string | null> | string | null;

export function createSessionApiClient(getAccessToken: AccessTokenGetter) {
  return createApiClient({
    getAuthToken: getAccessToken,
  });
}

export async function fetchMyBookings(getAccessToken: AccessTokenGetter, signal?: AbortSignal): Promise<MobileApiResult<MyBookingsResponse>> {
  const result = await createSessionApiClient(getAccessToken).get<unknown>('/api/bookings', { signal });

  if (!result.ok) {
    return result;
  }

  return adaptMyBookingsResponse(result.data);
}

export async function fetchMyAccount(getAccessToken: AccessTokenGetter, signal?: AbortSignal): Promise<MobileApiResult<MyAccountResponse>> {
  const result = await createSessionApiClient(getAccessToken).get<unknown>('/api/account', { signal });

  if (!result.ok) {
    return result;
  }

  return adaptMyAccountResponse(result.data);
}
