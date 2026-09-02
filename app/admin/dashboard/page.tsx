import ExecutiveDashboardClient from '@/components/admin/ExecutiveDashboardClient';
import { getExecutiveDashboardData } from '@/lib/integration/dashboard-engine';

export const metadata = {
  title: 'Executive Dashboard | DIR3COM',
};

export default async function ExecutiveDashboardPage() {
  const data = await getExecutiveDashboardData();
  return <ExecutiveDashboardClient data={data} />;
}
