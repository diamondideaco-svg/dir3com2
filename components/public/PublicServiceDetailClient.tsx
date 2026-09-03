'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowLeft, FiMapPin } from 'react-icons/fi';
import {
  Chip,
  ContentContainer,
  EmptyState,
  HeroBlock,
  LoadingSkeletonGrid,
  PartnerComponent,
  ResponsiveGrid,
  SectionContainer,
  SectionDescription,
  SectionSurface,
  SectionTitle,
  ServiceComponent,
} from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';
import { normalizeMarketplaceServices, sanitizeMarketplaceCustomerCopy } from '@/lib/marketplace/data';
import { marketplacePrimaryAction } from '@/lib/marketplace/truth';
import { getCanonicalService } from '@/lib/services/canonical';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buildMarketplaceLoginHandoff, buildMarketplaceRequestReturnPath } from '@/lib/auth/marketplace-request-handoff';

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
  marketplace_family?: 'drive' | 'stay' | 'fly' | 'concierge' | 'vip' | null;
  fulfilment_state?: import('@/lib/marketplace/truth').MarketplaceFulfilmentState | null;
  transaction_method?: import('@/lib/marketplace/truth').MarketplaceTransactionMethod | null;
  marketplace_environment?: import('@/lib/marketplace/truth').MarketplaceEnvironment | null;
  supply_type?: import('@/lib/marketplace/truth').MarketplaceSupplyType | null;
  supplier_name?: string | null;
  supplier_verified?: boolean | null;
  cancellation_summary?: string | null;
};

function unitLabel(unitType: string | null | undefined, en: boolean) {
  if (unitType === 'day') return en ? 'day' : 'يوم';
  if (unitType === 'night') return en ? 'night' : 'ليلة';
  if (unitType === 'trip') return en ? 'trip' : 'رحلة';
  return unitType || (en ? 'unit' : 'وحدة');
}

