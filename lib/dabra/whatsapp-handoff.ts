import { getWhatsAppDirectory } from '@/lib/config/social';
import type { MarketplaceFamilyKey } from '@/lib/marketplace/data';

export type DabraWhatsAppContext = {
  language: 'ar' | 'en';
  family?: MarketplaceFamilyKey;
  publicTitle?: string;
  city?: string;
  requestedDate?: string;
  travellerCount?: number;
  transactionState?: 'instant_booking' | 'provider_checkout' | 'request_to_confirm' | 'request_quote' | 'unavailable';
  requestReference?: string;
};

export type DabraWhatsAppHandoff = {
  available: boolean;
  href: string | null;
  message: string;
};

const familyLabels: Record<MarketplaceFamilyKey, { ar: string; en: string }> = {
  'dir3-drive': { ar: 'التنقّل', en: 'Drive' },
  'dir3-stay': { ar: 'الإقامة', en: 'Stay' },
  'dir3-fly': { ar: 'الطيران', en: 'Fly' },
  'dir3-concierge': { ar: 'الكونسيرج', en: 'Concierge' },
  'dir3-vip': { ar: 'VIP', en: 'VIP' },
};

const transactionLabels = {
  instant_booking: { ar: 'حجز مباشر', en: 'Direct booking' },
  provider_checkout: { ar: 'إكمال الطلب لدى المزود', en: 'Provider checkout' },
  request_to_confirm: { ar: 'طلب للتأكيد', en: 'Request to confirm' },
  request_quote: { ar: 'طلب عرض سعر', en: 'Request a quote' },
  unavailable: { ar: 'غير متاح حاليًا', en: 'Currently unavailable' },
} as const;

function publicText(value: string | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function publicRequestReference(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^REQ-[A-Z0-9]{4,32}$/.test(normalized) ? normalized : null;
}

export function buildDabraWhatsAppHandoff(context: DabraWhatsAppContext): DabraWhatsAppHandoff {
  const { language } = context;
  const isArabic = language === 'ar';
  const title = publicText(context.publicTitle, 100);
  const city = publicText(context.city, 60);
  const requestedDate = publicText(context.requestedDate, 40);
  const requestReference = publicRequestReference(context.requestReference);
  const travellers = Number.isInteger(context.travellerCount) && Number(context.travellerCount) > 0 && Number(context.travellerCount) <= 50
    ? Number(context.travellerCount)
    : null;
  const lines = isArabic
    ? ['مرحبًا، أود المتابعة مع درعكم عبر الدبرة.', 'المصدر: الدبرة', 'اللغة: العربية']
    : ['Hello, I would like to continue with dir3com through DABRA.', 'Source: DABRA', 'Language: English'];

  if (context.family) lines.push(`${isArabic ? 'الفئة' : 'Family'}: ${familyLabels[context.family][language]}`);
  if (title) lines.push(`${isArabic ? 'الخدمة' : 'Service'}: ${title}`);
  if (city) lines.push(`${isArabic ? 'المدينة/الوجهة' : 'City/destination'}: ${city}`);
  if (requestedDate) lines.push(`${isArabic ? 'التاريخ المطلوب' : 'Requested date'}: ${requestedDate}`);
  if (travellers) lines.push(`${isArabic ? 'عدد المسافرين' : 'Travellers'}: ${travellers}`);
  if (context.transactionState) lines.push(`${isArabic ? 'طريقة المتابعة' : 'Next step'}: ${transactionLabels[context.transactionState][language]}`);
  if (requestReference) lines.push(`${isArabic ? 'مرجع الطلب' : 'Request reference'}: ${requestReference}`);
  lines.push(isArabic
    ? 'يرجى توضيح الخطوة التالية. لم يتم تأكيد حجز أو دفع عبر هذه الرسالة.'
    : 'Please advise the next step. This message does not confirm a booking or payment.');

  const message = lines.join('\n');
  const officialHref = getWhatsAppDirectory().sa;
  return {
    available: Boolean(officialHref),
    href: officialHref ? `${officialHref}?text=${encodeURIComponent(message)}` : null,
    message,
  };
}

export type WhatsAppWindow = { opener: unknown };

export function openDabraWhatsAppHandoff(
  href: string,
  opener: (url: string, target: string) => WhatsAppWindow | null = (url, target) => window.open(url, target),
) {
  try {
    const opened = opener(href, '_blank');
    if (!opened) return 'blocked' as const;
    opened.opener = null;
    return 'opened' as const;
  } catch {
    return 'blocked' as const;
  }
}
