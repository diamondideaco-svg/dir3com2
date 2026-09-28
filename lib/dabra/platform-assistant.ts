import { DRIVE_OFFERS, vehicleFor, vehicleTitle, type DriveOffer } from '../drive/catalog';
import { serviceEntryHref } from '../marketplace/public-entry';
import { cairoInstant } from '../drive/search';

type Locale = 'ar' | 'en';
type Turn = { role: 'user' | 'assistant'; content: string };
export type PlatformFamily = 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';
const familyTerms: Record<PlatformFamily, RegExp> = {
  drive: /\b(car|cars|drive|chauffeur|driver|transfer|mercedes|jetour|nissan|kia|hyundai|toyota|rover|cadillac|soueast|bmw|tesla|audi|honda)\b|سيار|سواق|سائق|توصيل|استقبال المطار|مرسيدس|جيتور|نيسان|كيا|هيونداي|تويوتا|روفر|كاديلاك|بي ام|تسلا|اودي|هوندا|ساوايست|سوإيست|سوايست/,
  stay: /\b(hotel|hotels|stay|apartment|apartments|accommodation)\b|فندق|فنادق|اقامه|شقه|شقق/,
  fly: /\b(flight|flights|fly|airline|airlines)\b|طيران|تذاكر|تذكره/,
  concierge: /concierge|restaurant|كونسيرج|مطعم|مطاعم|تجارب|فعاليات/,
  vip: /\bvip\b|كبار الشخصيات|استقبال فاخر/,
};
export function normalizePlatformQuery(input: string) {
  return input.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/جي\s*كلاس/g, 'g class').replace(/سبورت/g, 'sport').replace(/رينج روفر|رانج روفر|رنج روفر/g, 'range rover').replace(/مرسيدس بنز/g, 'مرسيدس').replace(/رانج|رنج/g, 'رينج').replace(/صاني/g, 'صني').replace(/\s+/g, ' ').trim();
}
export function platformFamilies(message: string): PlatformFamily[] {
  const text = normalizePlatformQuery(message);
  return (Object.keys(familyTerms) as PlatformFamily[]).filter(f => familyTerms[f].test(text));
}
export function platformContext(message: string, history: Turn[] = []) {
  const current = platformFamilies(message);
  // Only a bounded user turn can supply omitted preferences. Assistant text is never authority.
  const prior = history.filter(t => t.role === 'user').slice(-4).reverse().find(t => platformFamilies(t.content).length);
  return current.length || !prior ? message : `${prior.content.slice(0, 500)}\n${message}`;
}
export function platformEntry(family: PlatformFamily, message: string, locale: Locale) {
  const text = normalizePlatformQuery(message);
  const params = new URLSearchParams({ language: locale });
  const cities = [['cairo', 'القاهره'], ['giza', 'الجيزه'], ['riyadh', 'الرياض'], ['jeddah', 'جده'], ['dubai', 'دبي'], ['alexandria', 'الاسكندريه']] as const;
  const city = cities.find(([en, ar]) => text.includes(en) || text.includes(ar));
  if (city) params.set('destination', city[0]);
  const currency = text.match(/\b(usd|sar|egp|eur|aed)\b/)?.[1]?.toUpperCase() ?? (/دولار/.test(text) ? 'USD' : /ريال/.test(text) ? 'SAR' : /جنيه/.test(text) ? 'EGP' : undefined);
  if (currency) params.set('currency', currency);
  const dates = text.match(/\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2})?/g) ?? [];
  if (family === 'drive') {
    if (dates[0]) params.set(dates[0].includes('t') ? 'pickupAt' : 'pickupDate', dates[0].replace('t', 'T'));
    if (dates[1]) params.set(dates[1].includes('t') ? 'returnAt' : 'returnDate', dates[1].replace('t', 'T'));
    if (/airport|المطار/.test(text)) params.set('mode', 'airport');
  } else if (family === 'stay') {
    if (dates[0]) params.set('checkIn', dates[0].slice(0, 10));
    if (dates[1]) params.set('checkOut', dates[1].slice(0, 10));
  }
  const pax = text.match(/\b([1-9]\d?)\s*(?:adults?|people|passengers?|بالغ|اشخاص|مسافر)/)?.[1];
  if (pax && Number(pax) <= 20) params.set(family === 'stay' ? 'adults' : 'passengers', pax);
  return serviceEntryHref(family, params);
}

