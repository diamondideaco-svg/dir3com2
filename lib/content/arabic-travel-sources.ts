export type ArabicTravelSource = {
  id: string;
  name: string;
  type: 'official-website' | 'official-youtube';
  url: string;
  country: string;
  countryCode: 'SA' | 'AE' | 'EG' | 'QA' | 'BH' | 'KW' | 'JO' | 'SY';
  language: 'ar' | 'en' | 'mixed';
  enabled: boolean;
  feedUrl?: string;
};

export const arabicTravelSources: readonly ArabicTravelSource[] = [
  {
    id: 'visit-saudi-ar',
    name: 'Visit Saudi / روح السعودية',
    type: 'official-website',
    url: 'https://www.visitsaudi.com/ar',
    country: 'Saudi Arabia',
    countryCode: 'SA',
    language: 'ar',
    enabled: true,
  },
  {
    id: 'gea-events-ar',
    name: 'الهيئة العامة للترفيه',
    type: 'official-website',
    url: 'https://www.gea.gov.sa/ar/events/',
    country: 'Saudi Arabia',
    countryCode: 'SA',
    language: 'ar',
    enabled: true,
  },
  {
    id: 'aishha-events-ar',
    name: 'عيشها',
    type: 'official-website',
    url: 'https://enjoy.sa/ar',
    country: 'Saudi Arabia',
    countryCode: 'SA',
    language: 'ar',
    enabled: true,
  },
  {
    id: 'visit-dubai-videos-ar',
    name: 'Visit Dubai',
    type: 'official-website',
    url: 'https://www.visitdubai.com/ar/dubai-video/videos',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    language: 'ar',
    enabled: true,
  },
  {
    id: 'experience-egypt-ar', name: 'Experience Egypt', type: 'official-website', url: 'https://www.experienceegypt.eg/ar', country: 'Egypt', countryCode: 'EG', language: 'ar', enabled: true,
  },
  {
    id: 'egypt-ministry-tourism-ar', name: 'وزارة السياحة والآثار المصرية', type: 'official-website', url: 'https://mota.gov.eg/ar/', country: 'Egypt', countryCode: 'EG', language: 'ar', enabled: true,
  },
  {
    id: 'visit-qatar-ar', name: 'Visit Qatar', type: 'official-website', url: 'https://visitqatar.com/qa-ar', country: 'Qatar', countryCode: 'QA', language: 'ar', enabled: true,
  },
  {
    id: 'bahrain-tourism-ar', name: 'هيئة البحرين للسياحة والمعارض', type: 'official-website', url: 'https://www.bahrain.com/ar', country: 'Bahrain', countryCode: 'BH', language: 'ar', enabled: true,
  },
  {
    id: 'visit-kuwait-ar', name: 'Visit Kuwait', type: 'official-website', url: 'https://www.visitkuwait.com/', country: 'Kuwait', countryCode: 'KW', language: 'ar', enabled: true,
  },
  {
    id: 'visit-jordan-ar', name: 'Visit Jordan', type: 'official-website', url: 'https://visitjordan.com/', country: 'Jordan', countryCode: 'JO', language: 'ar', enabled: true,
  },
  {
    id: 'syria-tourism-official', name: 'وزارة السياحة السورية', type: 'official-website', url: 'https://mot.gov.sy/', country: 'Syria', countryCode: 'SY', language: 'ar', enabled: true,
  },
  {
    id: 'saudia-official',
    name: 'Saudia',
    type: 'official-youtube',
    url: 'https://www.youtube.com/@SaudiaAirlines',
    country: 'Saudi Arabia',
    countryCode: 'SA',
    language: 'mixed',
    enabled: false,
  },
  {
    id: 'emirates-official',
    name: 'Emirates',
    type: 'official-youtube',
    url: 'https://www.youtube.com/@Emirates',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    language: 'mixed',
    enabled: false,
  },
  {
    id: 'qatar-airways-official',
    name: 'Qatar Airways',
    type: 'official-youtube',
    url: 'https://www.youtube.com/@qatarairways',
    country: 'Qatar',
    countryCode: 'QA',
    language: 'mixed',
    enabled: false,
  },
];

export const approvedTravelMediaHosts = new Set([
  'www.visitdubai.com',
  'www.experienceegypt.eg',
  'experienceegypt.eg',
  'mota.gov.eg',
  'visitqatar.com',
  'www.visitqatar.com',
  'www.bahrain.com',
  'www.visitkuwait.com',
  'visitkuwait.com',
  'visitjordan.com',
  'www.visitjordan.com',
  'mot.gov.sy',
  'visitsaudi.com',
  'www.visitsaudi.com',
  'www.youtube.com',
  'youtube.com',
]);
