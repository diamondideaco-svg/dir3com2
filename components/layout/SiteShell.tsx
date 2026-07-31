'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import UtilityBar from '@/components/layout/UtilityBar';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

const hiddenPathPrefixes = ['/admin'];
const hiddenExactPaths = ['/auth/callback'];

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = hiddenExactPaths.includes(pathname) || hiddenPathPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <UtilityBar />
      <Header />
      <main>{children}</main>
      <Footer />
      <FloatingDibrah />
    </div>
  );
}