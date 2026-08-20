/** Beta coverage: explicit country → city list. Only places dir3com actually references. */
export type CanonicalCountry = {
  code: string;
  ar: string;
  en: string;
  region: 'gulf' | 'arab' | 'north-africa' | 'europe';
  cities: Array<{ slug: string; ar: string; en: string }>;
};

export const canonicalCountries: CanonicalCountry[] = [
  {
    code: 'sa',
    ar: 'السعودية',
    en: 'Saudi Arabia',
    region: 'gulf',
    cities: [
      { slug: 'riyadh', ar: 'الرياض', en: 'Riyadh' },
      { slug: 'jeddah', ar: 'جدة', en: 'Jeddah' },
      { slug: 'makkah', ar: 'مكة', en: 'Makkah' },
      { slug: 'madinah', ar: 'المدينة', en: 'Madinah' },
      { slug: 'dammam', ar: 'الدمام', en: 'Dammam' },
      { slug: 'khobar', ar: 'الخبر', en: 'Khobar' },
      { slug: 'abha', ar: 'أبها', en: 'Abha' },
      { slug: 'taif', ar: 'الطائف', en: 'Taif' },
      { slug: 'alula', ar: 'العلا', en: 'AlUla' },
      { slug: 'neom', ar: 'نيوم', en: 'NEOM' },
    ],
  },
  {
    code: 'ae',
    ar: 'الإمارات',
    en: 'United Arab Emirates',
    region: 'gulf',
    cities: [
      { slug: 'dubai', ar: 'دبي', en: 'Dubai' },
      { slug: 'abu-dhabi', ar: 'أبوظبي', en: 'Abu Dhabi' },
      { slug: 'sharjah', ar: 'الشارقة', en: 'Sharjah' },
    ],
  },
  {
    code: 'qa',
    ar: 'قطر',
    en: 'Qatar',
    region: 'gulf',
    cities: [{ slug: 'doha', ar: 'الدوحة', en: 'Doha' }],
  },
  {
    code: 'kw',
    ar: 'الكويت',
    en: 'Kuwait',
    region: 'gulf',
    cities: [{ slug: 'kuwait-city', ar: 'مدينة الكويت', en: 'Kuwait City' }],
  },
  {
    code: 'bh',
    ar: 'البحرين',
    en: 'Bahrain',
    region: 'gulf',
    cities: [{ slug: 'manama', ar: 'المنامة', en: 'Manama' }],
  },
  {
    code: 'om',
    ar: 'عُمان',
    en: 'Oman',
    region: 'gulf',
    cities: [{ slug: 'muscat', ar: 'مسقط', en: 'Muscat' }, { slug: 'salalah', ar: 'صلالة', en: 'Salalah' }],
  },
  {
    code: 'eg',
    ar: 'مصر',
    en: 'Egypt',
    region: 'north-africa',
    cities: [
      { slug: 'cairo', ar: 'القاهرة', en: 'Cairo' },
      { slug: 'giza', ar: 'الجيزة', en: 'Giza' },
      { slug: 'alexandria', ar: 'الإسكندرية', en: 'Alexandria' },
      { slug: 'hurghada', ar: 'الغردقة', en: 'Hurghada' },
      { slug: 'sharm-el-sheikh', ar: 'شرم الشيخ', en: 'Sharm El Sheikh' },
      { slug: 'luxor', ar: 'الأقصر', en: 'Luxor' },
      { slug: 'aswan', ar: 'أسوان', en: 'Aswan' },
      { slug: 'marsa-alam', ar: 'مرسى علم', en: 'Marsa Alam' },
      { slug: 'new-alamein', ar: 'العلمين الجديدة', en: 'New Alamein' },
    ],
  },
  {
    code: 'jo',
    ar: 'الأردن',
    en: 'Jordan',
    region: 'arab',
    cities: [{ slug: 'amman', ar: 'عمّان', en: 'Amman' }, { slug: 'aqaba', ar: 'العقبة', en: 'Aqaba' }],
  },
  {
    code: 'ma',
    ar: 'المغرب',
    en: 'Morocco',
    region: 'north-africa',
    cities: [{ slug: 'casablanca', ar: 'الدار البيضاء', en: 'Casablanca' }, { slug: 'marrakech', ar: 'مراكش', en: 'Marrakech' }],
  },
  {
    code: 'tn',
    ar: 'تونس',
    en: 'Tunisia',
    region: 'north-africa',
    cities: [{ slug: 'tunis', ar: 'تونس', en: 'Tunis' }],
  },
  {
    code: 'tr',
    ar: 'تركيا',
    en: 'Türkiye',
    region: 'europe',
    cities: [{ slug: 'istanbul', ar: 'إسطنبول', en: 'Istanbul' }, { slug: 'antalya', ar: 'أنطاليا', en: 'Antalya' }],
  },
  {
    code: 'gb',
    ar: 'المملكة المتحدة',
    en: 'United Kingdom',
    region: 'europe',
    cities: [{ slug: 'london', ar: 'لندن', en: 'London' }, { slug: 'manchester', ar: 'مانشستر', en: 'Manchester' }],
  },
  {
    code: 'fr',
    ar: 'فرنسا',
    en: 'France',
    region: 'europe',
    cities: [{ slug: 'paris', ar: 'باريس', en: 'Paris' }],
  },
];

export function citiesForCountry(code: string) {
  return canonicalCountries.find((country) => country.code === code)?.cities ?? [];
}

export function todayIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
