import type { ReactNode } from 'react';
import { requireAdminPageAccess } from '@/lib/auth/admin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPageAccess('/admin');
  return <>{children}</>;
}