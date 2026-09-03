import type { ReactNode } from 'react';
import { requireAdminShellAccess } from '@/lib/auth/admin';
import { isCeoEmail } from '@/lib/auth/team-access';
import AdminPlatformShell from '@/components/admin/AdminPlatformShell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { role, user, scope } = await requireAdminShellAccess('/admin');
  return (
    <AdminPlatformShell
      adminRole={role}
      isCeo={isCeoEmail(user.email)}
      isGlobal={scope.mode === 'global'}
      permissions={scope.grant?.permissions ?? []}
      countryScope={scope.countries}
    >
      {children}
    </AdminPlatformShell>
  );
}
