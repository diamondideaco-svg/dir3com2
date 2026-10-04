import { normalizePlatformQuery } from './platform-assistant';
import { isMarketplaceRequestReference } from '../marketplace/customer-requests';
import { withoutNegativeActions } from './intent-constraints';

export const AGENT_TOOLS = ['discover', 'my_requests', 'operations', 'executive', 'support', 'call_center', 'capabilities', 'weather', 'currency', 'maps'] as const;
export type AgentTool = typeof AGENT_TOOLS[number];
export type AgentRole = 'guest' | 'customer' | 'partner' | 'staff' | 'admin' | 'ceo';
export type AgentIntent = { tool: AgentTool; reference: string | null; draft: boolean };
export type AgentRequest = {
  reference: string;
  status: string;
  nextAction: string | null;
  quote: { amount: number; currency: string; expiresAt: string | null } | null;
};
export type AgentReadResult =
  | { kind: 'ready'; requests: AgentRequest[]; scope: 'own' | 'egypt'; truncated: boolean; retrievedAt: string }
  | { kind: 'authentication_required' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' };
export type AgentContext = {
  role: AgentRole;
  readRequests: (reference: string | null, operational: boolean) => Promise<AgentReadResult>;
};

export function agentIntent(message: string): AgentIntent {
  const text = normalizePlatformQuery(message);
  const candidate = message.toUpperCase().match(/\bREQ-[A-Z0-9]+\b/)?.[0] ?? '';
  const reference = isMarketplaceRequestReference(candidate) ? candidate : null;
  const draft = /\bdraft\b|compose|reply|مسوده|صياغه|جهز رد|اكتب رد/.test(text);
  let tool: AgentTool = 'discover';
  if (/\bceo\b|executive|المكتب التنفيذي|تقرير الاداره العليا|ملخص تنفيذي/.test(text)) tool = 'executive';
  else if (/operations|\badmin\b|طابور|طلبات العملاء|العمليات|لوحه الاداره|لوحة الاداره/.test(text)) tool = 'operations';
  else if (/call cent(?:er|re)|\bcall\b|اتصل|كول سنتر|مركز الاتصال|مكالم/.test(text)) tool = 'call_center';
  else if (/capabilit|what can you|what do you|ماذا تستطيع|شو بتقدر|ايش تقدر|امكانيات|قدرات/.test(text)) tool = 'capabilities';
  else if (/weather|temperature|طقس|الحراره/.test(text)) tool = 'weather';
  else if (/map|directions|خريطه|خرائط|خرايط|موقع الوجهه/.test(text)) tool = 'maps';
  else if (/(?:usd|sar|egp|aed|eur|دولار|ريال|جنيه|درهم|يورو)/.test(text) && /convert|exchange|تحويل|حول|كم يساوي|صرف/.test(text)) tool = 'currency';
  else if (reference || /my requests|my bookings|request status|طلباتي|حجوزاتي|حاله طلبي|حاله الطلب|وين طلبي/.test(text)) tool = 'my_requests';
  else if (/support|customer service|complaint|cancel|refund|payment|\bpay\b|خدمه العملاء|شكوي|الغاء|الغي|استرد|ادفع|دفع|تحويل|كاش/.test(withoutNegativeActions(text))) tool = 'support';
  return { tool, reference, draft };
}

/** Provider output selects a known READ tool only. It never supplies scope, SQL, links, prices or identity. */
export function parseAgentTool(value: unknown): AgentTool | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1) return null;
  return AGENT_TOOLS.find(tool => tool === record.tool) ?? null;
}

const statusCopy: Record<string, { ar: string; en: string }> = {
  request_submitted: { ar: 'تم إرسال الطلب', en: 'Request submitted' },
  under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  awaiting_supplier: { ar: 'بانتظار المورد', en: 'Awaiting supplier' },
  awaiting_customer_acceptance: { ar: 'عرض سعر بانتظار موافقة العميل', en: 'Quote awaiting customer acceptance' },
  awaiting_payment: { ar: 'بانتظار الدفع؛ لم يتم الدفع أو الحجز', en: 'Awaiting payment; not paid or booked' },
  quoted: { ar: 'عرض سعر بانتظار العميل', en: 'Quote awaiting customer' },
  quote_sent: { ar: 'أُرسل عرض السعر', en: 'Quote sent' },
  quote_accepted: { ar: 'قَبِل العميل العرض؛ ليست حالة دفع أو حجز', en: 'Customer accepted the offer; not a payment or booking state' },
  confirmed: { ar: 'الطلب مؤكد وفق السجل؛ الدفع منفصل', en: 'Request confirmed in the record; payment is separate' },
  declined: { ar: 'مرفوض', en: 'Declined' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
  completed: { ar: 'مكتمل وفق حالة السجل', en: 'Completed according to the record' },
};
export function agentRequestStatus(status: string, locale: 'ar' | 'en') {
  return statusCopy[status]?.[locale] ?? (locale === 'ar' ? 'راجع الحالة في الطلب' : 'Review the status in the request');
}

export function safeAgentRequest(value: unknown): AgentRequest | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.request_reference !== 'string' || !isMarketplaceRequestReference(row.request_reference) || typeof row.status !== 'string') return null;
  const amount = typeof row.quote_amount === 'number' ? row.quote_amount : typeof row.quote_amount === 'string' && /^\d+(\.\d{1,2})?$/.test(row.quote_amount) ? Number(row.quote_amount) : NaN;
  const currency = typeof row.quote_currency === 'string' && /^[A-Z]{3}$/.test(row.quote_currency) ? row.quote_currency : null;
  return { reference: row.request_reference, status: row.status,
    nextAction: typeof row.next_action === 'string' && /^[a-z_]{1,60}$/.test(row.next_action) ? row.next_action : null,
    quote: Number.isFinite(amount) && amount >= 0 && currency ? { amount, currency, expiresAt: typeof row.quote_expires_at === 'string' ? row.quote_expires_at : null } : null };
}
