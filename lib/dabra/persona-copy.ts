import type { DabraFamilyPersona } from './family-contract';

const arabicPersonas: Record<DabraFamilyPersona, string> = {
  'DABRA Concierge': 'الدبرة لخدمة العميل',
  'DABRA Partner': 'الدبرة للشريك',
  'DABRA Admin': 'الدبرة للإدارة',
  'DABRA CEO': 'الدبرة للمكتب التنفيذي',
  'DABRA Mall Center': 'الدبرة لمركز الخدمات',
  'DABRA Customer Service': 'الدبرة لدعم العملاء',
  'DABRA Travel Agent': 'الدبرة لوكيل السفر',
};

export function localizeDabraPersona(persona: string | null, language: 'ar' | 'en'): string | null {
  if (!persona || !Object.hasOwn(arabicPersonas, persona)) return null;
  return language === 'ar' ? arabicPersonas[persona as DabraFamilyPersona] : persona;
}
