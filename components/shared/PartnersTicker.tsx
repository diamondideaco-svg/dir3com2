'use client';

import type { Partner, PartnerScope } from '@/lib/content/partners';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import homeStyles from '@/components/home/home-production.module.css';

type PartnersTickerProps = {
  partners: readonly Partner[];
  scope?: PartnerScope;
  homePresentation?: boolean;
};

export default function PartnersTicker({ partners, scope, homePresentation = false }: PartnersTickerProps) {
  const { language } = useLanguage();
  const visiblePartners = partners.filter((partner) => partner.published && (!scope || partner.scope === scope || partner.scope === 'global'));

  if (!visiblePartners.length) return null;

  if (homePresentation) {
    const rows = [visiblePartners.filter((_, index) => index % 2 === 0), visiblePartners.filter((_, index) => index % 2 === 1)].filter(row => row.length);
    return <section className={homeStyles.companies} aria-labelledby="home-companies-title" data-home-companies>
      <h2 id="home-companies-title">{language === 'ar' ? 'الشركات العالمية' : 'Global Companies'}</h2>
      {rows.map((row, rowIndex) => <div className={homeStyles.companyRow} key={rowIndex} data-company-row={rowIndex + 1} dir="ltr">
        <div className={homeStyles.companyTrack}>
          {[0, 1].map(copy => <div className={homeStyles.companyGroup} key={copy} aria-hidden={copy === 1 ? true : undefined} inert={copy === 1 ? true : undefined}>
            {row.map(partner => <a key={partner.id} href={partner.href} target="_blank" rel="noopener noreferrer" className="home-partner-mark" tabIndex={copy === 1 ? -1 : undefined}>
              {partner.logo ? <img src={partner.logo} alt={partner.name} className="max-h-10 max-w-36 object-contain" /> : <span>{partner.name}</span>}
            </a>)}
          </div>)}
        </div>
      </div>)}
    </section>;
  }

  return (
    <section aria-label="Global travel ecosystem" className="home-partners-section px-4 py-10 sm:px-6 lg:px-10">
      <div className="home-partners-section__inner mb-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--home-gold)]">GLOBAL TRAVEL ECOSYSTEM</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--color-navy)]">منظومة السفر العالمية</h2>
      </div>
      <div className="home-partners-marquee mx-auto max-w-7xl overflow-hidden">
        <div className="home-partners-track flex w-max gap-4">
          {[...visiblePartners, ...visiblePartners].map((partner, index) => (
            <a key={`${partner.id}-${index < visiblePartners.length ? 'first' : 'second'}`} href={partner.href} target="_blank" rel="noopener noreferrer" className="home-partner-mark">
              {partner.logo ? <img src={partner.logo} alt={partner.name} className="max-h-10 max-w-36 object-contain" /> : <span>{partner.name}</span>}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
