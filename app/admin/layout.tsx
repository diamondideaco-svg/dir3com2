import type { ReactNode } from 'react';
import { requireAdminShellAccess } from '@/lib/auth/admin';
import { isCeoActor } from '@/lib/auth/team-access';
import AdminPlatformShell from '@/components/admin/AdminPlatformShell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { supabase, role, user, scope } = await requireAdminShellAccess('/admin');
  return (
    <AdminPlatformShell
      adminRole={role}
      isCeo={await isCeoActor(supabase, user)}
      isGlobal={scope.mode === 'global'}
      permissions={scope.grant?.permissions ?? []}
      countryScope={scope.countries}
    >
      {children}
    </AdminPlatformShell>
  );
}
