import './globals.css';
import type { Metadata } from 'next';
import { Alexandria, Cormorant_Garamond } from 'next/font/google';
import SiteShell from '@/components/layout/SiteShell';

const arabicFont = Alexandria({
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dir3com.com'),
  title: {
    default: 'dir3com | منصة رحلات وخدمات فاخرة',
    template: '%s | dir3com',
  },
  description: 'واجهة dir3com العربية الفاخرة للسفر والخدمات، مبنية RTL أولاً ومجهزة لتكاملات الدِّبرة مستقبلاً دون المساس بالمصادقة الحالية.',
  keywords: ['dir3com', 'رحلات', 'خدمات فاخرة', 'حجوزات', 'العروض', 'الدِّبرة'],
  alternates: {
    canonical: 'https://dir3com.com',
  },
  openGraph: {
    title: 'dir3com | منصة رحلات وخدمات فاخرة',
    description: 'واجهة dir3com للحجوزات والخدمات المميزة مع هوية عربية راقية.',
    type: 'website',
    locale: 'ar_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dir3com | منصة رحلات وخدمات فاخرة',
    description: 'رحلتكم... محمية بضمان الدرع.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${arabicFont.variable} ${displayFont.variable} antialiased`}>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
