import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function CarsPage() {
  return <PublicCategoryPage config={publicCategoryConfigs.cars} />;
}