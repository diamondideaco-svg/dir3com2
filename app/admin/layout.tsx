import type { ReactNode } from 'react';
import { requireAdminPageAccess } from '@/lib/auth/admin';
import { isCeoEmail } from '@/lib/auth/team-access';
import AdminPlatformShell from '@/components/admin/AdminPlatformShell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { role, user } = await requireAdminPageAccess('/admin');
  return (
    <AdminPlatformShell adminRole={role} isCeo={isCeoEmail(user.email)}>
      {children}
    </AdminPlatformShell>
  );
}
