import PublicCategoryPage from '@/components/public/PublicCategoryPage';
import { publicCategoryConfigs } from '@/components/public/public-page-data';

export default function AirportTransfersPage() {
  return <PublicCategoryPage config={publicCategoryConfigs['airport-transfers']} />;
}