export default function PublicServiceDetailClient({ slug }: { slug: string }) {
  const { language, direction } = useLanguage();
  const en = language === 'en';
  const canonical = getCanonicalService(slug);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [requestedFor, setRequestedFor] = useState('');
  const [travellerCount, setTravellerCount] = useState(1);
  const [requestNotes, setRequestNotes] = useState('');

  useEffect(() => {
    async function loadService() {
      try {
        const response = await fetch(`/api/services/${slug}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(en ? 'This service is not currently available' : 'الخدمة غير موجودة حالياً');
        }

        const data = (await response.json()) as ServiceDetail;
        const initialImage =
          data.products
            ?.flatMap((product) => product.images ?? [])
            .find((image) => Boolean(image?.image_url))?.image_url ?? null;

        setService(data);
        setActiveImage(initialImage);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : (en ? 'Unable to load this service' : 'تعذر تحميل الخدمة'));
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [slug, en]);

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

  if (loading) {
    return (
      <div dir={direction} lang={language}><SectionContainer className="py-16">
        <ContentContainer>
          <LoadingSkeletonGrid count={2} className="xl:grid-cols-2" />
        </ContentContainer>
      </SectionContainer></div>
    );
  }

  if (!resolvedService) {
    return (
      <div dir={direction} lang={language}><SectionContainer className="py-16">
        <ContentContainer>
          <EmptyState title={en ? 'Service currently unavailable' : 'الخدمة غير متاحة حالياً'} description={error ?? (en ? 'The requested service could not be found.' : 'تعذر العثور على الخدمة المطلوبة.')} />
          <Link href="/services" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-6`}>
            {en ? 'Back to services' : 'العودة إلى الخدمات'}
          </Link>
        </ContentContainer>
      </SectionContainer></div>
    );
  }

  const service_ = resolvedService;
  const serviceName = marketplaceService
    ? (en ? (marketplaceService.name_en ?? marketplaceService.name_ar) : marketplaceService.name_ar)
    : (en ? (service_.name_en ?? service_.name_ar) : service_.name_ar);
  const serviceDescription = marketplaceService
    ? (en ? (marketplaceService.description_en ?? marketplaceService.description_ar) : marketplaceService.description_ar)
    : sanitizeMarketplaceCustomerCopy(
        en ? (service_.description_en ?? service_.description_ar) : service_.description_ar,
        en ? 'Service details will appear when verified data is available.' : 'تظهر تفاصيل الخدمة هنا عند توفر البيانات.',
      );
  const primaryAction = service_.marketplace_family ? marketplacePrimaryAction({
    family: service_.marketplace_family,
    fulfilmentState: service_.fulfilment_state ?? 'catalog_only',
    transactionMethod: service_.transaction_method ?? 'none',
    environment: service_.marketplace_environment ?? 'production',
    supplyType: service_.supply_type ?? 'unknown',
    supplierVerified: service_.supplier_verified === true,
  }) : 'view_details';
  const submitRequest = async () => {
    if (primaryAction !== 'request_to_confirm' && primaryAction !== 'request_quote') return;

    const returnPath = buildMarketplaceRequestReturnPath({
      slug: service_.slug ?? slug,
      productId: String(service_.id),
      family: service_.marketplace_family ?? 'drive',
      intent: primaryAction,
    });

    try {
      const identityResponse = await fetch('/api/auth/session-identity', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const identity = (await identityResponse.json().catch(() => null)) as { authenticated?: boolean } | null;

      if (!identityResponse.ok || identity?.authenticated !== true) {
        window.location.assign(buildMarketplaceLoginHandoff(returnPath));
        return;
      }

      setRequestState('sending');
      const response = await fetch('/api/marketplace/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product_id: service_.id,
          request_type: primaryAction,
          requested_for: requestedFor || null,
          traveller_count: travellerCount,
          customer_brief: { notes: requestNotes },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { request?: { request_reference?: string } };
      if (response.ok && payload.request?.request_reference) {
        setRequestReference(payload.request.request_reference);
        setRequestState('sent');
      } else {
        setRequestState('error');
      }
    } catch {
      setRequestState('error');
    }
  };

  return (
    <div className={`page-stack-shell ${en ? 'text-left' : 'text-right'}`} dir={direction} lang={language}>
      <SectionContainer className="pb-10 pt-8 lg:pt-12">
        <ContentContainer>
          <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold)] transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35">
            <FiArrowLeft /> {en ? 'Back to services' : 'العودة إلى الخدمات'}
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
              <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)] sm:text-5xl">{serviceName ?? (en ? 'dir3com service' : 'خدمة dir3com')}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
                {serviceDescription ?? (en ? 'Service details will appear here when verified data is available.' : 'تفاصيل الخدمة ستظهر هنا مع نفس اللغة البصرية المعتمدة في المنصة العامة.')}
              </p>
              <div data-marketplace-critical-action className="mt-6 flex flex-wrap items-center gap-3">
                {primaryAction === 'continue_to_booking' ? (
                  <Link href={`/booking?product=${service_.slug ?? ''}`} className={buttonVariants({ variant: 'gold', size: 'lg' })}>{en ? 'Continue to booking' : 'متابعة الحجز'}</Link>
                ) : primaryAction === 'request_to_confirm' || primaryAction === 'request_quote' ? (
                  <button type="button" disabled={requestState === 'sending' || requestState === 'sent'} onClick={submitRequest} className={buttonVariants({ variant: 'gold', size: 'lg' })}>
                    {requestState === 'sent' ? (en ? 'Request submitted' : 'تم إرسال الطلب') : requestState === 'sending' ? (en ? 'Sending…' : 'جارٍ الإرسال…') : primaryAction === 'request_quote' ? (en ? 'Request a quote' : 'طلب عرض سعر') : (en ? 'Request confirmation' : 'طلب تأكيد')}
                  </button>
                ) : (
                  <span className="rounded-full border border-[color:var(--color-border)] px-5 py-3 text-sm text-[var(--color-muted)]">
                    {primaryAction === 'unavailable' ? (en ? 'Service currently unavailable' : 'الخدمة غير متاحة حاليًا') : service_.fulfilment_state === 'availability_unknown' ? (en ? 'Availability is not currently confirmed' : 'التوفر غير مؤكد حاليًا') : (en ? 'View only' : 'للاطلاع فقط')}
                  </span>
                )}
                {requestState === 'error' ? <span className="text-sm text-red-700">{en ? 'Unable to submit the request. Sign in and try again.' : 'تعذر إرسال الطلب. سجّل الدخول ثم حاول مجددًا.'}</span> : null}
                {requestReference ? <span className="text-sm font-semibold text-[var(--color-navy)]">{en ? 'Request ID' : 'رقم الطلب'}: {requestReference}</span> : null}
              </div>
              {primaryAction === 'request_to_confirm' || primaryAction === 'request_quote' ? (
                <div data-marketplace-request-form className="mt-4 grid max-w-2xl gap-3 pb-24 sm:grid-cols-2 sm:pb-0">
                  <label className="text-sm text-[var(--color-muted)]">{en ? 'Requested date' : 'التاريخ المطلوب'}
                    <input type="datetime-local" value={requestedFor} onChange={(event) => setRequestedFor(event.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-[var(--color-navy)]" />
                  </label>
                  <label className="text-sm text-[var(--color-muted)]">{en ? 'Number of travellers' : 'عدد المسافرين'}
                    <input type="number" min={1} max={99} value={travellerCount} onChange={(event) => setTravellerCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-[var(--color-navy)]" />
                  </label>
                  <label className="text-sm text-[var(--color-muted)] sm:col-span-2">{en ? 'Request details' : 'تفاصيل الطلب'}
                    <textarea value={requestNotes} maxLength={1000} onChange={(event) => setRequestNotes(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-[var(--color-navy)]" />
                  </label>
                </div>
              ) : null}
              {service_.supplier_name ? <p className="mt-4 text-sm text-[var(--color-muted)]">{en ? 'Supplier' : 'المورد'}: {service_.supplier_name}{service_.supplier_verified ? (en ? ' — verified' : ' — موثّق') : ''}</p> : null}
              {service_.cancellation_summary ? <p className="mt-2 text-sm text-[var(--color-muted)]">{en ? 'Cancellation' : 'الإلغاء'}: {service_.cancellation_summary}</p> : null}
              {marketplaceService ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Chip className="bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-navy)]">
                    {en ? ({ السيارات: 'Cars', الفنادق: 'Hotels', الشقق: 'Apartments', 'النقل من وإلى المطار': 'Airport transfers', الكونسيرج: 'Concierge', التجارب: 'Experiences', العروض: 'Offers' }[marketplaceService.categoryLabel] ?? marketplaceService.categoryLabel) : marketplaceService.categoryLabel}
                  </Chip>
                  {!en && marketplaceService.tags.map((tag) => (
                    <Chip key={tag} className="px-4 text-sm font-medium text-[var(--color-muted)]">
                      {tag}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            <HeroBlock>
              <div>
                <p className="text-sm text-white/72">{en ? 'Recorded fulfilment status' : 'حالة التنفيذ المسجلة'}</p>
                <p className="mt-4 text-2xl font-semibold leading-[1.5]">
                  {service_.fulfilment_state === 'live_bookable' ? (en ? 'Available for direct booking' : 'متاح للحجز المباشر') :
                    service_.fulfilment_state === 'verified_requestable' ? (en ? 'Confirmation request required' : 'يتطلب طلب تأكيد') :
                    service_.fulfilment_state === 'verified_quote' ? (en ? 'Quote request required' : 'يتطلب طلب عرض سعر') :
                    service_.fulfilment_state === 'unavailable' ? (en ? 'Currently unavailable' : 'غير متاح حاليًا') :
                    service_.fulfilment_state === 'availability_unknown' ? (en ? 'Availability not currently confirmed' : 'التوفر غير مؤكد حاليًا') : (en ? 'View only' : 'للاطلاع فقط')}
                </p>
              </div>
            </HeroBlock>
          </div>
        </ContentContainer>
      </SectionContainer>

      <div className="luxury-section-shell">
        <SectionContainer className="py-8">
          <ContentContainer>
            <SectionTitle>{en ? 'Service gallery' : 'معرض الخدمة'}</SectionTitle>
            <SectionDescription>{en ? 'Images supplied for this service.' : 'صور مختارة لعرض التجربة بأسلوب راقٍ ومرتب.'}</SectionDescription>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <SectionSurface className="overflow-hidden p-0">
                {mainImage ? (
                  <div className="relative h-[320px] w-full sm:h-[420px]">
                    <Image src={mainImage} alt={serviceName ?? (en ? 'dir3com service' : 'خدمة dir3com')} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-muted)] sm:h-[420px]">
                    {en ? 'No image currently available' : 'لا توجد صورة حالياً'}
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
                        aria-label={`${en ? 'View image' : 'عرض صورة'} ${index + 1}`}
                        aria-pressed={mainImage === image}
                        className={`relative h-28 overflow-hidden rounded-[18px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 sm:h-32 ${mainImage === image ? 'border-[var(--color-gold)]' : 'border-[color:var(--color-border)]'}`}
                      >
                        <Image src={image} alt={`${en ? 'Image' : 'صورة'} ${index + 1}`} fill className="object-cover" unoptimized />
                      </button>
                    ))
                  ) : (
                    <EmptyState title={en ? 'No images available' : 'لا توجد صور متاحة'} description={en ? 'The gallery will appear when product images are available.' : 'سيظهر معرض الصور فور توفر صور المنتجات.'} className="col-span-2" />
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
                title={en ? 'Service overview' : 'نظرة عامة على الخدمة'}
                description={serviceDescription ?? (en ? 'Service details will appear when verified data is available.' : 'تفاصيل الخدمة ستظهر هنا مع نفس اللغة البصرية المعتمدة في المنصة العامة.')}
              />
            </ResponsiveGrid>
          </ContentContainer>
        </SectionContainer>
      </div>

      {primaryAction === 'continue_to_booking' ? <div className="luxury-section-shell">
        <SectionContainer>
          <ContentContainer>
            <SectionSurface>
              <SectionTitle>{en ? 'Booking and payment' : 'الحجز والدفع'}</SectionTitle>
              <SectionDescription>{en ? 'Final price, taxes, fees, and payment timing appear in the booking flow before any transaction.' : 'تظهر تفاصيل السعر والدفع النهائية في مسار الحجز قبل تنفيذ أي عملية.'}</SectionDescription>
              <div className="mt-5">
                <PartnerComponent name={service_.supplier_name ?? (en ? products[0]?.partner?.name_en : products[0]?.partner?.name_ar) ?? (en ? 'Service provider' : 'مقدم الخدمة')} detail={service_.supplier_verified ? (en ? 'Supplier verified in dir3com records.' : 'مورد موثّق وفق سجل dir3com.') : (en ? 'Supplier status is shown exactly as recorded, without a verification claim.' : 'تظهر حالة المورد كما هي مسجلة دون ادعاء توثيق.')} />
              </div>
            </SectionSurface>
          </ContentContainer>
        </SectionContainer>
      </div> : null}

      {primaryAction === 'continue_to_booking' ? <div className="luxury-section-shell">
        <SectionContainer className="py-8">
          <ContentContainer>
            {products.length ? (
              <SectionTitle>{en ? 'Available booking options' : 'خيارات الحجز المتاحة'}</SectionTitle>
            ) : null}

            {products.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <SectionSurface key={product.id} className="overflow-hidden">
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{(en ? product.name_en : product.name_ar) ?? product.name_ar ?? product.name_en ?? (en ? 'dir3com product' : 'منتج dir3com')}</p>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                      {(en ? product.partner?.name_en : product.partner?.name_ar) ? `${en ? 'Partner' : 'الشريك'}: ${(en ? product.partner?.name_en : product.partner?.name_ar)}` : (en ? 'Service provider is not specified in the public record' : 'مقدم الخدمة غير محدد في السجل العام')}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{sanitizeMarketplaceCustomerCopy((en ? product.description_en : product.description_ar) ?? product.description_ar ?? product.description_en, en ? 'The service description will appear when data is available.' : 'وصف الخدمة سيظهر هنا عند توفر البيانات.')}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-2"><FiMapPin /> {(en ? product.region?.name_en : product.region?.name_ar) ?? product.region?.name_ar ?? product.region?.name_en ?? (en ? 'Saudi Arabia' : 'السعودية')}</span>
                      <span className="text-xl font-semibold text-[var(--color-gold)]">
                        {product.price_per_unit ?? '--'} {en ? 'SAR' : 'ر.س'}
                        <span className="me-1 text-xs text-[var(--color-muted)]">/ {unitLabel(product.unit_type, en)}</span>
                      </span>
                    </div>
                    <Link href={`/booking?product=${product.slug ?? ''}`} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-5 w-full`}>
                      {en ? 'Book now' : 'احجز الآن'}
                    </Link>
                  </SectionSurface>
                ))}
              </div>
            ) : (
              <EmptyState title={en ? 'No products currently available' : 'لا توجد منتجات متاحة حالياً'} description={en ? 'Check this service later for newly verified options.' : 'نحدّث القائمة باستمرار، راجع الخدمة لاحقاً لعرض الخيارات الجديدة.'} className="mt-6" />
            )}
          </ContentContainer>
        </SectionContainer>
      </div> : null}

      <div className="luxury-section-shell">
        <SectionContainer className="py-10"><ContentContainer><SectionSurface>
          <SectionTitle>{en ? 'Need help with this service?' : 'هل تحتاج مساعدة في هذه الخدمة؟'}</SectionTitle>
          <SectionDescription>{en ? 'Ask DABRA for contextual help, or return to the marketplace to compare verified options.' : 'اسأل DABRA عن هذه الخدمة، أو ارجع إلى السوق لمقارنة الخيارات الموثّقة.'}</SectionDescription>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/dabra" className={buttonVariants({ variant: 'gold', size: 'lg' })}>{en ? 'Ask DABRA' : 'اسأل DABRA'}</Link>
            <Link href="/marketplace" className={buttonVariants({ variant: 'outline', size: 'lg' })}>{en ? 'Back to marketplace' : 'العودة إلى السوق'}</Link>
          </div>
        </SectionSurface></ContentContainer></SectionContainer>
      </div>
    </div>
  );
}
