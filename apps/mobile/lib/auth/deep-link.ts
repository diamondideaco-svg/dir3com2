import { normalizeBookingIdentifier } from '@/lib/bookings';
import type { RouteDestination, RouteKey } from '@/navigation/types';

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

function toStaticRoute(key: Exclude<RouteKey, 'bookingDetail'>): RouteDestination {
  return { key };
}

function readRouteFromPath(pathname: string): RouteDestination | null {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (normalized === AUTH_CALLBACK_PATH) {
    return toStaticRoute('signIn');
  }

  if ((segments[0] === 'bookings' || segments[0] === 'my-bookings') && segments.length === 1) {
    return toStaticRoute('myBookings');
  }

  if ((segments[0] === 'bookings' || segments[0] === 'my-bookings') && segments.length === 2) {
    const bookingId = normalizeBookingIdentifier(segments[1]);
    return bookingId ? { key: 'bookingDetail', bookingId } : null;
  }

  if (segments.length > 1) {
    return null;
  }

  const staticRoute = DEEP_LINK_ROUTE_MAP[segments[0]];
  return staticRoute ? toStaticRoute(staticRoute as Exclude<RouteKey, 'bookingDetail'>) : null;
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
    const route = isAuthCallback ? readRouteFromParams(params) ?? toStaticRoute('signIn') : readRouteFromPath(pathname);

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
