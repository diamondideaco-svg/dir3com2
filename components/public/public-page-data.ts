import type {
  MarketplaceCollectionKey,
  MarketplaceFamilyKey,
  MarketplacePageCategory,
} from '@/lib/marketplace/data';

export type PublicCategorySlug =
  | 'cars'
  | 'hotels'
  | 'apartments'
  | 'airport-transfers'
  | 'concierge'
  | 'experiences'
  | 'offers';

export type PublicCategoryConfig = {
  slug: PublicCategorySlug;
  title: string;
  eyebrow: string;
  description: string;
  highlight: string;
  chips: string[];
  stats: Array<{ label: string; value: string }>;
  trustMessage: string;
  marketplaceFamily?: MarketplaceFamilyKey;
  marketplaceCategory?: MarketplacePageCategory;
  defaultCollection?: MarketplaceCollectionKey;
};

export const publicCategoryConfigs: Record<PublicCategorySlug, PublicCategoryConfig> = {
  cars: {
    slug: 'cars',
    title: 'السيارات',
    eyebrow: 'DIR3 DRIVE',
    description: 'خيارات تنقل مع عرض تفاصيل الخدمة والمسار قبل المتابعة.',
    highlight: 'استكشف خيارات النقل لرحلات الأعمال والعائلات داخل السعودية.',
    chips: ['سائق خاص', 'استقبال مطار', 'سيارات تنفيذية'],
    stats: [],
    trustMessage: 'راجع تفاصيل خيار التنقل قبل تقديم الطلب.',
    marketplaceFamily: 'dir3-drive',
    marketplaceCategory: 'cars',
  },
  hotels: {
    slug: 'hotels',
    title: 'الفنادق',
    eyebrow: 'DIR3 STAY',
    description: 'خيارات إقامة مع عرض المزايا والسياسات بوضوح قبل القرار.',
    highlight: 'واجهة الفنادق تحافظ على الطابع الفاخر وتجهز لربط المخزون والعروض الديناميكية لاحقاً.',
    chips: ['فنادق', 'سياسات الحجز', 'خيارات عائلية'],
    stats: [],
    trustMessage: 'شفافية الخدمة تسبق الدفع، والراحة تبدأ من طريقة عرض التفاصيل.',
    marketplaceFamily: 'dir3-stay',
    marketplaceCategory: 'hotels',
  },
  apartments: {
    slug: 'apartments',
    title: 'الشقق',
    eyebrow: 'DIR3 STAY · APARTMENTS',
    description: 'خيارات إقامة طويلة وقصيرة بمساحات للعائلات والوفود.',
    highlight: 'صفحة مرنة لعرض الشقق المخدومة ومزايا الإقامة المطولة ضمن نفس هوية dir3com.',
    chips: ['شقق مخدومة', 'إقامة مطولة', 'عوائل ووفود'],
    stats: [],
    trustMessage: 'المساحة المناسبة تعرض بوضوح مع مرونة تحفظ راحة الضيف ووقته.',
    marketplaceFamily: 'dir3-stay',
    marketplaceCategory: 'apartments',
  },
  'airport-transfers': {
    slug: 'airport-transfers',
    title: 'النقل من وإلى المطار',
    eyebrow: 'DIR3 FLY',
    description: 'خيارات للوصول والمغادرة مع عرض تفاصيل الرحلة قبل المتابعة.',
    highlight: 'استكشف خدمة المطار كمسار مستقل داخل dir3com.',
    chips: ['استقبال', 'مسار سريع', 'تنسيق وصول'],
    stats: [],
    trustMessage: 'الوصول والمغادرة يحتاجان وضوحاً كاملاً، وهذا ما تعكسه الواجهة أولاً.',
    marketplaceFamily: 'dir3-fly',
    marketplaceCategory: 'airport-transfers',
  },
  concierge: {
    slug: 'concierge',
    title: 'الكونسيرج',
    eyebrow: 'DIR3 CONCIERGE',
    description: 'تنسيق الطلبات والمواعيد وتفاصيل الرحلة في تجربة عربية سهلة القراءة.',
    highlight: 'الصفحة تجهز لطلبات مخصصة وعلاقات VIP دون الحاجة إلى منطق تشغيلي معقد في هذه المرحلة.',
    chips: ['طلبات مخصصة', 'VIP', 'تفاصيل الرحلة'],
    stats: [],
    trustMessage: 'كل طلب خاص يحتاج هدوءاً ووضوحاً، والواجهة مصممة على هذا الأساس.',
    marketplaceFamily: 'dir3-concierge',
    marketplaceCategory: 'concierge',
  },
  experiences: {
    slug: 'experiences',
    title: 'التجارب',
    eyebrow: 'CATALOG · EXPERIENCES',
    description: 'تجارب ثقافية وترفيهية داخل السعودية مع عرض تفاصيل كل تجربة.',
    highlight: 'المحتوى هنا مهيأ للتوسع إلى تجارب موسمية وفعاليات متغيرة من دون تغيير النظام البصري.',
    chips: ['ثقافة', 'فعاليات', 'رحلات'],
    stats: [],
    trustMessage: 'التجربة المميزة لا تحتاج صخباً؛ تحتاج عرضاً مقنعاً ومحترماً للوقت.',
    marketplaceFamily: 'dir3-concierge',
    marketplaceCategory: 'experiences',
  },
  offers: {
    slug: 'offers',
    title: 'العروض',
    eyebrow: 'CATALOG · OFFERS',
    description: 'مساحة لعرض العروض الموسمية وتفاصيلها عند توفرها.',
    highlight: 'تمهيد بصري لعروض قابلة للربط بالكتالوج أو الحملات لاحقاً من دون ازدواجية في المكونات.',
    chips: ['موسمي', 'عائلي', 'تفاصيل العرض'],
    stats: [],
    trustMessage: 'العرض الجيد يشرح القيمة أولاً ويحافظ على الشفافية حتى النهاية.',
    defaultCollection: 'featured',
  },
};

export const publicQuickLinks = [
  { label: 'الخدمات', href: '/services' },
  { label: 'dir3 Drive', href: '/services/drive' },
  { label: 'dir3 Stay', href: '/services/stay' },
  { label: 'dir3 Fly', href: '/services/fly' },
  { label: 'dir3 Concierge', href: '/services/concierge' },
  { label: 'dir3 VIP', href: '/services/vip' },
  { label: 'الشقق', href: '/apartments' },
  { label: 'التجارب', href: '/experiences' },
  { label: 'العروض', href: '/offers' },
  { label: 'من نحن', href: '/about' },
  { label: 'تواصل', href: '/contact' },
];
