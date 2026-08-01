import type { RouteDestination, RouteKey } from '@/navigation/types';
import type { SessionStatus } from '@/session/types';

const PROTECTED_ROUTES: RouteKey[] = ['myBookings', 'account', 'bookingDetail'];

function getRouteKey(route: RouteDestination | RouteKey) {
  return typeof route === 'string' ? route : route.key;
}

export function isProtectedRoute(route: RouteDestination | RouteKey) {
  return PROTECTED_ROUTES.includes(getRouteKey(route));
}

export function resolveRouteForSession(route: RouteDestination, status: SessionStatus): RouteDestination {
  if (status !== 'authenticated' && isProtectedRoute(route)) {
    return { key: 'signIn' };
  }

  return route;
}
