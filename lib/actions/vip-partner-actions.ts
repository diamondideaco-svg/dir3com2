'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { assertVipLocalTestMode, validateVipPartnerConfig, VIP_SYNTHETIC_SOURCE, VIP_UNVERIFIED } from '@/lib/travel/vip/config';
import type { VipPartnerConfig } from '@/lib/travel/contracts';

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? '').trim().slice(0, max);
const positive = (form: FormData, key: string) => { const value = Number(text(form, key, 20)); if (!Number.isFinite(value) || value < 1) throw new Error(`INVALID_${key.toUpperCase()}`); return value; };

export async function updateVipPartnerConfigAction(formData: FormData) {
  assertVipLocalTestMode();
  const { supabase, user } = await requireAdminActionAccess();
  const status = text(formData, 'status', 32);
  const bookingMethod = text(formData, 'bookingMethod', 64);
  const pricingModel = text(formData, 'pricingModel', 64);
  const config: VipPartnerConfig = {
    partnerId: text(formData, 'partnerId', 80), legalName: text(formData, 'legalName', 160), displayName: text(formData, 'displayName', 160), country: 'EG',
    coverage: text(formData, 'coverage', 2000).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 50), serviceCategories: ['DIR3 VIP'],
    operatingHours: text(formData, 'operatingHours'), responseSlaMinutes: positive(formData, 'responseSlaMinutes'),
    bookingMethod: bookingMethod === 'admin_confirmed_request' ? 'admin_confirmed_request' : 'partner_portal_confirmation',
    cancellationPolicy: text(formData, 'cancellationPolicy', 2000), amendmentPolicy: text(formData, 'amendmentPolicy', 2000),
    pricingModel: pricingModel === 'request_quote' ? 'request_quote' : 'fixed_test_fixture', basePrice: positive(formData, 'basePrice'), perPassengerPrice: positive(formData, 'perPassengerPrice'), settlementModel: text(formData, 'settlementModel', 1000),
    currency: 'EGP', taxAndFees: text(formData, 'taxAndFees', 1000), minimumLeadTimeHours: positive(formData, 'minimumLeadTimeHours'),
    quoteValidityMinutes: positive(formData, 'quoteValidityMinutes'), operationalContact: text(formData, 'operationalContact', 200),
    escalationContact: text(formData, 'escalationContact', 200), status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE_TEST_ONLY',
    source: VIP_SYNTHETIC_SOURCE, verificationStatus: VIP_UNVERIFIED,
  };
  validateVipPartnerConfig(config);
  const { error } = await supabase.from('vip_partner_configs').upsert({ partner_id: config.partnerId, config, source: VIP_SYNTHETIC_SOURCE, verification_status: VIP_UNVERIFIED, environment: 'local_test', updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error('VIP_CONFIG_SAVE_FAILED');
  await supabase.from('vip_partner_audit').insert({ partner_id: config.partnerId, event: 'vip.config.updated', entity_id: config.partnerId, source: VIP_SYNTHETIC_SOURCE, environment: 'local_test', actor_id: user.id });
  revalidatePath('/admin/partners/vip-local-egypt');
}
