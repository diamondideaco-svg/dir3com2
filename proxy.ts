import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/about', '/contact', '/services', '/services/', '/login', '/register', '/auth/signin', '/auth/callback'];
const PUBLIC_CATEGORY_PATHS = ['/cars', '/hotels', '/experiences', '/concierge', '/offers', '/apartments', '/airport-transfers'];
const PROTECTED_PREFIXES = ['/admin', '/my-account', '/my-bookings', '/my-documents', '/my-profile', '/my-wallet'];

function isPublicPath(pathname: string) {
  if (pathname === '/') return true;
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) return true;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/services/')) {
    return true;
  }

  return PUBLIC_CATEGORY_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getDestinationPath(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isProtected) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const destination = getDestinationPath(request);
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', destination);
    redirectUrl.searchParams.set('next', destination);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
