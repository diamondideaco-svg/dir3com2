'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiClock, FiFileText, FiHelpCircle, FiMessageCircle, FiShield, FiWifiOff } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { findPolicySections, type PolicySection } from '@/lib/ai2/policy-content';
import { cn } from '@/lib/utils';

type JourneyState = 'idle' | 'loading' | 'offline' | 'session-expired' | 'no-results' | 'error' | 'unable-to-determine' | 'ready';

type JourneyStep = {
  id: string;
  titleAr: string;
  titleEn: string;
  description: string;
  route: string;
  state: JourneyState;
  detail: string;
};

const journeySteps: JourneyStep[] = [
  {
    id: 'welcome',
    titleAr: 'الترحيب',
    titleEn: 'Welcome',
    description: 'افتتاح هادئ يعرّف المستخدم بالدبرة ويذكر نطاقه الآمن.',
    route: '/ai/pilot',
    state: 'ready',
    detail: 'الترحيب يبدأ من هوية ثابتة، ونبرة واضحة، ووعد بعدم تجاوز المصادر المعتمدة.',
  },
  {
    id: 'intent',
    titleAr: 'تحديد النية',
    titleEn: 'Intent',
    description: 'جمع الحد الأدنى من السياق: خدمة، وجهة، وتوقيت.',
    route: '/services',
    state: 'loading',
    detail: 'إذا كانت النية ناقصة، يطلب الدبرة أقل قدر من المعلومات بدل التخمين.',
  },
  {
    id: 'services',
    titleAr: 'اختيار الخدمة',
    titleEn: 'Service choice',
    description: 'اقتراح خدمات مناسبة اعتمادًا على الكتالوج المصرح به فقط.',
    route: '/services',
    state: 'ready',
    detail: 'تظهر هنا الخدمات المطابقة دون أسعار أو وعود غير موجودة في البيانات المعتمدة.',
  },
  {
    id: 'booking',
    titleAr: 'الحجز',
    titleEn: 'Booking',
    description: 'إشارة إلى المسار التشغيلي للحجز مع تجنب أي كتابة مباشرة.',
    route: '/booking',
    state: 'unable-to-determine',
    detail: 'الدبرة يوجّه المستخدم إلى المسار الصحيح ويشرح ما يحتاجه لإكمال الطلب.',
  },
  {
    id: 'documents',
    titleAr: 'رفع المستندات',
    titleEn: 'Documents',
    description: 'مراجعة المستندات المطلوبة ضمن صفحة المستندات الخاصة بالمستخدم.',
    route: '/my-documents',
    state: 'ready',
    detail: 'المرحلة تعتمد على المستندات المصرح بها فقط، مع تنبيه واضح إذا كان الملف مفقودًا أو غير صالح.',
  },
  {
    id: 'tracking',
    titleAr: 'متابعة الطلب',
    titleEn: 'Tracking',
    description: 'عرض تقدم الطلب والحالة الحالية دون ادعاء إغلاق غير مؤكد.',
    route: '/my-bookings',
    state: 'no-results',
    detail: 'إذا لم يجد الدبرة طلبًا مطابقًا، يشرح أن النتيجة غير متاحة بدل توليد نتيجة وهمية.',
  },
  {
    id: 'contact',
    titleAr: 'التواصل مع الدبرة',
    titleEn: 'Talk to DABRA',
    description: 'قناة محادثة آمنة لإيضاح الخطوة التالية أو طلب التوضيح.',
    route: '/ai/pilot',
    state: 'session-expired',
    detail: 'إذا انتهت الجلسة أو فُقد السياق، يعيد المستخدم إلى نقطة دخول واضحة مع رسالة مباشرة.',
  },
  {
    id: 'confirmation',
    titleAr: 'استلام التأكيد',
    titleEn: 'Confirmation',
    description: 'تجميع التأكيدات النهائية ورسائل المتابعة في نهاية الرحلة.',
    route: '/my-account',
    state: 'error',
    detail: 'عند الخطأ، تُعرض رسالة صريحة مع مسار بديل بدل إسقاط المستخدم في حالة غامضة.',
  },
];

const stateLabels: Record<JourneyState, string> = {
  idle: 'جاهز',
  loading: 'جاري التحضير',
  offline: 'غير متصل',
  'session-expired': 'انتهت الجلسة',
  'no-results': 'لا توجد نتائج',
  error: 'خطأ',
  'unable-to-determine': 'تعذر التحديد',
  ready: 'مكتمل',
};

