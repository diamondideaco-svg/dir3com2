'use client';

import { useEffect, useState } from 'react';
import DynamicServices from '@/components/home/DynamicServices';
import ShieldOffers from '@/components/home/ShieldOffers';
import SmartSearch from '@/components/home/SmartSearch';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';
import ServicesGrid from '@/components/home/ServicesGrid';
import type { ServiceItem } from '@/components/shared/ServiceCard';
import { Card, CardContent } from '@/components/ui/card';

type ServiceApiItem = {
  id?: string | number;
  name_ar?: string | null;
  name?: string | null;
  title_ar?: string | null;
  description_ar?: string | null;
  description?: string | null;
  details_ar?: string | null;
  slug?: string | null;
  badge?: string | null;
  category_ar?: string | null;
};

function normalizeServices(data: unknown): ServiceItem[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: ServiceApiItem, index: number) => ({
    id: item.id ?? index + 1,
    name_ar: item.name_ar ?? item.name ?? item.title_ar ?? 'خدمة dir3com',
    description_ar: item.description_ar ?? item.description ?? item.details_ar ?? 'خدمة مميزة مصممة لتناسب رحلتك بثقة ووضوح.',
    slug: item.slug ?? `service-${index + 1}`,
    badge: item.badge ?? item.category_ar ?? 'خدمة مميزة',
  }));
}

export default function PublicServicesClient() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadServices() {
      try {
        const response = await fetch('/api/services', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('تعذر تحميل الخدمات حالياً');
        }

        const data = await response.json();
        setServices(normalizeServices(data));
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل الخدمات حالياً');
      } finally {
        setLoading(false);
      }
    }

    loadServices();
  }, []);

  return (
    <div className="pb-24">
      <PublicHero
        eyebrow="ALL SERVICES"
        title="خدمات dir3com"
        description="واجهة موحدة تعرض كامل الخدمات العامة بنفس الهوية المعتمدة، مع قابلية ربط مباشرة بالكتالوج والمحتوى مستقبلاً."
        highlight="استكشف كل المسارات العامة من صفحة واحدة: بحث، عروض، فئات خدمة، وتفاصيل مصممة بوضوح عربي فاخر."
        chips={['سيارات', 'فنادق', 'شقق', 'مطار', 'كونسيرج', 'تجارب', 'عروض']}
      />
      <PublicStats
        stats={[
          { label: 'الفئات العامة', value: '7' },
          { label: 'مسار موحد', value: 'System' },
          { label: 'جاهزية التوسع', value: 'Production' },
        ]}
      />
      <PublicFeatureStrip trustMessage="كل خدمات dir3com تستخدم نفس نظام الثقة، اللغة، والمسارات البصرية." />
      <SmartSearch />

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {error && (
            <Card className="mb-6 border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 shadow-none">
              <CardContent className="p-4 text-sm text-[var(--color-navy)]">{error}</CardContent>
            </Card>
          )}
          <ServicesGrid services={services} loading={loading} emptyMessage="لا توجد خدمات متاحة حالياً." />
        </div>
      </section>

      <DynamicServices />
      <ShieldOffers />
      <PublicRouteIndex />
      <PublicCtaBanner
        title="كل الخدمات العامة أصبحت ضمن نظام dir3com نفسه."
        description="هذه الصفحة الآن تتكامل بصرياً مع باقي المنصة العامة وتبقى جاهزة لربط البيانات الحية لاحقاً."
      />
    </div>
  );
}