import { handleDispatch } from '@/lib/notifications/drive-whatsapp';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleDispatch(request, process.env, () => supabaseAdmin);
}
