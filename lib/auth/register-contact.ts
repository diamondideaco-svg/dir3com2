import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export const registerCountries = getCountries();
export { getCountryCallingCode };
export type { CountryCode };

/** Self-reported contact only. Never use this metadata for verification or authorization. */
export function normalizeRegisterContact(country: string, input: string) {
  if (!registerCountries.includes(country as CountryCode)) return null;
  const digits = input.normalize('NFKC').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0)).trim();
  if (digits.length > 40 || !/^[+\d ()-]+$/.test(digits)) return null;
  const phone = parsePhoneNumberFromString(digits.replace(/^00/, '+'), country as CountryCode);
  if (!phone?.isValid() || phone.country !== country || phone.ext) return null;
  return { phone_e164: phone.number, country_code: phone.country, calling_code: `+${phone.countryCallingCode}` };
}

export const registerSocialLinks = [
  { channel: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/company/dir3com' },
  { channel: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/dir3com' },
  { channel: 'tiktok', label: 'TikTok', href: 'https://www.tiktok.com/@dir3com' },
  { channel: 'x', label: 'X', href: 'https://x.com/dir3com' },
  { channel: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/dir3com' },
] as const;
