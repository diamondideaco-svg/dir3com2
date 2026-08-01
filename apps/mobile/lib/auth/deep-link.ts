import type { RouteKey } from '@/navigation/types';

const APP_SCHEME = 'dir3com://';
const AUTH_CALLBACK_PATH = 'auth/callback';

const DEEP_LINK_ROUTE_MAP: Record<string, RouteKey> = {
  account: 'account',
  marketplace: 'marketplace',
  'my-bookings': 'myBookings',
  bookings: 'myBookings',
  signin: 'signIn',
  'sign-in': 'signIn',
  login: 'signIn',
};

function normalizePathname(pathname: string) {
  return pathname.replace(/^\/+/, '').trim().toLowerCase();
}

function readRouteFromPath(pathname: string): RouteKey | null {
  const normalized = normalizePathname(pathname);
  if (!normalized) {
    return null;
  }

  if (normalized === AUTH_CALLBACK_PATH) {
    return 'signIn';
  }

  return DEEP_LINK_ROUTE_MAP[normalized] ?? null;
}

function readRouteFromParams(params: Record<string, string>) {
  return readRouteFromPath(params.next ?? params.redirect ?? params.redirectto ?? params.returnto ?? '');
}

export function getAuthCallbackUrl() {
  return `${APP_SCHEME}${AUTH_CALLBACK_PATH}`;
}

export function parseAuthCallbackUrl(url: string) {
  try {
    if (!url.startsWith(APP_SCHEME)) {
      return {
        isSupported: false,
        isAuthCallback: false,
        pathname: '',
        params: {},
        route: null,
      };
    }

    const normalized = url.replace(APP_SCHEME, '');
    const [pathnamePart, queryPart] = normalized.split('?');
    const pathname = normalizePathname(pathnamePart);
    const params: Record<string, string> = {};

    if (queryPart) {
      queryPart.split('&').forEach((segment) => {
        const [key, rawValue] = segment.split('=');
        if (key) {
          params[decodeURIComponent(key)] = decodeURIComponent(rawValue ?? '');
        }
      });
    }

    const isAuthCallback = pathname === AUTH_CALLBACK_PATH;
    const route = isAuthCallback ? readRouteFromParams(params) ?? 'signIn' : readRouteFromPath(pathname);

    return {
      isSupported: isAuthCallback || route !== null,
      isAuthCallback,
      pathname,
      params,
      route,
    };
  } catch {
    return {
      isSupported: false,
      isAuthCallback: false,
      pathname: '',
      params: {},
      route: null,
    };
  }
}
