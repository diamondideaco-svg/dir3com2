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
};

export const publicCategoryConfigs: Record<PublicCategorySlug, PublicCategoryConfig> = {
  cars: {
    slug: 'cars',
    title: 'السيارات',
    eyebrow: 'DIR3 DRIVE',
    description: 'تنقلات فاخرة، سائقون محترفون، وتجربة انتقال مصممة لتبدأ بهدوء وتنتهي بثقة.',
    highlight: 'خدمة نقل مهيأة لرحلات الأعمال، العائلات، والضيافة الرفيعة داخل السعودية.',
    chips: ['سائق خاص', 'استقبال مطار', 'سيارات تنفيذية'],
    stats: [
      { label: 'مستوى الجاهزية', value: '24/7' },
      { label: 'مدن التغطية', value: '8' },
      { label: 'مسارات محمية', value: 'Shield' },
    ],
    trustMessage: 'تنقلك محفوظ بتجربة واضحة وتواصل سريع قبل وأثناء الرحلة.',
  },
  hotels: {
    slug: 'hotels',
    title: 'الفنادق',
    eyebrow: 'DIR3 STAY',
    description: 'إقامات راقية مختارة بعناية مع إبراز المزايا والسياسات بوضوح يريح العميل قبل القرار.',
    highlight: 'واجهة الفنادق تحافظ على الطابع الفاخر وتجهز لربط المخزون والعروض الديناميكية لاحقاً.',
    chips: ['إقامة فاخرة', 'مرونة الحجز', 'خيارات عائلية'],
    stats: [
      { label: 'خيارات الإقامة', value: '120+' },
      { label: 'مدن رئيسية', value: '6' },
      { label: 'تجربة موثوقة', value: 'Premium' },
    ],
    trustMessage: 'شفافية الخدمة تسبق الدفع، والراحة تبدأ من طريقة عرض التفاصيل.',
  },
  apartments: {
    slug: 'apartments',
    title: 'الشقق',
    eyebrow: 'DIR3 APARTMENTS',
    description: 'إقامات طويلة وقصيرة بخصوصية أعلى ومساحات مناسبة للعائلات والوفود.',
    highlight: 'صفحة مرنة لعرض الشقق المخدومة ومزايا الإقامة المطولة ضمن نفس هوية dir3com.',
    chips: ['شقق مخدومة', 'إقامة مطولة', 'خصوصية أعلى'],
    stats: [
      { label: 'أنماط الإقامة', value: 'Long Stay' },
      { label: 'عوائل ووفود', value: '2-8' },
      { label: 'مراجعة واضحة', value: 'Safe' },
    ],
    trustMessage: 'المساحة المناسبة تعرض بوضوح مع مرونة تحفظ راحة الضيف ووقته.',
  },
  'airport-transfers': {
    slug: 'airport-transfers',
    title: 'النقل من وإلى المطار',
    eyebrow: 'DIR3 AIRPORT',
    description: 'استقبال ومغادرة بانسيابية عالية، مع جاهزية لتتبع التفاصيل والتنبيهات مستقبلاً.',
    highlight: 'هذه الصفحة تبني تجربة المطار كخدمة قائمة بذاتها داخل dir3com مع الحفاظ على الدرع كرسالة ثقة.',
    chips: ['استقبال', 'مسار سريع', 'تنسيق وصول'],
    stats: [
      { label: 'زمن الاستجابة', value: 'Fast Lane' },
      { label: 'نقطة الوصول', value: 'Airport' },
      { label: 'تغطية الخدمة', value: '24/7' },
    ],
    trustMessage: 'الوصول والمغادرة يحتاجان وضوحاً كاملاً، وهذا ما تعكسه الواجهة أولاً.',
  },
  concierge: {
    slug: 'concierge',
    title: 'الكونسيرج',
    eyebrow: 'DIR3 CONCIERGE',
    description: 'تنسيق شخصي للطلبات والمواعيد والتفاصيل الدقيقة في تجربة عربية راقية وسهلة القراءة.',
    highlight: 'الصفحة تجهز لطلبات مخصصة وعلاقات VIP دون الحاجة إلى منطق تشغيلي معقد في هذه المرحلة.',
    chips: ['مساعد شخصي', 'VIP', 'متابعة يومية'],
    stats: [
      { label: 'نمط الخدمة', value: 'VIP' },
      { label: 'مستوى التخصيص', value: 'High' },
      { label: 'واجهة جاهزة', value: 'Ready' },
    ],
    trustMessage: 'كل طلب خاص يحتاج هدوءاً ووضوحاً، والواجهة مصممة على هذا الأساس.',
  },
  experiences: {
    slug: 'experiences',
    title: 'التجارب',
    eyebrow: 'DIR3 EXPERIENCES',
    description: 'تجارب ثقافية وترفيهية مختارة تعكس روح السعودية مع تفاصيل عرض نظيفة وفاخرة.',
    highlight: 'المحتوى هنا مهيأ للتوسع إلى تجارب موسمية وفعاليات متغيرة من دون تغيير النظام البصري.',
    chips: ['ثقافة', 'فعاليات', 'رحلات خاصة'],
    stats: [
      { label: 'تجارب مختارة', value: '48' },
      { label: 'مواسم نشطة', value: 'Year-Round' },
      { label: 'عرض مرن', value: 'Dynamic' },
    ],
    trustMessage: 'التجربة المميزة لا تحتاج صخباً؛ تحتاج عرضاً مقنعاً ومحترماً للوقت.',
  },
  offers: {
    slug: 'offers',
    title: 'العروض',
    eyebrow: 'DIR3 OFFERS',
    description: 'عروض موسمية وتنفيذية تعرض القيمة بوضوح وتحافظ على لغة الثقة التي اعتمدتها dir3com.',
    highlight: 'تمهيد بصري لعروض قابلة للربط بالكتالوج أو الحملات لاحقاً من دون ازدواجية في المكونات.',
    chips: ['موسمي', 'تنفيذي', 'عائلي'],
    stats: [
      { label: 'عروض مميزة', value: 'New' },
      { label: 'جاهزية التوسع', value: 'Campaign' },
      { label: 'وضوح القيمة', value: 'High' },
    ],
    trustMessage: 'العرض الجيد يشرح القيمة أولاً ويحافظ على الشفافية حتى النهاية.',
  },
};

export const publicQuickLinks = [
  { label: 'الخدمات', href: '/services' },
  { label: 'السيارات', href: '/cars' },
  { label: 'الفنادق', href: '/hotels' },
  { label: 'الشقق', href: '/apartments' },
  { label: 'المطار', href: '/airport-transfers' },
  { label: 'الكونسيرج', href: '/concierge' },
  { label: 'التجارب', href: '/experiences' },
  { label: 'العروض', href: '/offers' },
  { label: 'من نحن', href: '/about' },
  { label: 'تواصل', href: '/contact' },
];