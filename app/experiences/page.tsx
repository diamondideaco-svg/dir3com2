import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function ExperiencesPage() {
  return <PublicCategoryPage config={publicCategoryConfigs.experiences} />;
}