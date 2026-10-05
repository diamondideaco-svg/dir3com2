import { receiveKapsoReceipt } from '@/lib/notifications/kapso-drive-whatsapp';
import { supabaseAdmin } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return receiveKapsoReceipt(request, process.env, () => supabaseAdmin);
}
