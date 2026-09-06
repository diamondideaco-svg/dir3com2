import ExecutiveDashboardClient from '@/components/admin/ExecutiveDashboardClient';
import { requireAdminPageAccess } from '@/lib/auth/admin';
import { getExecutiveDashboardData } from '@/lib/integration/dashboard-engine';

export const metadata = {
  title: 'Executive Dashboard | DIR3COM',
};

export default async function ExecutiveDashboardPage() {
  await requireAdminPageAccess('/admin/dashboard');
  const data = await getExecutiveDashboardData();
  return <ExecutiveDashboardClient data={data} />;
}
