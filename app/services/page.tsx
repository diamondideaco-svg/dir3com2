import ServicesOverview from '@/components/services/ServicesOverview';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'All services | جميع الخدمات',
  description: 'Drive, Stay, Fly, Concierge and VIP — خدمات السفر الخمس من dir3com.',
  alternates: { canonical: '/services' },
};

export default function ServicesPage() {
  return <ServicesOverview />;
}
