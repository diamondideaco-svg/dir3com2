'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import FloatingDibrah from '@/components/layout/FloatingDibrah';
import UtilityBar from '@/components/layout/UtilityBar';

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