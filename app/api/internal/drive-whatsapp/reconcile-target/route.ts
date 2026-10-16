import { handleKapsoTargetReconcile } from '@/lib/notifications/kapso-provider-query';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleKapsoTargetReconcile(request, process.env, () => supabaseAdmin);
}
