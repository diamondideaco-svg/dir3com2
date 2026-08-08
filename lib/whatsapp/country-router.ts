import { WHATSAPP_COUNTRY_PROFILES, getPhoneNumberIdToCountryMap } from '@/lib/whatsapp/config';
import type { WhatsAppCountryCode, WhatsAppCountryProfile } from '@/lib/whatsapp/types';

export function resolveCountryProfileByPhoneNumberId(phoneNumberId: string): WhatsAppCountryProfile | null {
  const normalized = String(phoneNumberId || '').trim();
  if (!normalized) return null;

  const map = getPhoneNumberIdToCountryMap();
  const country = map[normalized];

  if (country === 'EG') {
    return WHATSAPP_COUNTRY_PROFILES.EG;
  }

  if (country === 'SA') {
    return WHATSAPP_COUNTRY_PROFILES.SA;
  }

  return null;
}

const HUMAN_HANDOFF_TERMS = [
  'agent',
  'human',
  'representative',
  'مندوب',
  'موظف',
  'بشر',
  'تواصل بشري',
  'خدمة عملاء',
] as const;

export function shouldEscalateToHuman(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  return HUMAN_HANDOFF_TERMS.some((term) => normalized.includes(term));
}

export function toCountryCode(profile: WhatsAppCountryProfile): WhatsAppCountryCode {
  return profile.country;
}
