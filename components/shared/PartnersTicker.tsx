'use client';

import type { Partner, PartnerScope } from '@/lib/content/partners';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type PartnersTickerProps = {
  partners: readonly Partner[];
  scope?: PartnerScope;
};

export default function PartnersTicker({ partners, scope }: PartnersTickerProps) {
  const { language, direction } = useLanguage();
  const visiblePartners = partners.filter((partner) => partner.published && (!scope || partner.scope === scope || partner.scope === 'global'));

  if (!visiblePartners.length) return null;

  return (
    <section dir={direction} aria-label={language === 'ar' ? 'منظومة السفر العالمية' : 'Global travel ecosystem'} className="home-partners-section px-4 py-10 sm:px-6 lg:px-10">
      <div className="home-partners-section__inner mb-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--home-gold)]">GLOBAL TRAVEL ECOSYSTEM</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--color-navy)]">{language === 'ar' ? 'منظومة السفر العالمية' : 'Global travel ecosystem'}</h2>
      </div>
      <div className="home-partners-track mx-auto max-w-7xl flex w-max gap-4">
        {[...visiblePartners, ...visiblePartners].map((partner, index) => (
          <a key={`${partner.id}-${index < visiblePartners.length ? 'first' : 'second'}`} href={partner.href} target="_blank" rel="noopener noreferrer" className="home-partner-mark">
            {partner.logo ? <img src={partner.logo} alt={partner.name} className="max-h-10 max-w-36 object-contain" /> : <span>{partner.name}</span>}
          </a>
        ))}
      </div>
    </section>
  );
}
