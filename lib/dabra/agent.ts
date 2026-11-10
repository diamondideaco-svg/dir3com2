import { renderServerReply, serverReplyLink, serverReplySegments } from './conversation-renderer';
import { agentIntent, agentRequestStatus, type AgentContext, type AgentIntent, type AgentRequest } from './agent-contract';
import { buildPlatformAssistantResponse, type PlatformPricing } from './platform-assistant';
import { normalizePlatformQuery } from './platform-assistant';
import { getWeatherSnapshot } from '../weather/service';
import { convertCurrency } from '../currency/service';
import { displayPrice, parseDisplayCurrency } from '../currency/display';
import type { SavedTrip } from './continuity-contract';
import { parseCustomerCaseReference } from '../contact/customer-cases';

type Input = {
  message: string; locale: 'ar' | 'en'; history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Constructed by the server after attachment validation; never part of user intent. */
  serverAttachmentNote?: string;
  context: AgentContext; pricing?: PlatformPricing; intent?: AgentIntent; trip?: SavedTrip | null; needsClarification?: boolean;
};

/** The model can select a read tool. Facts, permissions, links and replies stay server-owned. */
export async function runInternalAgent({ message, locale, history, context, pricing, trip, needsClarification = false, intent = agentIntent(message) }: Input) {
  const ar = locale === 'ar';
  const link = serverReplyLink;
  const text = serverReplySegments();
  let state = 'guidance';
  let sourceId = 'dir3com-platform';
  const supportLink = link(ar ? 'الدعم داخل المنصة' : 'Platform support', '/support');
  const requestsLink = link(ar ? 'طلباتي' : 'My requests', '/my-requests');
  const operationsLink = link(ar ? 'عمليات النقل في مصر' : 'Egypt Drive Operations', '/admin/operations/drive');
  const operational = ['staff', 'admin', 'ceo'].includes(context.role);

  function requestLine(row: AgentRequest) {
    let result = `${row.reference}: ${agentRequestStatus(row.status, locale)}`;
    if (row.quote) {
      const converted = displayPrice(row.quote.amount, row.quote.currency, pricing?.currency ?? row.quote.currency, pricing?.snapshot);
      result += ` — ${ar ? 'عرض مسجّل' : 'Recorded quote'}: ${converted.amount.toFixed(2)} ${converted.currency}`;
      if (converted.unavailable) result += ar ? ' (بعملة المصدر؛ الصرف غير متاح)' : ' (source currency; FX unavailable)';
      else if (converted.currency !== row.quote.currency) result += ` (${ar ? 'الأصل' : 'source'}: ${row.quote.amount.toFixed(2)} ${row.quote.currency})`;
      if (row.quote.expiresAt) {
        const expiry = Date.parse(row.quote.expiresAt);
        if (Number.isFinite(expiry) && expiry <= Date.now()) result += ar ? ' — انتهت صلاحية العرض؛ اطلب تحديثه' : ' — quote expired; request an update';
      }
    }
    if (row.nextAction === 'payment_not_enabled') result += ar ? ' — الدفع غير مفعّل لهذا المسار' : ' — payment is disabled for this flow';
    return result;
  }

  if (intent.tool === 'discover') {
    const response = buildPlatformAssistantResponse(message, history, locale, undefined, undefined, pricing, trip);
    // Optional understanding can fail without blocking existing platform journeys.
    // Keep history, catalogue facts and links; do not surface provider internals.
    const continuation = ar
      ? 'يمكنك المتابعة عبر خيارات المنصة أدناه، أو تحديد الخدمة التي تحتاجها.'
      : 'You can continue through the platform options below, or tell me which service you need.';
    return { ...response, answer: needsClarification ? `${continuation}\n\n${response.answer}` : response.answer,
      agent: { role: context.role, tool: intent.tool, state: 'catalogue', mutations: 0 } };
  }

  if (intent.tool === 'weather') {
    const query = normalizePlatformQuery(message);
    if (!/cairo|القاهره/.test(query)) text.push(ar ? 'أستطيع جلب طقس القاهرة الحالي من أداة المنصة. هل تريد القاهرة؟ لا أستبدل مدينة أخرى تلقائيًا.' : 'The platform weather tool currently supports Cairo. Do you want Cairo? I will not substitute another city automatically.');
    else {
      const weather = await getWeatherSnapshot({ city: 'cairo', language: locale, unit: 'c' });
      if (!weather.live || weather.temperature === null) { state = 'unavailable'; text.push(ar ? 'تعذر جلب طقس القاهرة الآن؛ لا توجد قراءة حالية أعتمد عليها.' : 'Cairo weather could not be retrieved; there is no current reading to rely on.'); }
      else { sourceId = 'dir3com-weather'; text.push(`${weather.cityLabel}: ${weather.temperature}°C — ${weather.condition}`, `${ar ? 'وقت الرصد' : 'Observed at'}: ${weather.observedAt}`, ar ? 'الطقس الحالي، وليس توقعًا لموعد الرحلة.' : 'Current conditions, not a forecast for your travel date.'); }
    }
  } else if (intent.tool === 'currency') {
    const query = normalizePlatformQuery(message);
    const matches = [...query.matchAll(/usd|sar|egp|aed|eur|دولار|ريال|جنيه|درهم|يورو/g)];
    const codes = matches.map(match => parseDisplayCurrency(({دولار:'USD',ريال:'SAR',جنيه:'EGP',درهم:'AED',يورو:'EUR'} as Record<string,string>)[match[0]] ?? match[0]));
    const amountText = query.match(/(?:^|[^\d.,-])(\d+(?:\.\d{1,2})?)(?![\d.,])/u)?.[1];
    const amount = amountText ? Number(amountText) : NaN;
    if (!Number.isFinite(amount) || amount > 1000000000 || !codes[0] || !codes[1]) text.push(ar ? 'حدّد المبلغ وعملة المصدر والهدف، مثل: حوّل 100 USD إلى SAR.' : 'Specify the amount, source and target, for example: convert 100 USD to SAR.');
    else {
      const conversion = await convertCurrency({amount,sourceCurrency:codes[0],targetCurrency:codes[1]});
      if (!conversion.ok) { state = 'unavailable'; text.push(ar ? 'تعذر جلب سعر صرف موثوق؛ لم أغيّر العملة أو أخمّن قيمة التحويل.' : 'A reliable exchange rate could not be retrieved; I did not relabel the currency or invent a conversion.'); }
      else { const quote = conversion.quote; sourceId = 'dir3com-currency'; text.push(`${quote.amount.toFixed(2)} ${quote.source} = ${quote.convertedAmount.toFixed(2)} ${quote.target}`, quote.asOf ? `${ar ? 'سعر مرجعي بتاريخ' : 'Reference rate as of'} ${quote.asOf}` : (ar ? 'العملة نفسها؛ لا تحويل مطلوب.' : 'Same currency; no conversion needed.'), ar ? 'تحويل للعرض فقط؛ لا دفع أو تحويل أموال.' : 'Display conversion only; no payment or money transfer.'); }
    }
  } else if (intent.tool === 'maps') {
    text.push(ar ? 'افتح أداة خريطة الوجهة داخل المنصة وحدد المدينة أو المطار. لا أستخدم تتبع الموقع أو أخمّن مدة الطريق.' : 'Open the platform destination-map tool and choose a city or airport. I do not track location or invent a travel duration.', link(ar ? 'خريطة الوجهة' : 'Destination map', '/#home-map'));
  } else if (intent.tool === 'support_cases' || (intent.tool === 'call_center' && parseCustomerCaseReference(intent.reference))) {
    if (context.role !== 'customer') {
      state = context.role === 'guest' ? 'authentication_required' : 'forbidden';
      text.push(ar ? 'قضايا الدعم هنا خاصة بحساب العميل المصادق؛ المرجع أو الدور المكتوب لا يمنح الوصول.' : 'Support cases here belong to the authenticated Customer; a reference or typed role does not grant access.');
    } else {
      const read = context.readSupportCases ? await context.readSupportCases(intent.reference) : { kind: 'unavailable' as const };
      state = read.kind;
      if (read.kind !== 'ready') text.push(read.kind === 'forbidden' || read.kind === 'authentication_required'
        ? (ar ? 'تعذر تأكيد صلاحية حسابك الحالية لقراءة هذه القضية.' : 'Current account authority to read this case could not be verified.')
        : (ar ? 'تعذرت قراءة قضايا الدعم من المنصة؛ لا يعني ذلك أن القائمة فارغة.' : 'Support cases could not be read from the platform; this does not mean the list is empty.'));
      else {
        sourceId = 'dir3com-customer-cases';
        text.push((ar ? 'قضايا حسابك فقط — وقت القراءة: ' : 'Your own cases only — retrieved at: ') + read.retrievedAt);
        if (intent.draft || intent.tool === 'call_center') text.push(ar ? 'ملخص أو مسودة متابعة للمراجعة فقط؛ لم تبدأ مكالمة ولم تُرسل رسالة.' : 'Summary or follow-up draft for review only; no call was started and no message was sent.');
        if (!read.cases.length) text.push(ar ? 'لا توجد قضية مطابقة ضمن حسابك المصرح به.' : 'No matching case exists within your authorized account.');
        const statuses = { received: ar ? 'مستلمة' : 'Received', in_progress: ar ? 'قيد المتابعة' : 'In progress', closed: ar ? 'مغلقة' : 'Closed' };
        for (const item of read.cases) text.push(item.reference + ': ' + statuses[item.status]);
        if (read.truncated) text.push(ar ? 'المعروض أحدث 20 قضية فقط.' : 'Only the latest 20 cases are displayed.');
        text.push(ar ? 'يمكنك تسجيل قضية جديدة صراحة من مساحة الدعم؛ لم تُنشأ قضية أو تُعدّل حالتها من المحادثة.' : 'You can explicitly submit a new case in the support workspace; chat has not created or changed a case.',
          link(ar ? 'قضايا الدعم في حسابي' : 'My support cases', '/support/cases'));
      }
    }
  } else if (intent.tool === 'executive_metrics') {
    if (context.role !== 'ceo') {
      state = context.role === 'guest' ? 'authentication_required' : 'forbidden';
      text.push(ar ? 'مؤشرات المكتب التنفيذي تتطلب هوية CEO المعتمدة؛ نص المحادثة لا يمنحها.' : 'Executive metrics require the verified CEO identity; chat text cannot grant it.');
    } else {
      const read = context.readExecutiveMetrics ? await context.readExecutiveMetrics() : { kind: 'unavailable' as const };
      state = read.kind;
      if (read.kind !== 'ready') text.push(read.kind === 'forbidden'
        ? (ar ? 'تعذر تأكيد صلاحية المكتب التنفيذي الحالية؛ لم أعرض مؤشرات.' : 'Current executive authority could not be verified; no metrics were shown.')
        : (ar ? 'تعذر قراءة مؤشرات اللوحة من مصدرها؛ لا يعني ذلك أن القيم صفر.' : 'Dashboard metrics could not be read from their source; this does not mean the values are zero.'));
      else {
        sourceId = 'dir3com-executive-dashboard';
        text.push(ar ? 'من بيانات لوحة المؤشرات المأذونة؛ مؤشرات الحجوزات والإيراد تخص السجلات الإنتاجية المعادة، وليست إجماليًا شاملًا مثبتًا للمنصة.' : 'From the authorized dashboard data; booking and revenue metrics cover returned production records, not a proven platform-wide total.');
        const labels = {
          productionBookings: ar ? 'الحجوزات الإنتاجية المعروضة' : 'Displayed production bookings',
          confirmedProductionRevenue: ar ? 'الإيراد المؤكد ضمن السجلات المعادة (SAR)' : 'Confirmed revenue within returned records (SAR)',
          pendingSettlements: ar ? 'التسويات المعلقة' : 'Pending settlements',
          pendingRefunds: ar ? 'طلبات الاسترداد المعلقة' : 'Pending refunds',
          pendingVerifications: ar ? 'طلبات التحقق المعلقة' : 'Pending verifications',
          failedNotifications: ar ? 'إخفاقات تسليم الإشعارات' : 'Failed notification deliveries',
        };
        for (const key of Object.keys(labels) as Array<keyof typeof labels>) {
          const metric = read.metrics[key];
          text.push(labels[key] + ': ' + (metric.status === 'available' ? String(metric.value) : (ar ? 'غير متاح' : 'Unavailable')));
        }
        text.push((ar ? 'وقت القراءة: ' : 'Retrieved at: ') + read.retrievedAt, link(ar ? 'لوحة المؤشرات التنفيذية' : 'Executive dashboard', '/admin/dashboard'));
        text.push(ar ? 'قراءة فقط؛ لم تُجر تسوية أو دفعة أو استرداد أو تعديل.' : 'Read only; no settlement, payment, refund or update was performed.');
      }
    }
  } else if (intent.tool === 'contact_inbox') {
    if (!operational) {
      state = context.role === 'guest' ? 'authentication_required' : 'forbidden';
      text.push(ar ? 'صندوق التواصل الداخلي يتطلب صلاحية العمليات الحالية؛ لا يعرض قضايا العملاء لحساب آخر.' : 'The internal contact inbox requires current Operations access; it does not expose cases to another account.');
    } else {
      const read = context.readContactInbox ? await context.readContactInbox() : { kind: 'unavailable' as const };
      state = read.kind;
      if (read.kind !== 'ready') text.push(read.kind === 'forbidden'
        ? (ar ? 'لا توجد صلاحية حالية لقراءة صندوق مصر.' : 'There is no current authority to read the Egypt inbox.')
        : (ar ? 'تعذرت قراءة الصندوق؛ لا يعني ذلك أنه فارغ.' : 'The inbox could not be read; this does not mean it is empty.'));
      else {
        sourceId = 'dir3com-contact-inbox';
        text.push(ar ? 'ملخص حالات آخر رسائل التواصل المعروضة في مصر ضمن صلاحياتك، دون بيانات تواصل أو نصوص أو ملاحظات داخلية.' : 'Status summary of recent displayed Egypt enquiries within your scope, without contact details, message text or internal notes.');
        text.push((ar ? 'المعروض: ' : 'Displayed: ') + read.displayed,
          (ar ? 'مستلمة: ' : 'Received: ') + read.counts.received,
          (ar ? 'قيد المتابعة: ' : 'In progress: ') + read.counts.in_progress,
          (ar ? 'مغلقة: ' : 'Closed: ') + read.counts.closed);
        if (read.truncated) text.push(ar ? 'المعروض أحدث 100 رسالة فقط؛ هذا ليس إجمالي الصندوق.' : 'Only the latest 100 enquiries are displayed; this is not the inbox total.');
        text.push((ar ? 'وقت القراءة: ' : 'Retrieved at: ') + read.retrievedAt, link(ar ? 'صندوق التواصل المأذون' : 'Authorized contact inbox', '/admin/operations/contact'));
        text.push(ar ? 'قراءة فقط؛ لم تُغلق قضية أو تُكتب ملاحظة أو تُرسل رسالة.' : 'Read only; no case was closed, note written or message sent.');
      }
    }
  } else if (intent.tool === 'capabilities') {
    text.push(ar ? 'أساعدك في اختيار سيارات مصر ومقارنتها، تجهيز مواعيد الطلب، استكشاف Stay التجريبي، ومتابعة طلبك وعرض السعر من بيانات حسابك.' : 'I help compare Egypt cars, prepare request dates, explore Sandbox Stay, and read your request and quote from your account.');
    if (operational) text.push(ar ? 'يمكنك طلب قائمة عمليات مصر أو مسودة رد لمرجع REQ محدد؛ القراءة تخضع لصلاحياتك الحالية.' : 'Ask for the Egypt Operations queue or a reply draft for a specific REQ reference; reads use your current permissions.');
    if (context.role === 'ceo') text.push(ar ? 'يمكنك طلب ملخص تنفيذي لحالات طلبات النقل المعروضة. هذا ليس تقرير إيرادات أو دفعات.' : 'You can request an executive summary of the displayed Drive request states. This is not a revenue or payments report.');
    text.push(ar ? 'الدخول مطلوب لبيانات الحساب فقط. لا يوجد في هذه المحادثة اتصال هاتفي أو إرسال واتساب أو تنفيذ حجز أو دفع؛ الإجراءات تتم عبر مساراتها المعتمدة.' : 'Sign-in is needed for account data only. This chat does not place phone calls, send WhatsApp, execute bookings or payments; actions use their approved flows.', supportLink);
  } else if ((intent.tool === 'call_center' || intent.tool === 'support') && !intent.reference) {
    if (intent.tool === 'call_center') text.push(ar ? 'أقدر أجهّز ملخصًا أو مسودة رد للمكالمة. لم أبدأ اتصالًا أو أرسل رسالة. أعطني مرجع REQ لقراءة حالته ضمن صلاحيات حسابك.' : 'I can prepare a call summary or reply draft. No call or message has been sent. Give me a REQ reference to read its state within your account permissions.');
    else text.push(ar ? 'أساعدك في حالة الطلب، مراجعة عرض السعر، أو تجهيز متابعة للإلغاء أو مشكلة الدفع. أرسل مرجع REQ، أو افتح طلباتك لاختياره. لا أعدّل طلبًا أو أعد برد مبلغ من المحادثة.' : 'I can help with request status, a quote, or a cancellation/payment follow-up. Send the REQ reference, or choose it from your requests. Chat does not change a request or promise a refund.');
    text.push(requestsLink, supportLink);
  } else if (intent.tool === 'executive' && context.role !== 'ceo') {
    state = context.role === 'guest' ? 'authentication_required' : 'forbidden';
    text.push(ar ? 'الملخص التنفيذي يتطلب حساب CEO المعتمد. الاسم أو الدور المكتوب في المحادثة لا يمنح هذه الصلاحية.' : 'The executive summary requires the approved CEO account. A name or role typed in chat does not grant access.', link(ar ? 'حسابي' : 'My account', '/my-account'));
  } else {
    const asOperations = intent.tool === 'operations' || intent.tool === 'executive' || (operational && intent.reference !== null);
    const read = await context.readRequests(intent.reference, asOperations);
    state = read.kind;
    if (read.kind === 'authentication_required') text.push(ar ? 'سجّل الدخول من حسابك لقراءة طلباتك بأمان؛ تصفح السيارات والفنادق يبقى متاحًا دون دخول.' : 'Sign in to read your own requests securely; car and hotel browsing remains public.', requestsLink);
    else if (read.kind === 'forbidden') text.push(ar ? 'الحساب الحالي لا يملك صلاحية قراءة هذا النطاق. لم أعرض بيانات لعميل أو دولة خارج صلاحياتك.' : 'This account cannot read this scope. No other customer or country data has been shown.', supportLink);
    else if (read.kind === 'unavailable') text.push(ar ? 'تعذر قراءة حالة الطلب من المنصة الآن. لن أعرض بيانات قديمة أو أعتبر الخطأ قائمة فارغة. يمكنك فتح الطلب مباشرة.' : 'The platform request record could not be read now. I will not use stale data or treat the error as an empty queue. You can open the request directly.', asOperations ? operationsLink : requestsLink);
    else {
      sourceId = 'dir3com-authorized-requests';
      text.push(ar ? `${read.scope === 'own' ? 'طلبات حسابك' : 'طلبات النقل في مصر ضمن صلاحياتك'} — وقت القراءة ${read.retrievedAt}` : `${read.scope === 'own' ? 'Your account requests' : 'Egypt Drive requests within your scope'} — retrieved ${read.retrievedAt}`);
      if (!read.requests.length) text.push(ar ? 'لا يوجد طلب مطابق في النطاق المصرح لك بقراءته.' : 'No matching request exists in your authorized scope.');
      else if (intent.tool === 'executive') {
        const counts = new Map<string, number>();
        for (const row of read.requests) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        text.push(ar ? `ملخص ${read.requests.length} طلبًا حديثًا معروضًا؛ ليس إجمالي طلبات المنصة:` : `Summary of ${read.requests.length} recent displayed requests; not the platform total:`);
        for (const [status, count] of counts) text.push(`${agentRequestStatus(status, locale)}: ${count}`);
        text.push(ar ? 'أولوية المتابعة: الطلبات الجديدة وقيد المراجعة والعروض بانتظار العميل. حالات REQ لا تُحسب حجوزات أو إيرادات.' : 'Follow up new requests, reviews and quotes awaiting the customer. REQ states are not bookings or revenue.');
      } else {
        if (intent.draft && !intent.reference) text.push(ar ? 'لصياغة رد، اختر مرجع REQ محددًا من القائمة أولًا.' : 'Choose a specific REQ reference from the list before drafting a reply.');
        if (intent.draft && intent.reference) text.push(ar ? 'مسودة للمراجعة فقط — لم تُرسل:' : 'Draft for review only — not sent:');
        text.push(...read.requests.map(requestLine));
      }
      if (read.truncated) text.push(ar ? 'المعروض أحدث 20 طلبًا فقط؛ افتح لوحة الطلبات لبقية النتائج.' : 'Only the latest 20 requests are shown; open the workspace for the remaining results.');
      text.push(asOperations ? operationsLink : requestsLink);
      text.push(ar ? 'هذه قراءة للحالة أو مسودة فقط؛ لم يتم قبول عرض أو تأكيد مورد أو حجز أو دفع أو إرسال رسالة.' : 'This is a state read or draft only; no quote acceptance, supplier confirmation, booking, payment or message was executed.');
    }
  }
  return { answer: renderServerReply(text.segments, locale, message, state === 'unavailable' ? 'unavailable' : 'read_only'), sources: [{ sourceId, sourceName: sourceId === 'dir3com-authorized-requests' ? 'Authorized DIR3COM request records' : sourceId === 'dir3com-weather' ? 'DIR3COM weather tool / Open-Meteo' : sourceId === 'dir3com-currency' ? 'DIR3COM currency tool / Frankfurter' : sourceId === 'dir3com-customer-cases' ? 'Authorized own Customer support case states' : sourceId === 'dir3com-executive-dashboard' ? 'Authorized DIR3COM executive dashboard' : sourceId === 'dir3com-contact-inbox' ? 'Authorized DIR3COM contact inbox status counts' : 'dir3com service journeys', sourceType: 'internal' as const }], language: locale, groundingStatus: state === 'unavailable' ? 'fallback-no-source' as const : 'grounded' as const, provider: 'local' as const, retrievalMode: 'internal-tools' as const, agent: { role: context.role, tool: intent.tool, state, mutations: 0 } };
}
