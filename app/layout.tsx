import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { GoogleTagManager } from '@next/third-parties/google';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import SiteShell from '@/components/layout/SiteShell';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE_NAME, languageDirection, normalizeLanguage } from '@/lib/i18n/config';

export const metadata: Metadata = {
  metadataBase: new URL('https://dir3com.com'),
  title: {
    default: 'dir3com | درعك الحامي للسياحة.',
    template: '%s | dir3com',
  },
  description: 'dir3com بهوية عربية تنفيذية جديدة للسفر والخدمات، مع تجربة RTL/LTR متوازنة وسطح بصري موحد عبر المنصة العامة.',
  keywords: ['dir3com', 'رحلات', 'خدمات فاخرة', 'حجوزات', 'العروض', 'الدبرة'],
  alternates: {
    canonical: 'https://dir3com.com',
  },
  openGraph: {
    title: 'dir3com | درعك الحامي للسياحة.',
    description: 'هوية dir3com الجديدة لمنصة السفر والخدمات المميزة، بتجربة عربية تنفيذية واضحة وفاخرة.',
    type: 'website',
    locale: 'ar_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dir3com | درعك الحامي للسياحة.',
    description: 'dir3com بهوية جديدة: درعك الحامي للسياحة.',
  },
  verification: {
    other: {
      'facebook-domain-verification': 'g6sefyrfpysoavwv6ggtzpomhcyzhw',
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialLanguage = normalizeLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value ?? DEFAULT_LANGUAGE);

  return (
    <html lang={initialLanguage} dir={languageDirection(initialLanguage)} suppressHydrationWarning>
      <GoogleTagManager gtmId="GTM-PJMMCPSW" />
      <body className="antialiased">
        <LanguageProvider initialLanguage={initialLanguage}>
          <SiteShell>{children}</SiteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
