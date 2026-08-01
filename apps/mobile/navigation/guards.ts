import type { RouteKey } from '@/navigation/types';
import type { SessionStatus } from '@/session/types';

const PROTECTED_ROUTES: RouteKey[] = ['myBookings', 'account'];

export function isProtectedRoute(route: RouteKey) {
  return PROTECTED_ROUTES.includes(route);
}

export function resolveRouteForSession(route: RouteKey, status: SessionStatus): RouteKey {
  if (status !== 'authenticated' && isProtectedRoute(route)) {
    return 'signIn';
  }

  return route;
}
