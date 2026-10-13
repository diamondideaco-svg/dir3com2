import { handleKapsoTargetDispatch } from '@/lib/notifications/kapso-drive-whatsapp';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleKapsoTargetDispatch(request, process.env, () => supabaseAdmin);
}
