import type { ReactNode } from 'react';
import { requireAdminPageAccess } from '@/lib/auth/admin';
import AdminPlatformShell from '@/components/admin/AdminPlatformShell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { role } = await requireAdminPageAccess('/admin');
  return <AdminPlatformShell adminRole={role}>{children}</AdminPlatformShell>;
}