/** Approved rate catalogue, never live supplier availability. No network or transaction side effects. */
export function findPlatformDriveOffers(message: string): DriveOffer[] {
  const text = normalizePlatformQuery(message);
  if (/riyadh|jeddah|dubai|الرياض|جده|دبي/.test(text) && !/cairo|giza|القاهره|الجيزه|egypt|مصر/.test(text)) return [];
  if (/\b(bmw|tesla|audi|honda)\b|بي ام|تسلا|اودي|هوندا/.test(text)) return [];
  const makes = [...new Set(DRIVE_OFFERS.map(o => vehicleFor(o).make))];
  const matchingMakes = makes.filter(make => DRIVE_OFFERS.some(o => {
    const v = vehicleFor(o);
    return v.make === make && (text.includes(normalizePlatformQuery(make)) || text.includes(normalizePlatformQuery(v.ar.split(' ')[0])));
  }));
  const modelTokens = [...new Set(DRIVE_OFFERS.map(o => normalizePlatformQuery(vehicleFor(o).model)))];
  const models = modelTokens.filter(model => new RegExp(`(?:^|[^a-z0-9])${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')}(?:$|[^a-z0-9])`).test(text));
  const requestedCodes = text.match(/\b[a-z]{1,3}\s*\d{1,4}\b/g) ?? [];
  if (requestedCodes.some(code => !modelTokens.some(model => model.replace(/\s/g,'').includes(code.replace(/\s/g,''))))) return [];
  const longestModels = models.filter(model => !models.some(other => other !== model && other.includes(model)));
  const airport = /airport|المطار/.test(text);
  const budget = text.match(/(?:under|below|max(?:imum)?|اقل من|حد اقصي|ميزانيه)\s*\$?\s*(\d+(?:\.\d{1,2})?)/)?.[1];
  const usdBudget = budget && /\$|usd|دولار/.test(text) ? Number(budget) : undefined;
  return DRIVE_OFFERS.filter(o => {
    const vehicle = vehicleFor(o), price = airport ? o.airport : o.chauffeur;
    return price !== null && (!matchingMakes.length || matchingMakes.includes(vehicle.make))
      && (!longestModels.length || longestModels.includes(normalizePlatformQuery(vehicle.model)))
      && (usdBudget === undefined || (o.currency === 'USD' && price <= usdBudget));
  }).sort((a, b) => {
    const direction = /expensive|highest|اغلي|الاعلي/.test(text) ? -1 : 1;
    return direction * ((airport ? a.airport! : a.chauffeur) - (airport ? b.airport! : b.chauffeur)) || a.id.localeCompare(b.id);
  });
}

