const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const PROMPT_INJECTION = /(?:ignore|disregard|reveal|print|show).{0,40}(?:system prompt|developer message|secret|api key|tool instructions)|(?:تجاهل|اكشف|اطبع|اعرض).{0,40}(?:تعليمات النظام|المفتاح|الأسرار)/i;

export function sanitizeUntrustedText(value: unknown, maxLength = 300): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}
export function assertSafeUserInput(value: string): void {
  if (PROMPT_INJECTION.test(value)) throw new Error('UNSAFE_USER_INSTRUCTION');
}
export function sanitizeProviderError(_error: unknown, language: 'ar' | 'en' = 'en'): string {
  return language === 'ar' ? 'تعذر إكمال طلب المزوّد بأمان.' : 'The supplier request could not be completed safely.';
}
export function assertOwnerScope(expected: { ownerId: string; tenantId: string }, actual: { ownerId: string; tenantId: string }): void {
  if (!expected.ownerId || !expected.tenantId || expected.ownerId !== actual.ownerId || expected.tenantId !== actual.tenantId) throw new Error('OWNERSHIP_SCOPE_MISMATCH');
}
