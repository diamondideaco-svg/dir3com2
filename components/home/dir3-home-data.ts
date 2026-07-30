import { marketplaceCatalogEntries } from '@/lib/marketplace/data';

export const heroHighlights = [
  'تصميم عربي RTL أولاً',
  'واجهة دفع محلية جاهزة',
  'مكونات قابلة لإعادة الاستخدام',
];

export const trustBarItems = [
  'رحلتكم محمية بضمان الدرع.',
  'قيم الخدمة قبل نحاسب.',
  'إذا صار شيء... حنا معك.',
  'فلوسك محفوظة لين تقول: تم.',
];

export const quickFilters = ['رحلات داخلية', 'فنادق', 'سيارات', 'تجارب', 'كونسيرج', 'عروض الصيف'];

export const searchFields = [
  { label: 'الوجهة', value: 'الرياض، جدة، العلا، القاهرة' },
  { label: 'نوع الخدمة', value: 'إقامة، سيارة، تجربة، استقبال مطار' },
  { label: 'التاريخ', value: 'اختر تاريخ الوصول والمغادرة' },
  { label: 'عدد الضيوف', value: 'شخصان، عائلة، أو وفد خاص' },
];

export const smartPrompts = [
  'ابحث عن إقامة فاخرة قرب الفعاليات',
  'نسّق سيارة مع استقبال مطار وخدمة كونسيرج',
  'رتّب برنامج سعودي بطابع مصري راقٍ',
];

export const shieldOffers = [
  {
    id: 'offers',
    badge: 'DIR3 Shield Plus',
    title: 'عرض الحجز المطمئن',
    description: 'باقة تقدم أفضل الخدمات مع إظهار حالة الحماية والاعتماد قبل إتمام أي خطوة مالية.',
    price: 'من 2,450 ر.س',
  },
  {
    badge: 'VIP Concierge',
    title: 'عرض الوصول التنفيذي',
    description: 'استقبال مطار، سيارة خاصة، ومتابعة رحلة مخصصة مع تغليف بصري جاهز للتفعيل التشغيلي لاحقاً.',
    price: 'من 3,900 ر.س',
  },
  {
    badge: 'Saudi Escape',
    title: 'عرض نهاية الأسبوع',
    description: 'تجربة مركبة بين الإقامة والتنقل والترفيه مع إبراز رسائل الثقة ومرونة المراجعة.',
    price: 'من 1,850 ر.س',
  },
];

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

export const partnerCards = [
  {
    name: 'نخبة الضيافة',
    city: 'الرياض',
    specialty: 'إقامة وتجارب',
    score: 'Shield 96%',
  },
  {
    name: 'مسارات الشرق',
    city: 'جدة',
    specialty: 'تنقلات ومطار',
    score: 'Shield 94%',
  },
  {
    name: 'أفق الوادي',
    city: 'العلا',
    specialty: 'تجارب خاصة',
    score: 'Shield 97%',
  },
  {
    name: 'دار النيل',
    city: 'القاهرة',
    specialty: 'امتدادات ثقافية',
    score: 'Shield 92%',
  },
];

export const articleCards = [
  {
    title: 'كيف تصمم رحلة عربية فاخرة تبدأ بالثقة؟',
    category: 'دليل',
    readTime: '4 دقائق',
    description: 'نموذج محتوى جاهز لمكتبة dir3com يشرح كيف تتحول الثقة من فكرة إلى تجربة استخدام قابلة للقياس.',
  },
  {
    title: 'أفضل مسارات الضيافة بين الرياض والعلا',
    category: 'مقال',
    readTime: '6 دقائق',
    description: 'واجهة تحريرية تعرض الوجهات والعروض والخدمات بأسلوب يتوافق مع نفس الهوية البصرية.',
  },
  {
    title: 'الدبرة: كيف سيظهر المساعد داخل الواجهة؟',
    category: 'منتج',
    readTime: '3 دقائق',
    description: 'تمهيد بصري للمساعد الودي دون أي منطق فعلي، مع مساحات واضحة للتكامل المستقبلي.',
  },
];

export const travelTips = [
  {
    title: 'رتب الوصول قبل الإقامة',
    description: 'ابدأ بخدمة dir3 airport أو dir3 drive حتى تكون بداية الرحلة هادئة ومحمية من أول خطوة.',
    label: 'نصيحة الوصول',
  },
  {
    title: 'اختر الإقامة حسب نمط الرحلة',
    description: 'dir3 stay مناسب للإقامات الفاخرة، بينما الشقق تخدم الإقامات الأطول والعائلات بمرونة أعلى.',
    label: 'نصيحة الإقامة',
  },
  {
    title: 'أضف الكونسيرج عند الحاجة',
    description: 'إذا كانت الرحلة تتضمن طلبات خاصة أو تنقلات متعددة، فإضافة dir3 concierge ترفع الانسيابية.',
    label: 'نصيحة الخدمة',
  },
];

export const appFeatures = [
  'إدارة الحجوزات والعروض من شاشة واحدة',
  'إشعارات مهيأة لرحلتك وتحديثات الخدمة',
  'وصول مستقبلي سريع إلى الدبرة من التطبيق',
];

export const paymentMethods = ['mada', 'Visa', 'Mastercard', 'STC Bank', 'Tabby', 'Tamara'];

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