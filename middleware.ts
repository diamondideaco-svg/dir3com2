import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/about', '/contact', '/services', '/services/', '/login', '/register', '/auth/signin', '/auth/callback'];
const ADMIN_PREFIX = '/admin';
const PROTECTED_PREFIXES = ['/my-account', '/my-bookings', '/my-documents', '/my-profile', '/my-wallet'];

function isPublicPath(pathname: string) {
  if (pathname === '/') return true;
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) return true;
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/services/');
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes('auth-token') || cookie.name.startsWith('sb-'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname.startsWith(ADMIN_PREFIX);
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = hasSupabaseSessionCookie(request);

  if (!hasSession) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAdmin) {
    const roleCookie = request.cookies.get('role');
    const isAdminRole = roleCookie?.value === 'admin' || roleCookie?.value === 'super_admin';
    if (!isAdminRole) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isProtected) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
