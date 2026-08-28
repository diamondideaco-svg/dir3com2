export type CanonicalServiceSlug = 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';

export type CanonicalService = {
  slug: CanonicalServiceSlug;
  /** Frozen canonical name. Never translate or rename. */
  name: string;
  nameAr: string;
  eyebrow: string;
  icon: string;
  /** Approved hero asset. Service pages only, never rendered as a full-page screenshot. */
  hero: string;
  descriptionAr: string;
  descriptionEn: string;
  /** Catalog categories that live under this primary service. */
  categories: string[];
};

export const canonicalServices: CanonicalService[] = [
  {
    slug: 'drive',
    name: 'dir3 Drive',
    nameAr: 'dir3 Drive',
    eyebrow: 'DIR3 DRIVE',
    icon: '/icons/drive.svg',
    hero: '/brand/runtime/services-standard/dir3com-drive-1600x900.png',
    descriptionAr: 'خيارات تنقل ومسارات للضيف المحلي والدولي مع عرض التفاصيل قبل المتابعة.',
    descriptionEn: 'Ride and route options for local and international guests, with details shown before continuing.',
    categories: ['cars'],
  },
  {
    slug: 'stay',
    name: 'dir3 Stay',
    nameAr: 'dir3 Stay',
    eyebrow: 'DIR3 STAY',
    icon: '/icons/stay.svg',
    hero: '/brand/runtime/services-standard/dir3com-stay-1600x900.png',
    descriptionAr: 'خيارات فنادق وشقق مخدومة مع عرض المزايا والسياسات قبل المتابعة.',
    descriptionEn: 'Hotel and serviced-apartment options with amenities and policies shown before continuing.',
    categories: ['hotels', 'apartments'],
  },
  {
    slug: 'fly',
    name: 'dir3 Fly',
    nameAr: 'dir3 Fly',
    eyebrow: 'DIR3 FLY',
    icon: '/icons/airport.svg',
    hero: '/brand/runtime/services-standard/dir3com-fly-1600x900.png',
    descriptionAr: 'خيارات للوصول والمغادرة مع عرض تفاصيل الرحلة قبل المتابعة.',
    descriptionEn: 'Arrival and departure options with trip details shown before continuing.',
    categories: ['airport-transfers'],
  },
  {
    slug: 'concierge',
    name: 'dir3 Concierge',
    nameAr: 'dir3 Concierge',
    eyebrow: 'DIR3 CONCIERGE',
    icon: '/icons/concierge.svg',
    hero: '/brand/runtime/services-standard/dir3com-concierge-1600x900.png',
    descriptionAr: 'تنسيق الطلبات والمواعيد وتفاصيل الرحلة في تجربة عربية سهلة القراءة.',
    descriptionEn: 'Coordination for requests, schedules, and trip details in an Arabic-first experience.',
    categories: ['concierge'],
  },
  {
    slug: 'vip',
    name: 'dir3 VIP',
    nameAr: 'dir3 VIP',
    eyebrow: 'DIR3 VIP',
    icon: '/icons/concierge.svg',
    hero: '/brand/runtime/services-standard/dir3com-vip-1600x900.png',
    descriptionAr: 'خدمات وتجارب VIP للضيوف والوفود مع عرض التفاصيل قبل تقديم الطلب.',
    descriptionEn: 'VIP services and experiences for guests and delegations, with details shown before a request.',
    categories: ['concierge'],
  },
];

export const canonicalServiceSlugs = canonicalServices.map((service) => service.slug);

/** Legacy paths and category slugs that must resolve to a canonical primary service. */
const canonicalSlugAliases: Record<string, CanonicalServiceSlug> = {
  drive: 'drive',
  cars: 'drive',
  car: 'drive',
  'dir3-drive': 'drive',
  stay: 'stay',
  hotels: 'stay',
  hotel: 'stay',
  apartments: 'stay',
  'dir3-stay': 'stay',
  fly: 'fly',
  'airport-transfers': 'fly',
  'airport-transfer': 'fly',
  airport: 'fly',
  'dir3-airport': 'fly',
  'dir3-fly': 'fly',
  concierge: 'concierge',
  'dir3-concierge': 'concierge',
  vip: 'vip',
  'dir3-vip': 'vip',
};

export function resolveCanonicalServiceSlug(input: string | null | undefined): CanonicalServiceSlug | null {
  if (!input) return null;
  return canonicalSlugAliases[input.trim().toLowerCase()] ?? null;
}

export function getCanonicalService(input: string | null | undefined): CanonicalService | null {
  const slug = resolveCanonicalServiceSlug(input);
  return slug ? canonicalServices.find((service) => service.slug === slug) ?? null : null;
}

export function canonicalServiceHref(slug: CanonicalServiceSlug) {
  return `/services/${slug}`;
}
