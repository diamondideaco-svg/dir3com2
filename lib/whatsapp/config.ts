import type { WhatsAppCountryProfile } from '@/lib/whatsapp/types';

export const WHATSAPP_NUMBERS = {
  EG: '+201011676418',
  SA: '+966532867009',
} as const;

export const WHATSAPP_COUNTRY_PROFILES: Record<'EG' | 'SA', WhatsAppCountryProfile> = {
  EG: {
    country: 'EG',
    phoneE164: WHATSAPP_NUMBERS.EG,
    language: 'ar',
    currency: 'EGP',
    services: ['dir3 stay', 'dir3 experiences', 'dir3 concierge'],
    humanHandoffLabel: 'Egypt concierge desk',
  },
  SA: {
    country: 'SA',
    phoneE164: WHATSAPP_NUMBERS.SA,
    language: 'ar',
    currency: 'SAR',
    services: ['dir3 drive', 'dir3 stay', 'dir3 concierge'],
    humanHandoffLabel: 'Saudi concierge desk',
  },
};

export function getPhoneNumberIdToCountryMap() {
  const eg = process.env.WHATSAPP_PHONE_NUMBER_ID_EG?.trim() || '';
  const sa = process.env.WHATSAPP_PHONE_NUMBER_ID_SA?.trim() || '';

  const map: Record<string, 'EG' | 'SA'> = {};

  if (eg) {
    map[eg] = 'EG';
  }

  if (sa) {
    map[sa] = 'SA';
  }

  return map;
}

export function detectExternalBlockers() {
  const blockers: string[] = [];

  if (!process.env.WHATSAPP_VERIFY_TOKEN?.trim()) {
    blockers.push('MISSING_WHATSAPP_VERIFY_TOKEN');
  }

  if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
    blockers.push('MISSING_WHATSAPP_APP_SECRET');
  }

  if (!process.env.WHATSAPP_PHONE_NUMBER_ID_EG?.trim()) {
    blockers.push('MISSING_WHATSAPP_PHONE_NUMBER_ID_EG');
  }

  if (!process.env.WHATSAPP_PHONE_NUMBER_ID_SA?.trim()) {
    blockers.push('MISSING_WHATSAPP_PHONE_NUMBER_ID_SA');
  }

  if (!process.env.WHATSAPP_ACCESS_TOKEN_EG?.trim()) {
    blockers.push('MISSING_WHATSAPP_ACCESS_TOKEN_EG');
  }

  if (!process.env.WHATSAPP_ACCESS_TOKEN_SA?.trim()) {
    blockers.push('MISSING_WHATSAPP_ACCESS_TOKEN_SA');
  }

  return blockers;
}
