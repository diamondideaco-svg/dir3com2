'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowLeft, FiCheckCircle, FiMapPin, FiShield, FiStar } from 'react-icons/fi';
import {
  AppDownloadComponent,
  Badge,
  Chip,
  ContentContainer,
  EmptyState,
  FaqComponent,
  HeroBlock,
  LoadingSkeletonGrid,
  PartnerComponent,
  PaymentComponent,
  ResponsiveGrid,
  ReviewComponent,
  SectionContainer,
  SectionDescription,
  SectionSurface,
  SectionTitle,
  ServiceComponent,
  ShieldGuaranteeComponent,
  TrustComponent,
  TrustPill,
} from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';
import { marketplaceCatalogEntries, normalizeMarketplaceServices } from '@/lib/marketplace/data';
import { getCanonicalService } from '@/lib/services/canonical';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';

type ServiceProduct = {
  id: string;
  name_ar?: string | null;
  description_ar?: string | null;
  price_per_unit?: number | null;
  unit_type?: string | null;
  slug?: string | null;
  partner?: { name_ar?: string | null } | null;
  region?: { name_ar?: string | null } | null;
  images?: Array<{ is_primary?: boolean | null; image_url?: string | null }>;
};

type ServiceDetail = {
  id?: string | number | null;
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  badge?: string | null;
  base_price?: number | null;
  currency?: string | null;
  featured?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  products?: ServiceProduct[];
};

function unitLabel(unitType?: string | null) {
  if (unitType === 'day') return 'يوم';
  if (unitType === 'night') return 'ليلة';
  if (unitType === 'trip') return 'رحلة';
  return unitType || 'وحدة';
}

const fallbackInclusions = ['دعم ضيافة مخصص', 'تأكيد سريع وواضح', 'تجربة حجز محسنة للمستخدم الخليجي'];

const trustItems = [
  { title: 'شفافية التسعير', note: 'السعر واضح قبل إتمام أي خطوة، مع إبراز تفاصيل الوحدة والمورد.' },
  { title: 'مراجعة قبل الدفع', note: 'يمكن مراجعة الخيارات بالتفصيل ضمن واجهة هادئة وسهلة القراءة.' },
  { title: 'دعم موثوق', note: 'إذا صار شيء... حنا معك، وفق معايير dir3com المعتمدة.' },
];

const paymentMethods = ['mada', 'Visa', 'Mastercard', 'Apple Pay', 'Tabby', 'Tamara'];

const staticReviews = [
  { author: 'ضيف من الرياض', text: 'التجربة واضحة جداً والخيارات مرتبة، حسيت بثقة من أول خطوة.' },
  { author: 'مسافر أعمال', text: 'واجهة أنيقة وسريعة، وسهلت علي اختيار الخدمة المناسبة بدون تعقيد.' },
  { author: 'عائلة من جدة', text: 'عرض التفاصيل ممتاز، وكل المعلومات الأساسية كانت قدامي بشكل مريح.' },
];

const staticFaq = [
  { question: 'هل الأسعار تشمل كل الرسوم؟', answer: 'الواجهة تعرض السعر الأساسي بوضوح، وتفاصيل كل منتج تظهر قبل الحجز.' },
  { question: 'هل يمكن مقارنة أكثر من خيار؟', answer: 'نعم، صفحة الخدمة تعرض المنتجات ضمن بنية موحدة تساعدك على المقارنة سريعاً.' },
  { question: 'هل هذا القسم مرتبط مباشرة بالنظام التشغيلي؟', answer: 'هذه الطبقة واجهة خدمة معتمدة وجاهزة للتكامل، دون تعديل على منطق الخلفية حالياً.' },
];

