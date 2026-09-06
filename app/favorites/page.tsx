import { redirect } from 'next/navigation';
import AccountFrame, { getViewer } from '@/components/v6/AccountFrame';
import Favorites from '@/components/v6/Favorites';
export default async function FavoritesPage() {
  const viewer=await getViewer();
  if(!viewer)redirect('/login?redirect=%2Ffavorites&next=%2Ffavorites');
  return <AccountFrame path="/favorites" navy><Favorites key={viewer.id} userId={viewer.id}/></AccountFrame>;
}
