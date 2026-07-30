'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowLeft, FiMapPin, FiShield } from 'react-icons/fi';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  name_ar?: string | null;
  description_ar?: string | null;
  badge?: string | null;
  products?: ServiceProduct[];
};

function unitLabel(unitType?: string | null) {
  if (unitType === 'day') return 'يوم';
  if (unitType === 'night') return 'ليلة';
  if (unitType === 'trip') return 'رحلة';
  return unitType || 'وحدة';
}

export default function PublicServiceDetailClient({ slug }: { slug: string }) {
  const [service, setService] = useState<ServiceDetail | null>(null);
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
        setService(data);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل الخدمة');
      } finally {
        setLoading(false);
      }
    }

    loadService();
  }, [slug]);

  if (loading) {
    return <div className="px-4 py-20 text-center text-[var(--color-muted)]">جاري تحميل تفاصيل الخدمة...</div>;
  }

  if (error || !service) {
    return (
      <div className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-[color:var(--color-border)] bg-white/84 p-8 text-center shadow-[0_18px_40px_rgba(13,27,42,0.06)]">
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">SERVICE DETAIL</p>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--color-navy)]">الخدمة غير متاحة حالياً</h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-muted)]">{error ?? 'تعذر العثور على الخدمة المطلوبة.'}</p>
          <Link href="/services" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-6`}>
            العودة إلى الخدمات
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <section className="px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <div className="mx-auto max-w-7xl">
          <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold)] transition hover:gap-3">
            <FiArrowLeft /> العودة إلى الخدمات
          </Link>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{service.badge ?? 'SERVICE DETAIL'}</p>
              <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)] sm:text-5xl">{service.name_ar ?? 'خدمة dir3com'}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
                {service.description_ar ?? 'تفاصيل الخدمة ستظهر هنا مع نفس اللغة البصرية المعتمدة في المنصة العامة.'}
              </p>
            </div>
            <Card className="bg-[var(--color-navy)] text-[var(--color-light)]">
              <CardContent className="p-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
                  <FiShield /> ضمان الدرع
                </div>
                <p className="mt-5 text-2xl font-semibold leading-[1.5]">الخدمة أول... والحساب بعد رضاك.</p>
                <p className="mt-4 text-sm leading-8 text-white/72">
                  كل بطاقة منتج هنا جاهزة لعرض الأسعار والموردين والصور ضمن نفس هيكلية dir3com دون أي تعديل على الخلفية التشغيلية.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-3">
          {service.products?.length ? (
            service.products.map((product) => {
              const primaryImage = product.images?.find((image) => image.is_primary)?.image_url ?? product.images?.[0]?.image_url ?? null;

              return (
                <Card key={product.id} className="overflow-hidden bg-white/84">
                  {primaryImage ? (
                    <div className="relative h-56 w-full overflow-hidden">
                      <Image src={primaryImage} alt={product.name_ar ?? 'منتج'} fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-56 items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">لا توجد صورة حالياً</div>
                  )}
                  <CardHeader>
                    <CardTitle>{product.name_ar ?? 'منتج dir3com'}</CardTitle>
                    <p className="text-sm text-[var(--color-muted)]">{product.partner?.name_ar ? `الشريك: ${product.partner.name_ar}` : 'شريك معتمد من dir3com'}</p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-8 text-[var(--color-muted)]">{product.description_ar ?? 'وصف الخدمة سيظهر هنا عند توفر البيانات.'}</p>
                    <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                      <span className="inline-flex items-center gap-2"><FiMapPin /> {product.region?.name_ar ?? 'السعودية'}</span>
                      <span className="text-xl font-semibold text-[var(--color-gold)]">
                        {product.price_per_unit ?? '--'} ر.س
                        <span className="mr-1 text-xs text-[var(--color-muted)]">/ {unitLabel(product.unit_type)}</span>
                      </span>
                    </div>
                    <Link href={`/booking?product=${product.slug ?? ''}`} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-6 w-full`}>
                      احجز الآن
                    </Link>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="md:col-span-2 xl:col-span-3 bg-white/84">
              <CardContent className="p-8 text-center text-[var(--color-muted)]">لا توجد منتجات متاحة لهذه الخدمة حالياً.</CardContent>
            </Card>
          )}
        </div>
      </section>

      <PublicRouteIndex />
      <PublicCtaBanner
        title="استكشف الخدمة ثم انتقل إلى الحجز عندما تكون جاهزاً."
        description="صفحة التفاصيل أصبحت جزءاً من نفس نظام dir3com العام، مع مكونات قابلة لإعادة الاستخدام وقابلة للتوسع مستقبلاً."
      />
    </div>
  );
}