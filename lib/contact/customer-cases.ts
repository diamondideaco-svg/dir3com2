import { CONTACT_COUNTRIES, UUID_PATTERN, type ContactInput } from './contract';

export const CUSTOMER_CASE_STATUSES = ['received', 'in_progress', 'closed'] as const;
export type CustomerCaseStatus = typeof CUSTOMER_CASE_STATUSES[number];
export type CustomerCase = Readonly<{
  reference: string; status: CustomerCaseStatus; subject: string;
  country: ContactInput['country']; createdAt: string; updatedAt: string;
  events: readonly Readonly<{ status: CustomerCaseStatus; createdAt: string }>[];
}>;
export type CustomerCaseRead =
  | Readonly<{ kind: 'ready'; cases: readonly CustomerCase[]; truncated: boolean; retrievedAt: string }>
  | Readonly<{ kind: 'authentication_required' | 'forbidden' | 'unavailable' }>;

export function parseCustomerCaseReference(value: unknown): { reference: string; id: string } | null {
  if (typeof value !== 'string' || !/^CASE-/i.test(value)) return null;
  const id = value.slice(5).toLowerCase();
  return UUID_PATTERN.test(id) ? { reference: 'CASE-' + id, id } : null;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}
function row(value: unknown): CustomerCase | null {
  if (!record(value) || !exact(value, ['reference','status','subject','country','createdAt','updatedAt','events'])) return null;
  const reference = parseCustomerCaseReference(value.reference);
  const status = CUSTOMER_CASE_STATUSES.find(s => s === value.status);
  const country = CONTACT_COUNTRIES.find(c => c === value.country);
  if (!reference || !status || !country || typeof value.subject !== 'string'
    || !['booking','service','partnership','other'].includes(value.subject)
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !Array.isArray(value.events) || value.events.length > 20) return null;
  const events: Array<{ status: CustomerCaseStatus; createdAt: string }> = [];
  for (const item of value.events) {
    if (!record(item) || !exact(item, ['status','createdAt']) || !timestamp(item.createdAt)) return null;
    const eventStatus = CUSTOMER_CASE_STATUSES.find(s => s === item.status);
    if (!eventStatus) return null;
    events.push(Object.freeze({ status: eventStatus, createdAt: item.createdAt }));
  }
  return Object.freeze({ reference: reference.reference, status, subject: value.subject, country,
    createdAt: value.createdAt, updatedAt: value.updatedAt, events: Object.freeze(events) });
}
/** Unknown RPC fields fail closed rather than exposing contacts, actor IDs or notes. */
export function parseCustomerCaseRead(value: unknown): Extract<CustomerCaseRead, { kind: 'ready' }> | null {
  if (!record(value) || !exact(value, ['kind','cases','truncated','retrievedAt']) || value.kind !== 'ready'
    || !Array.isArray(value.cases) || value.cases.length > 20 || typeof value.truncated !== 'boolean'
    || !timestamp(value.retrievedAt)) return null;
  const cases: CustomerCase[] = [];
  for (const item of value.cases) { const parsed = row(item); if (!parsed) return null; cases.push(parsed); }
  return Object.freeze({ kind: 'ready', cases: Object.freeze(cases), truncated: value.truncated, retrievedAt: value.retrievedAt });
}
