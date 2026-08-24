'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { FaApple, FaFacebookF, FaGooglePlay, FaInstagram, FaLinkedinIn, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiGlobe, FiMail, FiPhoneCall } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { getOfficialSocialLinks } from '@/lib/config/social';

const socialIconByLabel: Record<string, ComponentType<{ size?: number }>> = {
  WhatsApp: FaWhatsapp, واتساب: FaWhatsapp, Instagram: FaInstagram, TikTok: FaTiktok,
  X: FaXTwitter, Facebook: FaFacebookF, LinkedIn: FaLinkedinIn,
};

const copy = {
  ar: {
    aboutTitle: 'عن الشركة',
    about: [{ label: 'من نحن', href: '/about' }, { label: 'الشروط والأحكام', href: '/terms' }, { label: 'سياسة الخصوصية', href: '/privacy' }, { label: 'مركز المساعدة', href: '/support' }],
    servicesTitle: 'خدماتنا',
    services: [{ label: 'dir3 Drive', href: '/services/drive' }, { label: 'dir3 Stay', href: '/services/stay' }, { label: 'dir3 Concierge', href: '/services/concierge' }, { label: 'dir3 VIP', href: '/services/vip' }, { label: 'dir3 Fly', href: '/services/fly' }],
    contactTitle: 'تواصل معنا',
    appTitle: 'تطبيق dir3com',
    appBody: 'احجز خدماتك بسهولة من خلال تطبيقنا المتوفر على:',
    rights: 'جميع الحقوق محفوظة © 2026 dir3com',
    sa: 'السعودية',
    eg: 'مصر',
  },
  en: {
    aboutTitle: 'Company',
    about: [{ label: 'About us', href: '/about' }, { label: 'Terms & conditions', href: '/terms' }, { label: 'Privacy policy', href: '/privacy' }, { label: 'Help center', href: '/support' }],
    servicesTitle: 'Services',
    services: [{ label: 'dir3 Drive', href: '/services/drive' }, { label: 'dir3 Stay', href: '/services/stay' }, { label: 'dir3 Concierge', href: '/services/concierge' }, { label: 'dir3 VIP', href: '/services/vip' }, { label: 'dir3 Fly', href: '/services/fly' }],
    contactTitle: 'Contact',
    appTitle: 'dir3com App',
    appBody: 'Book your services easily with our app, available on:',
    rights: '© 2026 dir3com. All rights reserved.',
    sa: 'Saudi Arabia',
    eg: 'Egypt',
  },
} as const;

export default function Footer() {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const socials = getOfficialSocialLinks(language);

  return (
    <footer dir={direction} className="border-t border-[#c89536]/35 bg-[#fffdf9] text-[#0d1b2a]">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.1fr_0.8fr_0.8fr_1.25fr] lg:px-10">
        <section>
          <div className="relative h-24 w-60 overflow-hidden rounded-2xl bg-white/95">
            <Image src="/brand/runtime/dir3com-logo-approved-cropped.png" alt="dir3com" fill unoptimized sizes="240px" className="object-contain p-2" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {socials.map(({ href, label }) => {
              const Icon = socialIconByLabel[label] ?? FaWhatsapp;
              return <Link key={href} href={href} target="_blank" rel="noreferrer noopener" aria-label={label} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c89536]/65 text-[#e2b95f] transition hover:bg-[#c89536] hover:text-black"><Icon size={16} /></Link>;
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#e2b95f]">{t.aboutTitle}</h2>
          <div className="mt-4 grid gap-3 text-sm text-[#334155]">{t.about.map((item) => <Link key={item.href} href={item.href} className="hover:text-[#a66d10]">{item.label}</Link>)}</div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#e2b95f]">{t.servicesTitle}</h2>
          <div className="mt-4 grid gap-3 text-sm text-[#334155]">{t.services.map((item) => <Link key={item.href} href={item.href} className="hover:text-[#a66d10]">{item.label}</Link>)}</div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#e2b95f]">{t.appTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-[#64748b]">{t.appBody}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-[#d4af37]/40 px-4 py-2"><FaGooglePlay size={23} /><span className="text-sm font-semibold">Google Play</span></span>
            <span className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-[#d4af37]/40 px-4 py-2"><FaApple size={26} /><span className="text-sm font-semibold">App Store</span></span>
          </div>
          <h2 className="mt-7 text-lg font-bold text-[#e2b95f]">{t.contactTitle}</h2>
          <div className="mt-3 grid gap-2 text-sm text-[#334155]">
            <a href="tel:+966532867009" className="inline-flex items-center gap-2 hover:text-[#a66d10]"><FiPhoneCall className="text-[#a66d10]" />{t.sa}: +966 53 286 7009</a>
            <a href="tel:+201011676418" className="inline-flex items-center gap-2 hover:text-[#a66d10]"><FiPhoneCall className="text-[#a66d10]" />{t.eg}: +20 101 167 6418</a>
            <a href="mailto:info@dir3com.com" className="inline-flex items-center gap-2 hover:text-[#a66d10]"><FiMail className="text-[#a66d10]" />info@dir3com.com</a>
            <a href="https://dir3com.com" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 hover:text-[#a66d10]"><FiGlobe className="text-[#a66d10]" />www.dir3com.com</a>
            <a href="https://dir3com.net" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 hover:text-[#a66d10]"><FiGlobe className="text-[#a66d10]" />www.dir3com.net</a>
          </div>
        </section>
      </div>
      <div className="border-t border-[#c89536]/35 px-5 py-5 text-center text-sm text-[#64748b]">{t.rights}</div>
    </footer>
  );
}
