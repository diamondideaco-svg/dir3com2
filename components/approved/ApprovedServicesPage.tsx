'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const primaryNav = [
  { href: '/', ar: 'الرئيسية', en: 'Home' },
  { href: '/services', ar: 'خدماتنا', en: 'Services' },
  { href: '/services/drive', ar: 'dir3 Drive', en: 'dir3 Drive' },
  { href: '/services/fly', ar: 'dir3 Fly', en: 'dir3 Fly' },
  { href: '/services/stay', ar: 'dir3 Stay', en: 'dir3 Stay' },
  { href: '/services/concierge', ar: 'dir3 Concierge', en: 'dir3 Concierge' },
  { href: '/services/vip', ar: 'dir3 VIP', en: 'dir3 VIP' },
] as const;

const cards = [
  { href: '/services/drive', label: 'dir3 Drive', image: '/brand/runtime/services-standard/dir3com-drive-1600x900.png' },
  { href: '/services/fly', label: 'dir3 Fly', image: '/brand/runtime/services-standard/dir3com-fly-1600x900.png' },
  { href: '/services/stay', label: 'dir3 Stay', image: '/brand/runtime/services-standard/dir3com-stay-1600x900.png' },
  { href: '/services/concierge', label: 'dir3 Concierge', image: '/brand/runtime/services-standard/dir3com-concierge-1600x900.png' },
  { href: '/services/vip', label: 'dir3 VIP', image: '/brand/runtime/services-standard/dir3com-vip-1600x900.png' },
] as const;

export default function ApprovedServicesPage() {
  const { language, direction, toggleLanguage } = useLanguage();

  return (
    <main className="approved-services-reference" dir={direction}>
      <h1 className="sr-only">{language === 'ar' ? 'خدماتنا تحت الدرع' : 'Our services under the shield'}</h1>
      <nav className="sr-only" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Primary navigation'}>
        {primaryNav.map((item) => <Link key={item.href} href={item.href}>{item[language]}</Link>)}
        <button type="button" onClick={toggleLanguage}>{language === 'ar' ? 'English' : 'العربية'}</button>
      </nav>
      <div className="approved-services-reference__frame">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            aria-label={card.label}
            className="approved-services-reference__card"
          >
            <span className="approved-services-reference__media">
              <Image
                src={card.image}
                alt={card.label}
                fill
                sizes="(min-width: 1280px) 20vw, (min-width: 640px) 50vw, 100vw"
                priority
                unoptimized
                className="approved-services-reference__image"
              />
            </span>
            <span className="approved-services-reference__label">{card.label}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
