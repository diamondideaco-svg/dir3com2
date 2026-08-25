import VipPartnerConfigForm from '@/components/admin/VipPartnerConfigForm';
import { syntheticVipPartnerConfig } from '@/lib/travel/vip/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { VipPartnerConfig } from '@/lib/travel/contracts';

async function loadConfig(): Promise<VipPartnerConfig> {
  if (process.env.VIP_LOCAL_ENV?.trim().toLowerCase() !== 'local_test') return syntheticVipPartnerConfig;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('vip_partner_configs').select('config').eq('partner_id', syntheticVipPartnerConfig.partnerId).maybeSingle();
    return (data?.config as VipPartnerConfig | undefined) ?? syntheticVipPartnerConfig;
  } catch { return syntheticVipPartnerConfig; }
}
export default async function VipLocalEgyptPartnerPage() {
  const config = await loadConfig();
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><div><p className="text-sm font-semibold text-amber-700">DIR3 VIP / LOCAL PARTNER / EGYPT</p><h1 className="text-3xl font-bold text-slate-900">VIP partner configuration</h1><p className="mt-2 text-slate-600">Replace every placeholder with partner-confirmed data before any production activation.</p></div><VipPartnerConfigForm config={config} /></main>;
}
