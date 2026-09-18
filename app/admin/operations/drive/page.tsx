import { notFound } from 'next/navigation';
import { requireScopedAdminPageAccess, isCountryAllowed } from '@/lib/auth/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DRIVE_REQUEST_FIELDS, type DriveRequestRecord } from '@/lib/drive/record';
import DriveOperations from '@/components/drive/DriveOperations';

export default async function DriveOperationsPage() {
  const { scope } = await requireScopedAdminPageAccess('/admin/operations/drive','operations:read');
  if (!isCountryAllowed(scope,'EG')) notFound();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('marketplace_requests').select(DRIVE_REQUEST_FIELDS)
    .not('drive_offer_id','is',null).order('created_at',{ascending:false}).limit(100);
  if (error) throw new Error('Drive Operations queue unavailable.');
  return <DriveOperations requests={(data ?? []) as unknown as DriveRequestRecord[]} canWrite={scope.mode==='global'||Boolean(scope.grant?.permissions.includes('operations:write'))}/>;
}
