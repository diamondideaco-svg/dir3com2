import './globals.css';
import type { Metadata } from 'next';
import { Montserrat, Playfair_Display, Tajawal } from 'next/font/google';
import { cookies } from 'next/headers';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import SiteShell from '@/components/layout/SiteShell';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE_NAME, languageDirection, normalizeLanguage } from '@/lib/i18n/config';

const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700'], variable: '--font-tajawal', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-playfair', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://dir3com.com'),
  title: {
    default: 'dir3com | درعك الحامي للسياحة.',
    template: '%s | dir3com',
  },
  description: 'dir3com منصة للسفر والخدمات والعروض بتجربة واضحة وسلسة تدعم العربية والإنجليزية.',
  keywords: ['dir3com', 'رحلات', 'خدمات فاخرة', 'حجوزات', 'العروض', 'الدبرة'],
  alternates: {
    canonical: 'https://dir3com.com',
  },
  openGraph: {
    title: 'dir3com | درعك الحامي للسياحة.',
    description: 'اكتشف خدمات السفر والعروض مع dir3com بتجربة موثوقة وواضحة.',
    type: 'website',
    locale: 'ar_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dir3com | درعك الحامي للسياحة.',
    description: 'dir3com: درعك الحامي للسياحة.',
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
    <html lang={initialLanguage} dir={languageDirection(initialLanguage)} className={`${tajawal.variable} ${montserrat.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <LanguageProvider initialLanguage={initialLanguage}>
          <SiteShell>{children}</SiteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
