import { handleKapsoStop } from '@/lib/notifications/kapso-drive-whatsapp';
import { supabaseAdmin } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handleKapsoStop(request, process.env, () => supabaseAdmin);
}
