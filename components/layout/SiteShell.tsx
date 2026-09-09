'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Chrome } from '@/components/v6/Chrome';
import { useCustomerReviewLayout } from '@/components/v6/ProfileDesktopFrame';
import { SupportDesktopShell } from '@/components/v6/SupportDesktopShell';
import requestStyles from '@/components/v6/request-detail-desktop.module.css';
import { HomeChrome } from '@/components/home/HomeChrome';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

const hiddenPathPrefixes = ['/admin'];
const hiddenExactPaths = ['/auth/callback'];

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') return <HomeChrome>{children}</HomeChrome>;
  if (pathname === '/support') return <SupportSiteShell>{children}</SupportSiteShell>;
  if (/^\/my-requests\/[^/]+$/.test(pathname)) return <RequestDetailSiteShell pathname={pathname}>{children}</RequestDetailSiteShell>;
  if (pathname === '/my-profile') return <ProfileSiteShell>{children}</ProfileSiteShell>;
  // Register owns its v6 shell. Other route chrome is unchanged.
  if (pathname === '/register') return <>{children}</>;
  if (pathname === '/auth/forgot-password' || pathname === '/auth/reset-password') return <>{children}</>;
  if (['/auth/verify-email', '/login-success', '/my-account', '/my-bookings', '/my-wallet', '/my-documents', '/favorites'].includes(pathname)) return <>{children}</>;
  if (pathname === '/login') return <Chrome>{children}</Chrome>;
  const hideChrome = hiddenExactPaths.includes(pathname) || hiddenPathPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (hideChrome) {
    return <>{children}</>;
  }

  return <PublicSiteChrome pathname={pathname}>{children}</PublicSiteChrome>;
}

// Phone and desktop reuse approved chrome; leave the tablet branch unchanged.
function ProfileSiteShell({ children }: { children: ReactNode }) {
  const desktop = useCustomerReviewLayout();
  return desktop ? <>{children}</> : <PublicSiteChrome pathname="/my-profile">{children}</PublicSiteChrome>;
}

// Presentation only: reuse the same shell on phones, without new destinations.
function SupportSiteShell({ children }: { children: ReactNode }) {
  const desktop = useCustomerReviewLayout();
  return desktop ? <SupportDesktopShell>{children}</SupportDesktopShell> : <PublicSiteChrome pathname="/support">{children}</PublicSiteChrome>;
}

// Presentation only: the request route retains all existing server-side guards.
// Reuse the locked header/footer/launcher composition without changing Support.
function RequestDetailSiteShell({ children, pathname }: { children: ReactNode; pathname: string }) {
  const desktop = useCustomerReviewLayout();
  return desktop ? <div className={requestStyles.desktop}><SupportDesktopShell>{children}</SupportDesktopShell></div> : <PublicSiteChrome pathname={pathname}>{children}</PublicSiteChrome>;
}

function PublicSiteChrome({ children, pathname }: { children: ReactNode; pathname: string }) {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <Header />
      <main>{children}</main>
      <Footer />
      {pathname !== '/dabra' && <FloatingDibrah />}
    </div>
  );
}
