export const CONTACT_COUNTRIES = ['EG', 'SA', 'AE', 'OTHER'] as const;
export type ContactInput = {
  name: string; email: string; phone: string; subject: string; message: string;
  country: typeof CONTACT_COUNTRIES[number];
};
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseContact(value: unknown): ContactInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const read = (key: string, max: number, required = true) => {
    const x = v[key];
    if (!required && (x === undefined || x === '')) return '';
    if (typeof x !== 'string' || x.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)) return null;
    return x.trim() || (required ? null : '');
  };
  const name = read('name', 120), email = read('email', 254), phone = read('phone', 32, false);
  const subject = read('subject', 32), message = read('message', 2000), country = read('country', 5);
  if (!name || !email || phone === null || !subject || !message || !country) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['booking','service','partnership','other'].includes(subject)
    || !CONTACT_COUNTRIES.includes(country as ContactInput['country'])) return null;
  return { name, email: email.toLowerCase(), phone, subject, message, country: country as ContactInput['country'] };
}
