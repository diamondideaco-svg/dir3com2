import Link from 'next/link';
import { type ComponentType } from 'react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiArrowUpLeft, FiDownload, FiPhoneCall, FiShield, FiSmartphone } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { getOfficialSocialLinks, getWhatsAppDirectory } from '@/lib/config/social';

const socialIconByLabel: Record<string, ComponentType<{ size?: number }>> = {
  WhatsApp: FaWhatsapp,
  Instagram: FaInstagram,
  TikTok: FaTiktok,
  X: FaXTwitter,
  Facebook: FaFacebookF,
  LinkedIn: FaLinkedinIn,
  واتساب: FaWhatsapp,
};

const copy = {
  ar: {
    footerCollections: [
      { title: 'الاستكشاف', links: [{ label: 'الرئيسية', href: '/#home' }, { label: 'خدماتنا', href: '/services' }, { label: 'العروض', href: '/offers' }, { label: 'من نحن', href: '/about' }, { label: 'تواصل', href: '/contact' }] },
      { title: 'الخدمات', links: [{ label: 'السيارات', href: '/cars' }, { label: 'الفنادق', href: '/hotels' }, { label: 'التجارب', href: '/experiences' }, { label: 'الكونسيرج', href: '/concierge' }] },
    ],
    tagline: 'درعك الحامي للسياحة.',
    description: 'مع dir3com تجد خدمات السفر والعروض والخيارات اليومية في مكان واحد، بخطوات واضحة وسهلة المتابعة.',
    assistant: 'الدبرة ترافقك في العثور على خيارات السفر المناسبة داخل تجربة dir3com.',
    contactDownload: 'تواصل وتنزيل',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    rights: 'جميع الحقوق محفوظة © 2026 dir3com — تُدار بواسطة شركة الفكرة الماسية للتجارة.',
    operator: 'الكيان القانوني المشغل: شركة الفكرة الماسية للتجارة.',
    verificationNote: 'بيان التحقق التجاري: dir3com علامة تشغيلية، والكيان القانوني هو شركة الفكرة الماسية للتجارة.',
    motto: 'خدمة موثوقة. عروض متنوعة. تجربة محمية.',
    trustLabel: 'الوعد الرسمي',
    whatsappEg: 'واتساب مصر',
    whatsappSa: 'واتساب السعودية',
  },
  en: {
    footerCollections: [
      { title: 'Explore', links: [{ label: 'Home', href: '/#home' }, { label: 'Services', href: '/services' }, { label: 'Offers', href: '/offers' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }] },
      { title: 'Services', links: [{ label: 'Cars', href: '/cars' }, { label: 'Hotels', href: '/hotels' }, { label: 'Experiences', href: '/experiences' }, { label: 'Concierge', href: '/concierge' }] },
    ],
    tagline: 'Your protective shield for tourism.',
    description: 'dir3com brings travel services and offers together in one place, with clear steps and smooth navigation.',
    assistant: 'DABRA helps you discover suitable travel options inside the dir3com journey.',
    contactDownload: 'Contact & Download',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    rights: '© 2026 dir3com. All rights reserved. Operated by شركة الفكرة الماسية للتجارة (Diamond Idea Company).',
    operator: 'Legal operating entity: شركة الفكرة الماسية للتجارة (Diamond Idea Company).',
    verificationNote: 'Business verification statement: dir3com is the operating brand, and Diamond Idea Company is the legal entity.',
    motto: 'Trusted service. Diverse offers. Protected experience.',
    trustLabel: 'Official promise',
    whatsappEg: 'WhatsApp Egypt',
    whatsappSa: 'WhatsApp Saudi Arabia',
  },
} as const;

export default function Footer() {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const socialLinks = getOfficialSocialLinks(language);
  const whatsapp = getWhatsAppDirectory();

  return (
    <footer className="border-t border-white/10 bg-[linear-gradient(160deg,#0d1a2a_0%,#14283d_56%,#9d5c4d_140%)] text-[var(--color-light)]" dir={direction}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr]">
          <div className="max-w-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,rgba(200,168,107,0.24)_0%,rgba(255,255,255,0.08)_100%)] text-[var(--color-gold)] shadow-[0_18px_36px_rgba(0,0,0,0.16)]">
                <FiShield size={22} />
              </span>
              <div>
                <p className="font-[var(--font-display)] text-3xl font-semibold">dir3com</p>
                <p className="text-sm text-[var(--color-light)]/65">{t.tagline}</p>
              </div>
            </div>
            <div className="mt-5 inline-flex rounded-full border border-[var(--color-gold)]/22 bg-[var(--color-gold)]/12 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-[var(--color-gold)]">
              {t.trustLabel}
            </div>
            <p className="mt-5 text-sm leading-8 text-[var(--color-light)]/72">
              {t.description}
            </p>
            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/6 p-4 text-sm leading-8 text-[var(--color-light)]/78 shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
              {t.assistant}
            </div>
            <div className="mt-4 rounded-[20px] border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 p-4 text-sm leading-7 text-[var(--color-light)]/88">
              <p className="font-semibold text-[var(--color-gold)]">{t.operator}</p>
              <p className="mt-1 text-[var(--color-light)]/80">{t.verificationNote}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a href="https://dir3com.com" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                dir3com.com <FiArrowUpLeft />
              </a>
              <a href="https://dir3com.net" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                dir3com.net <FiArrowUpLeft />
              </a>
            </div>
          </div>

          {t.footerCollections.map((collection) => (
            <div key={collection.title}>
              <h3 className="text-lg font-semibold">{collection.title}</h3>
              <div className="mt-5 grid gap-3 text-sm text-[var(--color-light)]/75">
                {collection.links.map((item) => (
                  <Link key={item.href} href={item.href} className="rounded-md transition hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-lg font-semibold">{t.contactDownload}</h3>
            <div className="mt-5 flex items-center gap-2 text-sm text-[var(--color-light)]/75">
              <FiPhoneCall />
              <a href="tel:0532867009" className="rounded-md transition hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                0532867009
              </a>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-2 lg:grid-cols-1 lg:gap-3">
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                <FiDownload /> {t.appStore}
              </button>
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                <FiSmartphone /> {t.googlePlay}
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {socialLinks.map(({ href, label }) => {
                const Icon = socialIconByLabel[label] ?? FaWhatsapp;
                return (
                  <Link
                    key={`${label}:${href}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45"
                  >
                    <Icon size={15} />
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-light)]/75">
              {whatsapp.eg ? (
                <a href={whatsapp.eg} target="_blank" rel="noreferrer noopener" className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]">
                  {t.whatsappEg}
                </a>
              ) : null}
              {whatsapp.sa ? (
                <a href={whatsapp.sa} target="_blank" rel="noreferrer noopener" className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]">
                  {t.whatsappSa}
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-[var(--color-light)]/65 sm:flex sm:items-center sm:justify-between">
          <p>{t.rights}</p>
          <p className="mt-3 sm:mt-0">{t.motto}</p>
        </div>
      </div>
    </footer>
  );
}
