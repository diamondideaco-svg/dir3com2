import './globals.css';
import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import SiteShell from '@/components/layout/SiteShell';
import { DabraConversationProvider } from '@/components/dabra/DabraConversationProvider';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE_NAME, languageDirection, normalizeLanguage } from '@/lib/i18n/config';

const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700'], variable: '--font-tajawal', display: 'swap' });
// Unmodified Google Fonts source and OFL: https://github.com/google/fonts/tree/35e77c3854970a550d9894a85aba21420813a019/ofl/montserrat
const montserrat = localFont({
  src: [
    { path: './fonts/montserrat/Montserrat[wght].ttf', weight: '400', style: 'normal' },
    { path: './fonts/montserrat/Montserrat[wght].ttf', weight: '500', style: 'normal' },
    { path: './fonts/montserrat/Montserrat[wght].ttf', weight: '600', style: 'normal' },
    { path: './fonts/montserrat/Montserrat[wght].ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-montserrat',
  display: 'swap',
});
// Unmodified Google Fonts source and OFL: https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/playfairdisplay
const playfair = localFont({
  src: './fonts/playfair-display/PlayfairDisplay[wght].ttf',
  weight: '500 700',
  style: 'normal',
  variable: '--font-playfair',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

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
          <DabraConversationProvider><SiteShell>{children}</SiteShell></DabraConversationProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