export default function PublicServiceDetailClient({ slug }: { slug: string }) {
  const canonical = getCanonicalService(slug);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadService() {
      try {
        const response = await fetch(`/api/services/${slug}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('الخدمة غير موجودة حالياً');
        }

        const data = (await response.json()) as ServiceDetail;
        const initialImage =
          data.products
            ?.flatMap((product) => product.images ?? [])
            .find((image) => Boolean(image?.image_url))?.image_url ?? null;

        setService(data);
        setActiveImage(initialImage);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل الخدمة');
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [slug]);

  const canonicalShell: ServiceDetail | null = canonical
    ? {
        id: `canonical-${canonical.slug}`,
        slug: canonical.slug,
        name_ar: canonical.name,
        name_en: canonical.name,
        description_ar: canonical.descriptionAr,
        description_en: canonical.descriptionEn,
        badge: canonical.eyebrow,
        currency: 'SAR',
        status: 'available',
        products: [],
      }
    : null;

  // A canonical service page must still render when inventory or the API is unavailable.
  const resolvedService = service ?? canonicalShell;
  const marketplaceService = service ? normalizeMarketplaceServices([service], false)[0] : null;
  const products = resolvedService?.products ?? [];
  const galleryImages = products
    .flatMap((product) => product.images?.map((image) => image.image_url).filter(Boolean) ?? [])
    .filter((value): value is string => Boolean(value));
  const mainImage = activeImage && galleryImages.includes(activeImage) ? activeImage : galleryImages[0] ?? null;
  const features = marketplaceService?.tags?.length ? marketplaceService.tags : fallbackInclusions;
  const relatedServices = marketplaceService
    ? [
        ...marketplaceCatalogEntries.filter(
          (entry) => entry.family === marketplaceService.family && entry.category !== marketplaceService.category
        ),
        ...marketplaceCatalogEntries.filter((entry) => entry.category !== marketplaceService.category),
      ].slice(0, 3)
    : marketplaceCatalogEntries.slice(0, 3);

  if (loading) {
    return (
      <SectionContainer className="py-16">
        <ContentContainer>
          <LoadingSkeletonGrid count={2} className="xl:grid-cols-2" />
        </ContentContainer>
      </SectionContainer>
    );
  }

  if (!resolvedService) {
    return (
      <SectionContainer className="py-16">
        <ContentContainer>
          <EmptyState title="الخدمة غير متاحة حالياً" description={error ?? 'تعذر العثور على الخدمة المطلوبة.'} />
          <Link href="/services" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-6`}>
            العودة إلى الخدمات
          </Link>
        </ContentContainer>
      </SectionContainer>
    );
  }

  const service_ = resolvedService;

  return (
    <div className="page-stack-shell">
      <SectionContainer className="pb-10 pt-8 lg:pt-12">
        <ContentContainer>
          <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold)] transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35">
            <FiArrowLeft /> العودة إلى الخدمات
          </Link>
          {canonical ? (
            <div className="mt-5 overflow-hidden rounded-[28px] border border-[color:var(--color-border)] shadow-[var(--shadow-soft)]">
              <Image
                src={canonical.hero}
                alt={canonical.name}
                width={1600}
                height={900}
                priority
                unoptimized
                className="h-auto w-full object-cover"
              />
            </div>
          ) : null}
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">
                {marketplaceService?.familyLabel ?? service_.badge ?? 'SERVICE DETAIL'}
              </p>
              <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)] sm:text-5xl">{service_.name_ar ?? 'خدمة dir3com'}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
                {service_.description_ar ?? 'تفاصيل الخدمة ستظهر هنا مع نفس اللغة البصرية المعتمدة في المنصة العامة.'}
              </p>
              {marketplaceService ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Chip className="bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-navy)]">
                    {marketplaceService.categoryLabel}
                  </Chip>
                  {marketplaceService.tags.map((tag) => (
                    <Chip key={tag} className="px-4 text-sm font-medium text-[var(--color-muted)]">
                      {tag}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            <HeroBlock>
              <div>
                <Badge className="border-[color:var(--color-border)] bg-[var(--color-surface)] text-sm">
                  <FiShield /> ضمان الدرع
                </Badge>
                <p className="mt-5 text-2xl font-semibold leading-[1.5]">الخدمة أول... والحساب بعد رضاك.</p>
                {marketplaceService ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/72">
                    <div className="rounded-[20px] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      featured: {marketplaceService.featured ? 'نعم' : 'لا'}
                    </div>
                    <div className="rounded-[20px] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      recommended: {marketplaceService.recommended ? 'نعم' : 'لا'}
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-sm leading-8 text-white/72">
                  كل بطاقة منتج هنا جاهزة لعرض الأسعار والموردين والصور ضمن نفس هيكلية dir3com دون أي تعديل على الخلفية التشغيلية.
                </p>
              </div>
            </HeroBlock>
          </div>
        </ContentContainer>
      </SectionContainer>

      <div className="luxury-section-shell">
        <SectionContainer className="py-8">
          <ContentContainer>
            <SectionTitle>معرض الخدمة</SectionTitle>
            <SectionDescription>صور مختارة لعرض التجربة بأسلوب راقٍ ومرتب.</SectionDescription>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <SectionSurface className="overflow-hidden p-0">
                {mainImage ? (
                  <div className="relative h-[320px] w-full sm:h-[420px]">
                    <Image src={mainImage} alt={service_.name_ar ?? 'خدمة dir3com'} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-muted)] sm:h-[420px]">
                    لا توجد صورة حالياً
                  </div>
                )}
              </SectionSurface>

              <SectionSurface className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.length ? (
                    galleryImages.slice(0, 6).map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => setActiveImage(image)}
                        aria-label={`عرض صورة ${index + 1}`}
                        aria-pressed={mainImage === image}
                        className={`relative h-28 overflow-hidden rounded-[18px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 sm:h-32 ${mainImage === image ? 'border-[var(--color-gold)]' : 'border-[color:var(--color-border)]'}`}
                      >
                        <Image src={image} alt={`صورة ${index + 1}`} fill className="object-cover" unoptimized />
                      </button>
                    ))
                  ) : (
                    <EmptyState title="لا توجد صور متاحة" description="سيظهر معرض الصور فور توفر صور المنتجات." className="col-span-2" />
                  )}
                </div>
              </SectionSurface>
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <ResponsiveGrid>
              <ServiceComponent
                title="نظرة عامة على الخدمة"
                description={service_.description_ar ?? 'تفاصيل الخدمة ستظهر هنا مع نفس اللغة البصرية المعتمدة في المنصة العامة.'}
              />
              <ServiceComponent
                title="المزايا والتضمينات"
                description="تجربة تشغيلية مصممة لتكون واضحة، أنيقة، وقابلة للتوسع عبر جميع واجهات dir3com." 
              />
              <SectionSurface>
                <p className="text-base font-semibold text-[var(--color-navy)]">أهم المميزات</p>
                <div className="mt-4 space-y-2">
                  {features.map((feature) => (
                    <p key={feature} className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                      <FiCheckCircle className="text-[var(--color-gold)]" /> {feature}
                    </p>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {fallbackInclusions.map((item) => (
                    <Chip key={item}>{item}</Chip>
                  ))}
                </div>
              </SectionSurface>
            </ResponsiveGrid>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionSurface>
              <SectionTitle>ضمان الدرع والثقة</SectionTitle>
              <SectionDescription>الضمان الموثوق، الوضوح المالي، والالتزام بجودة التجربة.</SectionDescription>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ShieldGuaranteeComponent message="رحلتكم محمية بضمان الدرع." />
                <TrustPill>
                  إذا صار شيء... حنا معك.
                </TrustPill>
              </div>
            </SectionSurface>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {trustItems.map((item) => (
                <TrustComponent key={item.title} title={item.title} note={item.note} />
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>آراء وتقييمات</SectionTitle>
            <SectionDescription>انطباعات المستخدمين ضمن تجربة عرض راقية وموحدة.</SectionDescription>
            <div className="mt-4 inline-flex items-center gap-2 text-[var(--color-gold)]">
              {Array.from({ length: 5 }).map((_, index) => (
                <FiStar key={index} />
              ))}
              <span className="me-2 text-sm font-semibold text-[var(--color-navy)]">4.9 / 5</span>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {staticReviews.map((review) => (
                <ReviewComponent key={review.author} author={review.author} text={review.text} />
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>الأسئلة الشائعة</SectionTitle>
            <SectionDescription>إجابات مختصرة تساعدك على اتخاذ قرار أسرع بثقة أعلى.</SectionDescription>
            <div className="mt-6 space-y-3">
              {staticFaq.map((item) => (
                <FaqComponent key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionSurface>
              <SectionTitle>طرق الدفع والضمان</SectionTitle>
              <SectionDescription>واجهات دفع محلية موثوقة مصممة للسوق الخليجي.</SectionDescription>
              <div className="mt-5">
                <PaymentComponent methods={paymentMethods} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <PartnerComponent name={products[0]?.partner?.name_ar ?? 'شريك dir3com معتمد'} detail="مراجعة الجودة تتم ضمن معايير dir3com المعتمدة." />
                <AppDownloadComponent title="تابع الخدمة من التطبيق" note="واجهة جاهزة لإدارة الخدمات والحجوزات بسهولة من شاشة واحدة." />
              </div>
            </SectionSurface>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>خدمات مشابهة</SectionTitle>
            <SectionDescription>خيارات قريبة من نفس التجربة لتوسيع اختياراتك.</SectionDescription>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {relatedServices.map((item) => (
                <SectionSurface key={item.id}>
                  <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">{item.familyLabel}</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-navy)]">{item.title}</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{item.description}</p>
                  <Link href={item.href} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-5 w-full`}>
                    استكشف الخدمة
                  </Link>
                </SectionSurface>
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer className="py-8">
          <ContentContainer>
            {products.length ? (
              <SectionTitle>خيارات الحجز المتاحة</SectionTitle>
            ) : null}

            {products.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <SectionSurface key={product.id} className="overflow-hidden">
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{product.name_ar ?? 'منتج dir3com'}</p>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                      {product.partner?.name_ar ? `الشريك: ${product.partner.name_ar}` : 'شريك معتمد من dir3com'}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{product.description_ar ?? 'وصف الخدمة سيظهر هنا عند توفر البيانات.'}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-2"><FiMapPin /> {product.region?.name_ar ?? 'السعودية'}</span>
                      <span className="text-xl font-semibold text-[var(--color-gold)]">
                        {product.price_per_unit ?? '--'} ر.س
                        <span className="me-1 text-xs text-[var(--color-muted)]">/ {unitLabel(product.unit_type)}</span>
                      </span>
                    </div>
                    <Link href={`/booking?product=${product.slug ?? ''}`} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-5 w-full`}>
                      احجز الآن
                    </Link>
                  </SectionSurface>
                ))}
              </div>
            ) : (
              <EmptyState title="لا توجد منتجات متاحة حالياً" description="نحدّث القائمة باستمرار، راجع الخدمة لاحقاً لعرض الخيارات الجديدة." className="mt-6" />
            )}
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <PublicRouteIndex />
      </div>

      <div className="luxury-section-shell">
        <PublicCtaBanner
          title="استكشف الخدمة ثم انتقل إلى الحجز عندما تكون جاهزاً."
          description="صفحة التفاصيل أصبحت جزءاً من نفس نظام dir3com العام، مع مكونات قابلة لإعادة الاستخدام وقابلة للتوسع مستقبلاً."
        />
      </div>
    </div>
  );
}