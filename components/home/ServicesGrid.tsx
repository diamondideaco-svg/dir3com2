import ServiceCard, { ServiceItem } from '../shared/ServiceCard';
import { EmptyState, LoadingSkeletonGrid } from '@/components/design-system';

type ServicesGridProps = {
  services: ServiceItem[];
  loading?: boolean;
  emptyMessage?: string;
  skeletonCount?: number;
};

export default function ServicesGrid({
  services,
  loading = false,
  emptyMessage = 'لا توجد خدمات متاحة حالياً.',
  skeletonCount = 3,
}: ServicesGridProps) {
  if (loading) {
    return <LoadingSkeletonGrid count={skeletonCount} />;
  }

  if (!services.length) {
    return <EmptyState title="ما لقينا نتائج بهذه المعايير." description={emptyMessage} />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </div>
  );
}
