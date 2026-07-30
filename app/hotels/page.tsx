import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function HotelsPage() {
  return <PublicCategoryPage config={publicCategoryConfigs.hotels} />;
}