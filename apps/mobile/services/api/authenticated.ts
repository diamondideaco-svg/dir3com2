import { createApiClient } from '@/services/api/client';
import { normalizeBookingIdentifier } from '@/lib/bookings';
import { adaptBookingDetailResponse, adaptMyAccountResponse, adaptMyBookingsResponse, type BookingDetailResponse, type MyAccountResponse, type MyBookingsResponse } from '@/services/api/contracts';
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

export async function fetchBookingDetail(getAccessToken: AccessTokenGetter, bookingId: string, signal?: AbortSignal): Promise<MobileApiResult<BookingDetailResponse>> {
  const normalizedBookingId = normalizeBookingIdentifier(bookingId);

  if (!normalizedBookingId) {
    return {
      ok: false,
      error: {
        code: 'http_error',
        message: 'This booking is unavailable.',
        status: 400,
      },
    };
  }

  const result = await createSessionApiClient(getAccessToken).get<unknown>(`/api/bookings/${normalizedBookingId}`, { signal });

  if (!result.ok) {
    if (result.error.status === 400 || result.error.status === 404) {
      return {
        ok: false,
        error: {
          ...result.error,
          message: 'This booking is unavailable.',
        },
      };
    }

    return result;
  }

  return adaptBookingDetailResponse(result.data);
}
