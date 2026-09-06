import { redirect } from 'next/navigation';
import { getViewer } from '@/components/v6/AccountFrame';
import LoginSuccess from '@/components/v6/LoginSuccess';
import { getRolePostLoginDestination } from '@/lib/auth/redirect';

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=%2Flogin-success');
  return <LoginSuccess destination={getRolePostLoginDestination({ role: viewer.role, roleRaw: viewer.roleRaw })} />;
}
