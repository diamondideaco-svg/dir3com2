import { marketplaceCatalogEntries } from '@/lib/marketplace/data';

export const homeCopy = {
  ar: {
    heroHighlights: [
      'تصميم عربي RTL أولاً',
      'الدفع الإلكتروني قادم قريبًا',
      'مكونات قابلة لإعادة الاستخدام',
    ],
    trustBarItems: [
      'محمي بدرع dir3com',
      'تسعير واضح قبل أي خطوة',
      'إذا صار شيء... حنا معك',
      'نعرض السعر النهائي بوضوح قبل موافقتك.',
    ],
    quickFilters: ['رحلات داخلية', 'فنادق', 'سيارات', 'تجارب', 'كونسيرج', 'عروض مختارة'],
    searchFields: [
      { label: 'الوجهة', value: 'السعودية + مصر | الرياض، جدة، القاهرة، الإسكندرية' },
      { label: 'نوع الخدمة', value: 'إقامة، سيارة، تجربة، استقبال مطار' },
      { label: 'التاريخ', value: 'اختر تاريخ الوصول والمغادرة' },
      { label: 'عدد الضيوف', value: 'شخصان، عائلة، أو وفد خاص' },
    ],
    smartPrompts: [
      'ابحث عن إقامة فاخرة قرب الفعاليات',
      'نسّق سيارة مع استقبال مطار وخدمة كونسيرج',
      'رتّب برنامج سعودي بطابع مصري راقٍ',
    ],
    shieldOffers: [],
    partnerCards: [],
    articleCards: [
      { title: 'كيف تصمم رحلة عربية فاخرة تبدأ بالثقة؟', category: 'دليل', readTime: '4 دقائق', description: 'نموذج محتوى جاهز لمكتبة dir3com يشرح كيف تتحول الثقة من فكرة إلى تجربة استخدام قابلة للقياس.' },
      { title: 'أفضل مسارات الضيافة بين الرياض والعلا', category: 'مقال', readTime: '6 دقائق', description: 'واجهة تحريرية تعرض الوجهات والعروض والخدمات بأسلوب يتوافق مع نفس الهوية البصرية.' },
      { title: 'الدبرة: كيف سيظهر المساعد داخل الواجهة؟', category: 'منتج', readTime: '3 دقائق', description: 'تمهيد بصري للمساعد الودي دون أي منطق فعلي، مع مساحات واضحة للتكامل المستقبلي.' },
    ],
    travelTips: [
      { title: 'رتب الوصول قبل الإقامة', description: 'ابدأ بخدمة dir3 Fly أو dir3 Drive حتى تكون بداية الرحلة هادئة ومحمية من أول خطوة.', label: 'نصيحة الوصول' },
      { title: 'اختر الإقامة حسب نمط الرحلة', description: 'dir3 stay مناسب للإقامات الفاخرة، بينما الشقق تخدم الإقامات الأطول والعائلات بمرونة أعلى.', label: 'نصيحة الإقامة' },
      { title: 'أضف الكونسيرج عند الحاجة', description: 'إذا كانت الرحلة تتضمن طلبات خاصة أو تنقلات متعددة، فإضافة dir3 concierge ترفع الانسيابية.', label: 'نصيحة الخدمة' },
    ],
    appFeatures: [
      'إدارة الحجوزات والعروض من شاشة واحدة',
      'إشعارات مهيأة لرحلتك وتحديثات الخدمة',
      'وصول مستقبلي سريع إلى الدبرة من التطبيق',
    ],
  },
  en: {
    heroHighlights: [
      'Arabic-first RTL design',
      'Online payments coming soon',
      'Reusable UI components',
    ],
    trustBarItems: [
      'Protected by dir3com Shield',
      'Transparent pricing before any step',
      "If something happens, we're with you",
      'You review the final price before you accept.',
    ],
    quickFilters: ['Domestic trips', 'Hotels', 'Cars', 'Experiences', 'Concierge', 'Selected offers'],
    searchFields: [
      { label: 'Destination', value: 'Saudi Arabia + Egypt | Riyadh, Jeddah, Cairo, Alexandria' },
      { label: 'Service type', value: 'Stay, car, experience, airport meet & assist' },
      { label: 'Dates', value: 'Choose arrival and departure dates' },
      { label: 'Guests', value: 'Couple, family, or private delegation' },
    ],
    smartPrompts: [
      'Find a luxury stay near major events',
      'Arrange a car with airport meet & concierge service',
      'Plan a Saudi itinerary with refined Egyptian character',
    ],
    shieldOffers: [],
    partnerCards: [],
    articleCards: [
      { title: 'How do you design a luxury Arabic journey that starts with trust?', category: 'Guide', readTime: '4 min', description: 'A content pattern for the dir3com library that explains how trust becomes a measurable user experience.' },
      { title: 'The best hospitality routes between Riyadh and AlUla', category: 'Article', readTime: '6 min', description: 'An editorial surface for destinations, offers, and services within the same visual identity.' },
      { title: 'DABRA: how will the assistant appear inside the interface?', category: 'Product', readTime: '3 min', description: 'A visual prelude for the friendly assistant without any active logic, with clear room for future integration.' },
    ],
    travelTips: [
      { title: 'Plan arrival before stay', description: 'Start with dir3 Fly or dir3 Drive so the journey begins smoothly and protected from the first step.', label: 'Arrival tip' },
      { title: 'Choose stay by trip style', description: 'dir3 stay fits luxury stays, while apartments support longer trips and families with more flexibility.', label: 'Stay tip' },
      { title: 'Add concierge when needed', description: 'If the trip includes special requests or multiple transfers, adding dir3 concierge improves the flow.', label: 'Service tip' },
    ],
    appFeatures: [
      'Manage bookings and offers from one screen',
      'Trip-aware notifications and service updates',
      'Future quick access to DABRA from the app',
    ],
  },
} as const;

export const heroHighlights = homeCopy.ar.heroHighlights;

export const trustBarItems = homeCopy.ar.trustBarItems;

export const quickFilters = homeCopy.ar.quickFilters;

export const searchFields = homeCopy.ar.searchFields;

export const smartPrompts = homeCopy.ar.smartPrompts;

export const shieldOffers = homeCopy.ar.shieldOffers;

export const serviceCards = marketplaceCatalogEntries.map((entry) => ({
  id: entry.category,
  title: entry.title,
  description: entry.description,
  icon: entry.icon,
  href: entry.href,
  metric: entry.metric,
  category: entry.category,
  tags: entry.tags,
}));

export const partnerCards = homeCopy.ar.partnerCards;

export const articleCards = homeCopy.ar.articleCards;

export const travelTips = homeCopy.ar.travelTips;

export const appFeatures = homeCopy.ar.appFeatures;

export const paymentMethods: readonly string[] = [];

export const qrMatrix = [
  '111010101',
  '101110001',
  '111011101',
  '000101000',
  '111010111',
  '100111001',
  '111000111',
  '001011100',
  '111010111',
];