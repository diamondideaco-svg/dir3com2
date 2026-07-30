import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function ApartmentsPage() {
  return <PublicCategoryPage config={publicCategoryConfigs.apartments} />;
}