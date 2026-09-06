'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

const hiddenPathPrefixes = ['/admin'];
const hiddenExactPaths = ['/auth/callback'];

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Register owns its v6 shell. Other route chrome is unchanged.
  if (pathname === '/register') return <>{children}</>;
  if (['/auth/verify-email', '/login-success', '/my-account', '/my-bookings', '/my-wallet', '/my-documents', '/favorites'].includes(pathname)) return <>{children}</>;
  const hideChrome = hiddenExactPaths.includes(pathname) || hiddenPathPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <Header />
      <main>{children}</main>
      <Footer />
      {pathname !== '/dabra' && <FloatingDibrah />}
    </div>
  );
}
