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
import { useLanguage } from '@/components/i18n/LanguageProvider';

type ServiceProduct = {
  id: string;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  price_per_unit?: number | null;
  unit_type?: string | null;
  slug?: string | null;
  partner?: { name_ar?: string | null; name_en?: string | null } | null;
  region?: { name_ar?: string | null; name_en?: string | null } | null;
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
  if (unitType === 'day') return { ar: 'يوم', en: 'day' };
  if (unitType === 'night') return { ar: 'ليلة', en: 'night' };
  if (unitType === 'trip') return { ar: 'رحلة', en: 'trip' };
  return { ar: unitType || 'وحدة', en: unitType || 'unit' };
}

function localized(ar: string | null | undefined, en: string | null | undefined, language: 'ar' | 'en', fallback: string) {
  const preferred = language === 'ar' ? ar : en;
  const alternate = language === 'ar' ? en : ar;
  return preferred?.trim() || alternate?.trim() || fallback;
}

const detailTermTranslations: Record<string, string> = {
  'سائق خاص': 'Private driver',
  'تنقلات مطار': 'Airport transfers',
  'سيارات تنفيذية': 'Executive cars',
  'إقامة فاخرة': 'Luxury stays',
  'مرونة الحجز': 'Flexible booking',
  'خيارات عائلية': 'Family options',
  'استقبال': 'Meet and greet',
  'مسار سريع': 'Fast lane',
  'تنسيق وصول': 'Arrival coordination',
  السيارات: 'Cars',
  الفنادق: 'Hotels',
  الشقق: 'Apartments',
  'النقل من وإلى المطار': 'Airport transfers',
  الكونسيرج: 'Concierge',
  التجارب: 'Experiences',
  العروض: 'Offers',
};

