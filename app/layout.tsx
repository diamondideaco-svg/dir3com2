import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import SiteShell from '@/components/layout/SiteShell';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE_NAME, languageDirection, normalizeLanguage } from '@/lib/i18n/config';

export const metadata: Metadata = {
  metadataBase: new URL('https://dir3com.com'),
  title: {
    default: 'dir3com | درعكم الحامي للسياحة.',
    template: '%s | dir3com',
  },
  description: 'واجهة dir3com العربية الفاخرة للسفر والخدمات، مبنية RTL أولاً ومجهزة لتكاملات الدبرة مستقبلاً دون المساس بالمصادقة الحالية.',
  keywords: ['dir3com', 'رحلات', 'خدمات فاخرة', 'حجوزات', 'العروض', 'الدبرة'],
  alternates: {
    canonical: 'https://dir3com.com',
  },
  openGraph: {
    title: 'dir3com | درعكم الحامي للسياحة.',
    description: 'واجهة dir3com للحجوزات والخدمات المميزة مع هوية عربية راقية.',
    type: 'website',
    locale: 'ar_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dir3com | درعكم الحامي للسياحة.',
    description: 'رحلتكم... محمية بضمان الدرع.',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialLanguage = normalizeLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value ?? DEFAULT_LANGUAGE);

  return (
    <html lang={initialLanguage} dir={languageDirection(initialLanguage)} suppressHydrationWarning>
      <body className="antialiased">
        <LanguageProvider initialLanguage={initialLanguage}>
          <SiteShell>{children}</SiteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
