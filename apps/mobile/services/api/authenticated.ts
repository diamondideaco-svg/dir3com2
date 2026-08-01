import { createApiClient } from '@/services/api/client';

type AccessTokenGetter = () => Promise<string | null> | string | null;

export function createSessionApiClient(getAccessToken: AccessTokenGetter) {
  return createApiClient({
    getAuthToken: getAccessToken,
  });
}