const stateIcons: Record<JourneyState, typeof FiCheckCircle> = {
  idle: FiHelpCircle,
  loading: FiClock,
  offline: FiWifiOff,
  'session-expired': FiAlertTriangle,
  'no-results': FiFileText,
  error: FiAlertTriangle,
  'unable-to-determine': FiHelpCircle,
  ready: FiCheckCircle,
};

const scenarioCards = [
  {
    title: 'Loading',
    description: 'يظهر عندما ينتظر الدبرة البيانات أو التهيئة الأولى.',
    state: 'loading' as const,
    targetStepId: 'intent',
  },
  {
    title: 'Offline',
    description: 'رسالة واضحة عندما لا يمكن الوصول إلى المصدر أو الشبكة.',
    state: 'offline' as const,
    targetStepId: 'services',
  },
  {
    title: 'Session expired',
    description: 'إعادة توجيه مهذبة إلى نقطة دخول مع الحفاظ على السياق.',
    state: 'session-expired' as const,
    targetStepId: 'contact',
  },
  {
    title: 'No results',
    description: 'لا يوجد ادعاء زائف؛ يتم شرح أن النتيجة غير متاحة الآن.',
    state: 'no-results' as const,
    targetStepId: 'tracking',
  },
  {
    title: 'Unable to determine',
    description: 'عند نقص البيانات، يطلب الدبرة الحد الأدنى من التوضيح.',
    state: 'unable-to-determine' as const,
    targetStepId: 'booking',
  },
];

const safetyNotes = [
  'لا يوجد تنفيذ لكتابة الحجز أو الدفع من هذه الواجهة.',
  'المخرجات مبنية على المصادر المعتمدة فقط أو على عدم اليقين الصريح.',
  'RTL افتراضي، مع دعم لطيف لعرض English labels عند الحاجة.',
];

function stateBadgeClass(state: JourneyState) {
  if (state === 'ready') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100';
  if (state === 'loading') return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
  if (state === 'offline' || state === 'error') return 'border-rose-500/20 bg-rose-500/10 text-rose-100';
  return 'border-white/12 bg-white/8 text-[var(--color-light)]';
}

function summaryForSection(section: PolicySection) {
  return section.points.slice(0, 2).join(' ');
}

