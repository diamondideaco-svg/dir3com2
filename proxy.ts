import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/about', '/contact', '/services', '/services/', '/dabra', '/login', '/register', '/auth/signin', '/auth/callback'];
const PUBLIC_CATEGORY_PATHS = ['/cars', '/hotels', '/experiences', '/concierge', '/offers', '/apartments', '/airport-transfers'];
const PROTECTED_PREFIXES = ['/profile', '/my-account', '/my-bookings', '/my-documents', '/my-profile', '/my-wallet', '/dashboard'];

function isPublicPath(pathname: string) {
  if (pathname === '/') return true;
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/brand/')) return true;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/services/')) {
    return true;
  }

  return PUBLIC_CATEGORY_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes('auth-token') || cookie.name.startsWith('sb-'));
}

function getDestinationPath(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = hasSupabaseSessionCookie(request);

  if (!hasSession) {
    const destination = getDestinationPath(request);
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', destination);
    redirectUrl.searchParams.set('next', destination);
    return NextResponse.redirect(redirectUrl);
  }

  if (isProtected) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
