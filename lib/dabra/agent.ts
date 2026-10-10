import { renderServerReply, serverReplyLink, serverReplySegments } from './conversation-renderer';
import { agentIntent, agentRequestStatus, type AgentContext, type AgentIntent, type AgentRequest } from './agent-contract';
import { buildPlatformAssistantResponse, type PlatformPricing } from './platform-assistant';
import { normalizePlatformQuery } from './platform-assistant';
import { getWeatherSnapshot } from '../weather/service';
import { convertCurrency } from '../currency/service';
import { displayPrice, parseDisplayCurrency } from '../currency/display';
import type { SavedTrip } from './continuity-contract';

type Input = {
  message: string; locale: 'ar' | 'en'; history: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: AgentContext; pricing?: PlatformPricing; intent?: AgentIntent; trip?: SavedTrip | null;
};

/** The model can select a read tool. Facts, permissions, links and replies stay server-owned. */
export async function runInternalAgent({ message, locale, history, context, pricing, trip, intent = agentIntent(message) }: Input) {
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

  if (intent.tool === 'discover') return { ...buildPlatformAssistantResponse(message, history, locale, undefined, undefined, pricing, trip), agent: { role: context.role, tool: intent.tool, state: 'catalogue', mutations: 0 } };

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
  return { answer: renderServerReply(text.segments, locale, message, state === 'unavailable' ? 'unavailable' : 'read_only'), sources: [{ sourceId, sourceName: sourceId === 'dir3com-authorized-requests' ? 'Authorized DIR3COM request records' : sourceId === 'dir3com-weather' ? 'DIR3COM weather tool / Open-Meteo' : sourceId === 'dir3com-currency' ? 'DIR3COM currency tool / Frankfurter' : 'dir3com service journeys', sourceType: 'internal' as const }], language: locale, groundingStatus: state === 'unavailable' ? 'fallback-no-source' as const : 'grounded' as const, provider: 'local' as const, retrievalMode: 'internal-tools' as const, agent: { role: context.role, tool: intent.tool, state, mutations: 0 } };
}