export default function DabraJourneyPanel() {
  const [selectedStepId, setSelectedStepId] = useState(journeySteps[0].id);
  const [selectedTopic, setSelectedTopic] = useState('booking');
  const [online, setOnline] = useState(true);
  const [previewState, setPreviewState] = useState<JourneyState | null>(null);

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const selectedStep = useMemo(
    () => journeySteps.find((step) => step.id === selectedStepId) ?? journeySteps[0],
    [selectedStepId],
  );

  const approvedSections = useMemo(() => findPolicySections(selectedTopic), [selectedTopic]);
  const currentState: JourneyState = !online ? 'offline' : previewState ?? selectedStep.state;
  const StateIcon = stateIcons[currentState];

  return (
    <section className="relative isolate overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(13,27,42,0.08),transparent_25%)]" />
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <Card className="overflow-hidden border-[var(--color-gold)]/18 bg-[linear-gradient(180deg,rgba(255,253,247,0.98)_0%,rgba(248,245,239,0.92)_100%)]">
            <CardHeader className="border-b border-[color:var(--color-border)]/70 pb-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-gold)]/18 bg-[var(--color-gold)]/10 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-[var(--color-gold)]" translate="no">
                <HiSparkles /> DABRA UX-001
              </div>
              <CardTitle className="mt-4 text-3xl font-semibold text-[var(--color-navy)] sm:text-4xl">
                رحلة DABRA المكوّنة من ثماني خطوات
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-8">
                هذه الواجهة تجمع المسار الكامل من الترحيب حتى التأكيد، مع حالات واضحة للتحميل والانقطاع وعدم اليقين، من دون فتح أي مسار كتابة أو دفع غير معتمد.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {safetyNotes.map((note) => (
                  <div key={note} className="rounded-[22px] border border-[color:var(--color-border)] bg-white/82 px-4 py-4 text-sm leading-7 text-[var(--color-navy)] shadow-[0_12px_28px_rgba(13,27,42,0.06)]">
                    {note}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {journeySteps.map((step, index) => {
                  const Icon = stateIcons[step.state];
                  const isActive = step.id === selectedStep.id;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        setPreviewState(null);
                        setSelectedStepId(step.id);
                      }}
                      className={cn(
                        'group rounded-[24px] border p-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45',
                        isActive
                          ? 'border-[var(--color-gold)]/35 bg-[var(--color-gold)]/10 shadow-[0_18px_38px_rgba(212,175,55,0.12)]'
                          : 'border-[color:var(--color-border)] bg-white/78 hover:border-[var(--color-gold)]/25 hover:bg-white',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-light)]">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-navy)]">{step.titleAr}</p>
                            <p className="text-xs text-[var(--color-muted)]" translate="no">{step.titleEn}</p>
                          </div>
                        </div>
                        <Icon className={isActive ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'} />
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{step.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                        <span className={cn('rounded-full border px-3 py-1.5 font-semibold', stateBadgeClass(step.state))}>
                          {stateLabels[step.state]}
                        </span>
                        <span className="inline-flex items-center gap-2 text-[var(--color-muted)]" translate="no">
                          {step.route}
                          <FiArrowLeft />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[28px] border border-[color:var(--color-border)] bg-[linear-gradient(180deg,rgba(13,27,42,0.98)_0%,rgba(18,35,52,0.96)_100%)] p-5 text-[var(--color-light)] shadow-[0_24px_55px_rgba(13,27,42,0.16)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-[var(--color-light)]/80" translate="no">
                      <StateIcon /> {stateLabels[currentState]}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold">{selectedStep.titleAr}</h3>
                    <p className="mt-2 text-sm text-white/72" translate="no">
                      {selectedStep.titleEn}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-3 text-sm leading-7 text-white/78">
                    {selectedStep.detail}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link href={selectedStep.route} className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'justify-center')}>
                    الانتقال إلى المسار
                    <FiArrowLeft />
                  </Link>
                  <Link href="/ai/pilot" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'justify-center bg-white/95')}>
                    <FiMessageCircle />
                    افتح الدبرة
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden border-[var(--color-gold)]/18 bg-[linear-gradient(180deg,#fffaf0_0%,#f8f1df_100%)]">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl text-[var(--color-navy)]">حالات التشغيل</CardTitle>
                <CardDescription>
                  مجموعة الحالات التي يجب أن يتعامل معها DABRA بوضوح بدل التخمين أو التوليد العشوائي.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {scenarioCards.map((card) => {
                  const Icon = stateIcons[card.state];
                  return (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => {
                        setSelectedStepId(card.targetStepId);
                        setPreviewState(card.state);
                      }}
                      className="flex w-full items-start gap-3 rounded-[22px] border border-[color:var(--color-border)] bg-white/82 px-4 py-4 text-right transition hover:border-[var(--color-gold)]/25 hover:bg-white"
                    >
                      <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-light)]">
                        <Icon />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--color-navy)]">{card.title}</span>
                        <span className="mt-1 block text-sm leading-7 text-[var(--color-muted)]">{card.description}</span>
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-[var(--color-gold)]/16 bg-[var(--color-navy)] text-[var(--color-light)]">
              <CardHeader className="pb-4">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-gold)]/24 bg-[var(--color-gold)]/12 px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-[var(--color-gold)]" translate="no">
                  <FiShield /> APPROVED SOURCES
                </div>
                <CardTitle className="text-2xl">مراجع معتمدة للعرض</CardTitle>
                <CardDescription className="text-[var(--color-light)]/70">
                  يظهر ما يطابق النية الحالية فقط، مع تفاصيل متفائلة لكن غير متخيلة.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap gap-2">
                  {['booking', 'documents', 'refund'].map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setSelectedTopic(topic)}
                      className={cn(
                        'rounded-full border px-4 py-2 text-sm transition',
                        selectedTopic === topic
                          ? 'border-[var(--color-gold)]/35 bg-[var(--color-gold)]/14 text-[var(--color-light)]'
                          : 'border-white/10 bg-white/5 text-[var(--color-light)]/78 hover:border-[var(--color-gold)]/25 hover:text-[var(--color-gold)]',
                      )}
                    >
                      {topic === 'booking' ? 'الحجز' : topic === 'documents' ? 'المستندات' : 'الاسترجاع'}
                    </button>
                  ))}
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-[var(--color-light)]/78">
                  {approvedSections.length ? approvedSections[0].title : 'لا توجد نتيجة مطابقة'}
                  <p className="mt-2 text-[var(--color-light)]/66">{approvedSections.length ? summaryForSection(approvedSections[0]) : 'الدبرة يطلب توضيحًا إضافيًا بدل الاصطناع.'}</p>
                </div>

                <div className="grid gap-3">
                  {approvedSections.slice(0, 3).map((section) => (
                    <div key={section.title} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-[var(--color-light)]/80">
                      <p className="font-semibold text-[var(--color-light)]">{section.title}</p>
                      <p className="mt-2 text-[var(--color-light)]/68">{section.points[0]}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