function presentDetailTerm(value: string, language: 'ar' | 'en') {
  return language === 'en' ? detailTermTranslations[value] || value : value;
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

const staticReviewsEn = [
  { author: 'Guest from Riyadh', text: 'The experience was clear and well organised, giving me confidence from the first step.' },
  { author: 'Business traveller', text: 'A polished, fast experience that made choosing the right service simple.' },
  { author: 'Family from Jeddah', text: 'The details were presented beautifully, with everything important easy to find.' },
];

const staticFaqEn = [
  { question: 'Are all fees included in the price?', answer: 'The base price is shown clearly, with each product detail available before booking.' },
  { question: 'Can I compare more than one option?', answer: 'Yes. Products use a consistent structure to make comparison quick and clear.' },
  { question: 'Is this section connected to the operating system?', answer: 'This is the approved service presentation layer; booking behavior remains unchanged.' },
];

const trustItemsEn = [
  { title: 'Clear pricing', note: 'The price is clear before you take the next step, with unit and partner details visible.' },
  { title: 'Review before payment', note: 'Review every option in a calm, easy-to-read experience.' },
  { title: 'Reliable support', note: 'When something needs attention, dir3com is here to help.' },
];

const detailCopy = {
  ar: {
    back: 'العودة إلى الخدمات', shield: 'ضمان الدرع', promise: 'الخدمة أول... والحساب بعد رضاك.', overview: 'نظرة عامة على الخدمة', inclusions: 'المزايا والتضمينات', highlights: 'أهم المميزات', gallery: 'معرض الخدمة', galleryDescription: 'صور مختارة لعرض التجربة بأسلوب راقٍ ومرتب.', noImage: 'لا توجد صورة حالياً', noImages: 'لا توجد صور متاحة', noImagesDescription: 'سيظهر معرض الصور فور توفر صور المنتجات.', assurance: 'ضمان الدرع والثقة', assuranceDescription: 'الضمان الموثوق، الوضوح المالي، والالتزام بجودة التجربة.', protected: 'رحلتكم محمية بضمان الدرع.', trust: 'إذا صار شيء... حنا معك.', reviews: 'آراء وتقييمات', reviewsDescription: 'انطباعات المستخدمين ضمن تجربة عرض راقية وموحدة.', faq: 'الأسئلة الشائعة', faqDescription: 'إجابات مختصرة تساعدك على اتخاذ قرار أسرع بثقة أعلى.', payment: 'طرق الدفع والضمان', paymentDescription: 'واجهات دفع محلية موثوقة مصممة للسوق الخليجي.', related: 'خدمات مشابهة', relatedDescription: 'خيارات قريبة من نفس التجربة لتوسيع اختياراتك.', explore: 'استكشف الخدمة', bookingOptions: 'خيارات الحجز المتاحة', book: 'احجز الآن', partner: 'الشريك', approvedPartner: 'شريك معتمد من dir3com', productFallback: 'منتج dir3com', productDescription: 'وصف الخدمة سيظهر هنا عند توفر البيانات.', region: 'السعودية', per: 'لكل', noService: 'الخدمة غير متاحة حالياً', noServiceDescription: 'تعذر العثور على الخدمة المطلوبة.', loading: 'جاري تحميل الخدمة', failed: 'الخدمة غير موجودة حالياً', featureFallback: 'دعم ضيافة مخصص', ctaTitle: 'استكشف الخدمة ثم انتقل إلى الحجز عندما تكون جاهزاً.', ctaDescription: 'صفحة التفاصيل جزء من نظام dir3com العام، مع مكونات واضحة قابلة للتوسع.'
  },
  en: {
    back: 'Back to services', shield: 'Shield assurance', promise: 'Service first, with settlement after you are satisfied.', overview: 'Service overview', inclusions: 'Benefits and inclusions', highlights: 'Key highlights', gallery: 'Service gallery', galleryDescription: 'Selected images that present the experience with clarity and care.', noImage: 'No image available', noImages: 'No images available', noImagesDescription: 'The gallery will appear when product images are available.', assurance: 'Shield assurance and trust', assuranceDescription: 'Reliable assurance, financial clarity, and a commitment to quality.', protected: 'Your journey is protected by the shield.', trust: 'We are here with you when something needs attention.', reviews: 'Reviews and ratings', reviewsDescription: 'Guest impressions in one clear, refined experience.', faq: 'Frequently asked questions', faqDescription: 'Short answers to help you decide with confidence.', payment: 'Payment and assurance', paymentDescription: 'Trusted local payment options designed for the Gulf market.', related: 'Related services', relatedDescription: 'Nearby options from the same experience to broaden your choices.', explore: 'Explore service', bookingOptions: 'Available booking options', book: 'Book now', partner: 'Partner', approvedPartner: 'Approved dir3com partner', productFallback: 'dir3com product', productDescription: 'Service details will appear here when available.', region: 'Saudi Arabia', per: 'per', noService: 'Service unavailable', noServiceDescription: 'We could not find the requested service.', loading: 'Loading service', failed: 'The service could not be found right now.', featureFallback: 'Dedicated hospitality support', ctaTitle: 'Explore the service, then continue to booking when you are ready.', ctaDescription: 'This detail page belongs to the shared dir3com system, with clear components ready to grow.'
  },
} as const;

export default function PublicServiceDetailClient({ slug }: { slug: string }) {
  const { language, direction } = useLanguage();
  const t = detailCopy[language];
  const displayedTrustItems = language === 'ar' ? trustItems : trustItemsEn;
  const displayedReviews = language === 'ar' ? staticReviews : staticReviewsEn;
  const displayedFaq = language === 'ar' ? staticFaq : staticFaqEn;
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
          throw new Error(language === 'ar' ? 'الخدمة غير موجودة حالياً' : 'The service could not be found right now.');
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
  }, [language, slug]);

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
  const features = marketplaceService?.tags?.length ? marketplaceService.tags.map((tag) => presentDetailTerm(tag, language)) : language === 'ar' ? fallbackInclusions : ['Dedicated support', 'Fast clear confirmation', 'A refined booking experience'];
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
          <EmptyState title={t.noService} description={error ?? t.noServiceDescription} />
          <Link href="/services" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-6`}>
            {t.back}
          </Link>
        </ContentContainer>
      </SectionContainer>
    );
  }

  const service_ = resolvedService;

  return (
    <div className="page-stack-shell" dir={direction}>
      <SectionContainer className="pb-10 pt-8 lg:pt-12">
        <ContentContainer>
          <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold)] transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35">
            <FiArrowLeft /> {t.back}
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
                {marketplaceService?.familyLabel ?? service_.badge ?? (language === 'ar' ? 'تفاصيل الخدمة' : 'Service details')}
              </p>
              <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)] sm:text-5xl">{localized(service_.name_ar, service_.name_en, language, language === 'ar' ? 'خدمة dir3com' : 'dir3com service')}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
                {localized(service_.description_ar, service_.description_en, language, language === 'ar' ? 'تفاصيل الخدمة ستظهر هنا.' : 'Service details will appear here.')}
              </p>
              {marketplaceService ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Chip className="bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-navy)]">
                    {presentDetailTerm(marketplaceService.categoryLabel, language)}
                  </Chip>
                  {marketplaceService.tags.map((tag) => (
                    <Chip key={tag} className="px-4 text-sm font-medium text-[var(--color-muted)]">
                      {presentDetailTerm(tag, language)}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            <HeroBlock>
              <div>
                <Badge className="border-[color:var(--color-border)] bg-[var(--color-surface)] text-sm">
                  <FiShield /> {t.shield}
                </Badge>
                <p className="mt-5 text-2xl font-semibold leading-[1.5]">{t.promise}</p>
                {marketplaceService ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/72">
                    <div className="rounded-[20px] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      {marketplaceService.featured ? (language === 'ar' ? 'خدمة مميزة' : 'Featured service') : (language === 'ar' ? 'خدمة موثوقة' : 'Trusted service')}
                    </div>
                    <div className="rounded-[20px] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      {marketplaceService.recommended ? (language === 'ar' ? 'موصى بها' : 'Recommended') : (language === 'ar' ? 'خيار متاح' : 'Available option')}
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-sm leading-8 text-white/72">
                  {language === 'ar' ? 'تعرض هذه الصفحة الأسعار والموردين والصور ضمن تجربة dir3com واضحة.' : 'This page presents prices, partners, and images in one clear dir3com experience.'}
                </p>
              </div>
            </HeroBlock>
          </div>
        </ContentContainer>
      </SectionContainer>

      <div className="luxury-section-shell">
        <SectionContainer className="py-8">
          <ContentContainer>
            <SectionTitle>{t.gallery}</SectionTitle>
            <SectionDescription>{t.galleryDescription}</SectionDescription>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <SectionSurface className="overflow-hidden p-0">
                {mainImage ? (
                  <div className="relative h-[320px] w-full sm:h-[420px]">
                    <Image src={mainImage} alt={service_.name_ar ?? 'خدمة dir3com'} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-muted)] sm:h-[420px]">
                    {t.noImage}
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
                        aria-label={`${language === 'ar' ? 'عرض صورة' : 'View image'} ${index + 1}`}
                        aria-pressed={mainImage === image}
                        className={`relative h-28 overflow-hidden rounded-[18px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 sm:h-32 ${mainImage === image ? 'border-[var(--color-gold)]' : 'border-[color:var(--color-border)]'}`}
                      >
                        <Image src={image} alt={`${language === 'ar' ? 'صورة' : 'Image'} ${index + 1}`} fill className="object-cover" unoptimized />
                      </button>
                    ))
                  ) : (
                    <EmptyState title={t.noImages} description={t.noImagesDescription} className="col-span-2" />
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
                title={t.overview}
                description={localized(service_.description_ar, service_.description_en, language, language === 'ar' ? 'تفاصيل الخدمة ستظهر هنا.' : 'Service details will appear here.')}
              />
              <ServiceComponent
                title={t.inclusions}
                description={language === 'ar' ? 'تجربة تشغيلية مصممة لتكون واضحة وأنيقة.' : 'A clear, polished experience designed for every dir3com surface.'}
              />
              <SectionSurface>
                <p className="text-base font-semibold text-[var(--color-navy)]">{t.highlights}</p>
                <div className="mt-4 space-y-2">
                  {features.map((feature) => (
                    <p key={feature} className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                      <FiCheckCircle className="text-[var(--color-gold)]" /> {feature}
                    </p>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(language === 'ar' ? fallbackInclusions : ['Dedicated support', 'Fast clear confirmation', 'A refined booking experience']).map((item) => (
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
              <SectionTitle>{t.assurance}</SectionTitle>
              <SectionDescription>{t.assuranceDescription}</SectionDescription>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ShieldGuaranteeComponent message={t.protected} />
                <TrustPill>
                  {t.trust}
                </TrustPill>
              </div>
            </SectionSurface>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {displayedTrustItems.map((item) => (
                <TrustComponent key={item.title} title={item.title} note={item.note} />
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>{t.reviews}</SectionTitle>
            <SectionDescription>{t.reviewsDescription}</SectionDescription>
            <div className="mt-4 inline-flex items-center gap-2 text-[var(--color-gold)]">
              {Array.from({ length: 5 }).map((_, index) => (
                <FiStar key={index} />
              ))}
              <span className="me-2 text-sm font-semibold text-[var(--color-navy)]">4.9 / 5</span>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {displayedReviews.map((review) => (
                <ReviewComponent key={review.author} author={review.author} text={review.text} />
              ))}
            </div>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>{t.faq}</SectionTitle>
            <SectionDescription>{t.faqDescription}</SectionDescription>
            <div className="mt-6 space-y-3">
              {displayedFaq.map((item) => (
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
              <SectionTitle>{t.payment}</SectionTitle>
              <SectionDescription>{t.paymentDescription}</SectionDescription>
              <div className="mt-5">
                <PaymentComponent methods={paymentMethods} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <PartnerComponent name={localized(products[0]?.partner?.name_ar, products[0]?.partner?.name_en, language, t.approvedPartner)} detail={language === 'ar' ? 'مراجعة الجودة تتم ضمن معايير dir3com المعتمدة.' : 'Quality review follows approved dir3com standards.'} />
                <AppDownloadComponent title={language === 'ar' ? 'تابع الخدمة من التطبيق' : 'Continue in the app'} note={language === 'ar' ? 'واجهة جاهزة لإدارة الخدمات والحجوزات بسهولة من شاشة واحدة.' : 'Manage services and bookings easily from one screen.'} />
              </div>
            </SectionSurface>
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionTitle>{t.related}</SectionTitle>
            <SectionDescription>{t.relatedDescription}</SectionDescription>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {relatedServices.map((item) => (
                <SectionSurface key={item.id}>
                  <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">{item.familyLabel}</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-navy)]">{item.title}</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{item.description}</p>
                  <Link href={item.href} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-5 w-full`}>
                    {t.explore}
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
              <SectionTitle>{t.bookingOptions}</SectionTitle>
            ) : null}

            {products.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <SectionSurface key={product.id} className="overflow-hidden">
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{localized(product.name_ar, product.name_en, language, t.productFallback)}</p>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                      {product.partner?.name_ar || product.partner?.name_en ? `${t.partner}: ${localized(product.partner.name_ar, product.partner.name_en, language, t.approvedPartner)}` : t.approvedPartner}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{localized(product.description_ar, product.description_en, language, t.productDescription)}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-2"><FiMapPin /> {localized(product.region?.name_ar, product.region?.name_en, language, t.region)}</span>
                      <span className="text-xl font-semibold text-[var(--color-gold)]">
                        {product.price_per_unit ?? '--'} ر.س
                        <span className="me-1 text-xs text-[var(--color-muted)]">/ {unitLabel(product.unit_type)[language]}</span>
                      </span>
                    </div>
                    <Link href={`/booking?product=${product.slug ?? ''}`} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-5 w-full`}>
                      {t.book}
                    </Link>
                  </SectionSurface>
                ))}
              </div>
            ) : (
              <EmptyState title={language === 'ar' ? 'لا توجد منتجات متاحة حالياً' : 'No products are currently available'} description={language === 'ar' ? 'نحدّث القائمة باستمرار، راجع الخدمة لاحقاً لعرض الخيارات الجديدة.' : 'The list is updated regularly. Please check back for new options.'} className="mt-6" />
            )}
          </ContentContainer>
        </SectionContainer>
      </div>

      <div className="luxury-section-shell">
        <PublicRouteIndex />
      </div>

      <div className="luxury-section-shell">
        <PublicCtaBanner
          title={t.ctaTitle}
          description={t.ctaDescription}
        />
      </div>
    </div>
  );
}