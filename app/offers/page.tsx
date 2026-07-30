import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function OffersPage() {
  return <PublicCategoryPage config={publicCategoryConfigs.offers} />;
}