/** Public DABRA uses platform capabilities only. Environment flags cannot enable a web fallback. */
export function buildPlatformAssistantResponse(message: string, history: Turn[] = [], locale: Locale = 'ar', now = Date.now(), familyOverride?: PlatformFamily) {
  const context = platformContext(message, history), text = normalizePlatformQuery(context), current = normalizePlatformQuery(message);
  const ar = locale === 'ar';
  const families = familyOverride ? [familyOverride] : platformFamilies(context);
  const link = (label: string, href: string) => `[${label}](${href})`;
  const lines: string[] = [];
  if (/cancel|refund|الغاء|الغي|استرد|حجوزاتي|طلباتي|my requests|my bookings|حاله طلبي|حالة الطلب/.test(current)) {
    lines.push(ar ? 'تابع حالة طلبك أو عرض العمليات من حسابك. افتح الطلب المحدد للمراجعة؛ لا أعدّل أو ألغي طلبًا من المحادثة.' : 'Review your request and the Operations offer in your account. Open the specific request; chat does not change or cancel it.');
    lines.push(link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
  } else if (/pay|payment|ادفع|دفع|تحويل|كاش/.test(current) && !families.length) {
    lines.push(ar ? 'راجع المبلغ وطريقة التحصيل مع العمليات من طلبك. لا أسجّل دفعًا أو تأكيدًا من المحادثة.' : 'Review the amount and collection method with Operations in your request. Chat does not record payment or confirmation.', link(ar ? 'متابعة الطلب' : 'View requests', '/my-requests'));
  } else {
    if (!families.length && /trip|itinerary|رحله|برنامج|خطه سفر/.test(current)) families.push('drive', 'stay');
    for (const family of families) {
      const href = platformEntry(family, context, locale);
      if (family === 'drive') {
        const offers = findPlatformDriveOffers(context), airport = /airport|المطار/.test(text);
        const pickup = new URL(href, 'https://dir3com.com').searchParams.get('pickupAt');
        const instant = pickup ? cairoInstant(pickup) : null;
        const tooSoon = (instant !== null && instant < now + 6 * 3600000) || /(?:after|in)\s*[1-5]\s*hours?|بعد\s*(?:ساعه|ساعتين|[1-5]\s*ساعات)/.test(current);
        if (tooSoon) lines.push(ar ? 'الموعد أقرب من 6 ساعات؛ اختر موعدًا بعد 6 ساعات على الأقل حتى تقبل المنصة إنشاء الطلب.' : 'Pickup is less than 6 hours away. Choose a pickup at least 6 hours ahead to submit a request.');
        if (offers.length) {
          lines.push(ar ? `هذه أسعار كتالوج dir3com في مصر، والتوفر تؤكده العمليات (${offers.length} خيارًا مطابقًا):` : `These are dir3com catalogue rates in Egypt, with availability confirmed by Operations (${offers.length} matching options):`);
          for (const offer of offers.slice(0, 3)) lines.push(link(`${vehicleTitle(vehicleFor(offer), locale)}: ${(airport ? offer.airport! : offer.chauffeur).toFixed(2)} ${offer.currency} / ${airport ? (ar ? 'استقبال مطار' : 'airport transfer') : (ar ? 'يوم' : 'day')}`, `${href}&offer=${encodeURIComponent(offer.id)}`));
          lines.push(ar ? 'السعر المعروض للسيارة، وليس إجمالي الرحلة. اليوم يشمل السائق والبنزين و120 كم؛ تؤكد العمليات الإجمالي والمواصفات.' : 'Shown rates are per vehicle, not a trip total. A day includes driver, fuel and 120 km; Operations confirms the total and vehicle details.');
        } else lines.push(ar ? 'لم أجد سيارة مطابقة ضمن الكتالوج الحالي. غيّر الطراز أو الميزانية، أو راجع خيارات مصر.' : 'No car matches the current catalogue. Adjust the model or budget, or review Egypt options.');
        lines.push(link(ar ? 'اختيار السيارة وإكمال مواعيد الطلب' : 'Choose a car and complete request dates', href));
        lines.push(ar ? 'إنشاء الطلب قبل الموعد بـ6 ساعات على الأقل. الدخول عند إرسال الطلب، ثم تؤكد عمليات مصر السيارة والسعر. لم يُنشأ طلب أو حجز من هذه المحادثة.' : 'Submit at least 6 hours before pickup. Sign in when submitting; Egypt Operations confirms the vehicle and price. This chat has not created a request or booking.');
      } else if (family === 'stay') {
        lines.push(ar ? 'ابحث عن الفنادق داخل Stay وحدد المدينة والتواريخ والنزلاء. نتائج LiteAPI موسومة Sandbox؛ الأسعار تأتي من البحث نفسه، والحجز والدفع غير مفعّلين لهذا المسار.' : 'Search hotels inside Stay with a city, dates and guests. LiteAPI results are labelled Sandbox; rates come from the search response. Booking and payment are disabled for this flow.', link(ar ? 'البحث عن الفنادق داخل dir3com' : 'Search hotels inside dir3com', href));
      } else if (family === 'fly' || family === 'concierge') {
        lines.push(ar ? `${family === 'fly' ? 'الطيران' : 'الكونسيرج'} قيد التجهيز داخل dir3com. أستطيع الآن ترتيب التنقل في مصر واستكشاف الإقامة من المنصة.` : `${family === 'fly' ? 'Fly' : 'Concierge'} is coming soon inside dir3com. I can help with Egypt transport and Stay discovery now.`, link(ar ? 'الخدمات داخل المنصة' : 'Services inside dir3com', '/services'));
      } else lines.push(ar ? 'راجع عروض VIP المنشورة داخل المنصة. تفاصيل الخدمة والسعر والتوفر تتحدد في العرض ومراجعة العمليات.' : 'Review published VIP options inside dir3com. The listing and Operations review determine details, price and availability.', link(ar ? 'استكشاف VIP' : 'Explore VIP', href));
    }
    if (!lines.length) lines.push(ar ? 'أنا الدبرة، مساعدك داخل dir3com. أقدر أعرض سيارات مصر وأسعارها، أو أفتح بحث الفنادق، أو أوصلك لمتابعة طلبك. أي خدمة ومدينة تريد؟' : 'I’m DABRA, your assistant inside dir3com. I can show Egypt cars and rates, open hotel search, or help you follow your request. Which service and city do you need?', link(ar ? 'السيارات والأسعار' : 'Cars and rates', platformEntry('drive', context, locale)), link(ar ? 'بحث الإقامة' : 'Stay search', platformEntry('stay', context, locale)), link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
  }
  return { answer: lines.join('\n\n'), sources: [{ sourceId: 'dir3com-platform', sourceName: 'dir3com catalogue and service journeys', sourceType: 'internal' as const }], language: locale, groundingStatus: 'grounded' as const, provider: 'local' as const, retrievalMode: 'internal-catalog' as const };
}
