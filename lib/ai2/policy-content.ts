export type PolicySection = {
  title: string;
  points: string[];
  sourceSlug: string;
  tags: string[];
};

export const APPROVED_POLICY_CONTENT: PolicySection[] = [
  {
    title: 'الخصوصية: جمع البيانات',
    sourceSlug: '/privacy',
    tags: ['privacy', 'خصوصية', 'data', 'بيانات'],
    points: [
      'تجمع المنصة بيانات تشغيلية لازمة مثل بيانات التواصل وبيانات الحجز والمرجع الزمني للطلبات.',
      'يتم تقييد البيانات الحساسة ومعالجتها ضمن الحد الأدنى اللازم لتقديم الخدمة.',
    ],
  },
  {
    title: 'الخصوصية: استخدام البيانات',
    sourceSlug: '/privacy',
    tags: ['privacy', 'خصوصية', 'use', 'استخدام'],
    points: [
      'تستخدم البيانات لإتمام الطلبات والتحقق الأمني وتحسين جودة الخدمة ودعم العملاء.',
      'لا يستخدم المحتوى خارج نطاق التشغيل المشروع إلا بموافقة صريحة أو التزام نظامي.',
    ],
  },
  {
    title: 'الاسترجاع: مبادئ عامة',
    sourceSlug: '/refund-policy',
    tags: ['refund', 'استرجاع', 'return'],
    points: [
      'الاسترجاع يعتمد على نتيجة طلب الإلغاء وحالة التنفيذ الفعلية وشروط المزود.',
      'تتم متابعة حالة الاسترجاع عبر مرجع الحجز من خلال الدعم الرسمي.',
    ],
  },
  {
    title: 'الإلغاء: مبادئ عامة',
    sourceSlug: '/cancellation-policy',
    tags: ['cancel', 'cancellation', 'إلغاء'],
    points: [
      'طلبات الإلغاء تخضع لحالة الحجز وموعد الخدمة ونوع المنتج أو المزود.',
      'إرسال طلب الإلغاء لا يعني الاعتماد النهائي قبل التأكيد الرسمي من المنصة.',
    ],
  },
  {
    title: 'الشروط: الحجز والتأكيد',
    sourceSlug: '/terms',
    tags: ['terms', 'شروط', 'booking', 'حجز'],
    points: [
      'إنشاء طلب الحجز لا يعني تأكيدا نهائيا قبل التحقق التشغيلي من التوفر والسعر.',
      'مرجع الحجز هو الوسيلة المعتمدة لمتابعة الحالة مع الدعم.',
    ],
  },
  {
    title: 'المستندات: الرفع والمعالجة',
    sourceSlug: '/privacy',
    tags: ['documents', 'document', 'docs', 'مستندات', 'مستند', 'رفع'],
    points: [
      'ترفع المستندات المطلوبة فقط ضمن المسار المخصص للمستخدم وضمن الحد الأدنى اللازم لتنفيذ الطلب أو التحقق.',
      'تتم معالجة المستندات ضمن الضوابط التشغيلية والخصوصية المعتمدة، ولا يعني الرفع وحده اعتماد الطلب نهائيا.',
    ],
  },
  {
    title: 'الأسئلة الشائعة',
    sourceSlug: '/#faq',
    tags: ['faq', 'الأسئلة', 'شائعة'],
    points: [
      'البداية تكون من الصفحة الرئيسية أو عبر التواصل المباشر مع فريق dir3com.',
      'الخدمات قابلة للتخصيص حسب الاحتياج والميزانية.',
      'الدعم يستهدف الاستجابة السريعة والمتابعة المستمرة.',
    ],
  },
];

export function findPolicySections(topic?: string) {
  const normalized = (topic ?? '').trim().toLowerCase();

  if (!normalized) {
    return APPROVED_POLICY_CONTENT;
  }

  return APPROVED_POLICY_CONTENT.filter((section) =>
    section.tags.some((tag) => tag === normalized || tag.includes(normalized) || normalized.includes(tag)),
  );
}
