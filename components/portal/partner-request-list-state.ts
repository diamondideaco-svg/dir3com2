export type PartnerRequestListState<T> =
  | { status: 'loading' }
  | { status: 'failure' }
  | { status: 'success'; requests: T[]; whatsappConfigured: boolean };

export type PartnerRequestTimelineEvent = {
  type: string;
  at?: string | null;
  previousStatus?: string | null;
  status?: string | null;
};

export type PartnerRequestListRow = {
  id: string;
  request_reference: string;
  request_type: string;
  status: string;
  requested_for?: string | null;
  traveller_count: number;
  marketplace_family?: string | null;
  supplier_name?: string | null;
  service_name?: string | null;
  fulfilment_method?: string | null;
  transaction_method?: string | null;
  handoff_type?: string | null;
  handoff_reference?: string | null;
  handoff_started_at?: string | null;
  next_action?: string | null;
  created_at: string;
  products?: { name_ar?: string; name_en?: string; slug?: string; city?: string; country?: string } | null;
  timeline?: PartnerRequestTimelineEvent[];
};

type RequestsPayload<T> = {
  data?: T[];
  whatsappConfigured?: boolean;
};

type PartnerRequestListLanguage = 'ar' | 'en';

export type PartnerRequestActionError =
  | 'popup_blocked'
  | 'refresh_failed'
  | 'replay_unavailable'
  | 'handoff_failed';

export type PartnerRequestListPresentation<T> = {
  requests: T[];
  whatsappConfigured: boolean | null;
  loadError: string | null;
  retry: string | null;
  loading: string | null;
  empty: string | null;
  whatsappNotConfigured: string | null;
};

const copy = {
  ar: {
    loadError: 'تعذر تحميل الطلبات حالياً.',
    retry: 'إعادة المحاولة',
    loading: 'جاري تحميل الطلبات…',
    empty: 'لا توجد طلبات مرتبطة بمنتجاتك حالياً.',
    whatsappNotConfigured: 'تسليم واتساب غير مفعّل في هذه البيئة. تبقى الطلبات ظاهرة بدون ادعاء تنفيذ.',
  },
  en: {
    loadError: 'Requests could not be loaded right now.',
    retry: 'Retry',
    loading: 'Loading requests…',
    empty: 'There are no requests tied to your products right now.',
    whatsappNotConfigured: 'WhatsApp handoff is not configured in this environment. Requests remain visible without claiming execution.',
  },
} as const;

const actionErrorCopy: Record<PartnerRequestListLanguage, Record<PartnerRequestActionError, string>> = {
  ar: {
    popup_blocked: 'تم تسجيل التسليم، لكن المتصفح منع النافذة. استخدم رابط المتابعة الظاهر.',
    refresh_failed: 'تم تسجيل التسليم، لكن تعذر تحديث القائمة. استخدم رابط المتابعة الظاهر أو أعد تحميل الصفحة.',
    replay_unavailable: 'سجل التسليم موجود، لكن لا يمكن إعادة إنشاء رابط واتساب القديم بأمان. تواصل مع فريق العمليات.',
    handoff_failed: 'تعذر فتح واتساب تلقائياً. إذا ظهر الطلب كمسجل، اختر فتح التسليم مرة أخرى بأمان.',
  },
  en: {
    popup_blocked: 'The handoff was recorded, but the browser blocked the window. Use the visible continue link.',
    refresh_failed: 'The handoff was recorded, but the list could not refresh. Use the visible continue link or reload the page.',
    replay_unavailable: 'The handoff record exists, but its legacy WhatsApp link cannot be reconstructed safely. Contact operations.',
    handoff_failed: 'WhatsApp could not open automatically. If the request now appears recorded, safely select open handoff again.',
  },
};

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isTimelineEvent(value: unknown): value is PartnerRequestTimelineEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.type === 'string'
    && optionalString(event.at)
    && optionalString(event.previousStatus)
    && optionalString(event.status);
}

function isProductsSummary(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return optionalString(product.name_ar)
    && optionalString(product.name_en)
    && optionalString(product.slug)
    && optionalString(product.city)
    && optionalString(product.country);
}

export function isPartnerRequestListRow(value: unknown): value is PartnerRequestListRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const optionalStringFields = [
    row.requested_for,
    row.marketplace_family,
    row.supplier_name,
    row.service_name,
    row.fulfilment_method,
    row.transaction_method,
    row.handoff_type,
    row.handoff_reference,
    row.handoff_started_at,
    row.next_action,
  ];

  return typeof row.id === 'string'
    && typeof row.request_reference === 'string'
    && typeof row.request_type === 'string'
    && typeof row.status === 'string'
    && typeof row.traveller_count === 'number'
    && Number.isFinite(row.traveller_count)
    && typeof row.created_at === 'string'
    && optionalStringFields.every(optionalString)
    && isProductsSummary(row.products)
    && (row.timeline === undefined || (Array.isArray(row.timeline) && row.timeline.every(isTimelineEvent)));
}

export function createPartnerRequestListLoadingState<T>(): PartnerRequestListState<T> {
  return { status: 'loading' };
}

export async function loadPartnerRequestList(
  fetcher: typeof fetch = fetch,
): Promise<PartnerRequestListState<PartnerRequestListRow>> {
  try {
    const response = await fetcher('/api/partner-portal/requests', { cache: 'no-store' });
    const payload = await response.json().catch(() => null) as RequestsPayload<unknown> | null;

    if (
      !response.ok
      || !payload
      || !Array.isArray(payload.data)
      || !payload.data.every(isPartnerRequestListRow)
      || typeof payload.whatsappConfigured !== 'boolean'
    ) {
      return { status: 'failure' };
    }

    return {
      status: 'success',
      requests: payload.data,
      whatsappConfigured: payload.whatsappConfigured,
    };
  } catch {
    return { status: 'failure' };
  }
}

export function createPartnerRequestListRetry<T>(reloadVersion: number) {
  return {
    requestList: createPartnerRequestListLoadingState<T>(),
    reloadVersion: reloadVersion + 1,
  };
}

export function getPartnerRequestActionErrorMessage(
  error: PartnerRequestActionError,
  language: PartnerRequestListLanguage,
): string {
  return actionErrorCopy[language][error];
}

export function getPartnerRequestListPresentation<T>(
  state: PartnerRequestListState<T>,
  language: PartnerRequestListLanguage,
): PartnerRequestListPresentation<T> {
  const text = copy[language];
  const success = state.status === 'success';
  const requests = success ? state.requests : [];

  return {
    requests,
    whatsappConfigured: success ? state.whatsappConfigured : null,
    loadError: state.status === 'failure' ? text.loadError : null,
    retry: state.status === 'failure' ? text.retry : null,
    loading: state.status === 'loading' ? text.loading : null,
    empty: success && requests.length === 0 ? text.empty : null,
    whatsappNotConfigured: success && state.whatsappConfigured === false
      ? text.whatsappNotConfigured
      : null,
  };
}
