import { AI2_DABRA_CONVERSATION_COPY } from '../ai2/prompt/contract';
import { conversationReply, renderServerReply, serverReplyLink, serverReplySegments } from './conversation-renderer';
import { DRIVE_OFFERS, vehicleFor, vehicleTitle, type DriveOffer } from '../drive/catalog';
import { serviceEntryHref } from '../marketplace/public-entry';
import { cairoInstant } from '../drive/search';
import { validSearchDate } from '../marketplace/search-context';
import { withoutNegativeActions } from './intent-constraints';
import type { SavedTrip } from './continuity-contract';
import { cityRoles, newTripRequested, routingPlace, refineRoutingTrip, withoutRoutingCities } from './trip-routing';

import { displayPrice, parseDisplayCurrency, type DisplayCurrency, type FxSnapshot } from '../currency/display';
export type PlatformPricing = { currency: DisplayCurrency; snapshot: FxSnapshot | null };
export function platformCurrency(message: string) {
  const text = normalizePlatformQuery(message);
  const latest = [...text.matchAll(/\b(?:usd|sar|egp|eur|aed)\b|دولار|\$|ريال|جنيه|يورو|درهم/g)].at(-1)?.[0] ?? '';
  const aliases: Record<string, string> = { دولار: 'USD', '$': 'USD', ريال: 'SAR', جنيه: 'EGP', يورو: 'EUR', درهم: 'AED' };
  return parseDisplayCurrency(aliases[latest] ?? latest);
}
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
export function platformContext(message: string, history: Turn[] = [], trip?: SavedTrip | null) {
  // Replay contextual USER answers in order, so an accepted bare count has the
  // same preference semantics as a qualified count on subsequent refinements.
  // The bounded transcript is not mutated and assistant assertions are never facts.
  const reconstructed: Turn[] = [];
  for (const turn of history.slice(-8)) {
    const content = turn.content.slice(0, 500);
    reconstructed.push({ role: turn.role, content: turn.role === 'user' ? contextualStayGuests(content, reconstructed) ?? content : content });
  }
  const context = preferenceContext(contextualStayGuests(message, reconstructed) ?? message, reconstructed);
  if (!trip || newTripRequested(message)) return context;
  // Routing receives the typed trip separately. This projection only supplies
  // non-location preferences; no human-readable summary supplies city roles.
  return [trip.families.join(' '), trip.startDate, trip.endDate,
    `${trip.adults} adults`, `${trip.rooms} rooms`, trip.currency, message].filter(Boolean).join('\n');
}

/** Merge already reconstructed user preferences; no recursive transcript replay. */
function preferenceContext(message: string, history: Turn[]) {
  // Carry only bounded user preferences, never assistant assertions or account data.
  // New explicit preferences override old ones, including when the user names a family.
  const turns = [...history.filter(t => t.role === 'user').slice(-4).map(t => t.content.slice(0, 500)), message];
  const reset = turns.findLastIndex(turn => /new trip|start over|رحله جديده|ابدا من جديد/.test(normalizePlatformQuery(turn)));
  const relevant = turns.slice(Math.max(0, reset));
  const preferences = relevant.map(turn => tripPreferences(normalizePlatformQuery(turn)));
  const current = preferences.at(-1)!;
  const previous = preferences.slice(0, -1).reverse();
  const carry: string[] = [];
  if (!platformFamilies(message).length) {
    const prior = relevant.slice(0, -1).reverse().find(turn => platformFamilies(turn).length);
    // Retain catalogue refinements (model/budget), but never private/request text.
    if (prior && !/\bREQ-|طلباتي|my requests|operations|\bceo\b/i.test(prior)) {
      carry.push(current.ambiguous ? platformFamilies(prior).join(' ') : current.city ? withoutRoutingCities(prior) : prior);
    }
  }
  if (!current.city && !current.ambiguous) { const city = previous.find(p => p.city || p.ambiguous); if (city?.city) carry.push(`destination: ${city.city}`); }
  if (!current.hasDates) { const dates = previous.find(p => p.hasDates)?.dates; if (dates?.length) carry.push(dates.join(' ')); }
  if (!current.party) { const party = previous.find(p => p.party)?.party; if (party) carry.push(`${party} adults`); }
  if (!current.rooms) { const rooms = previous.find(p => p.rooms)?.rooms; if (rooms) carry.push(`${rooms} rooms`); }
  if (!platformCurrency(message)) {
    const currency = relevant.slice(0, -1).reverse().map(platformCurrency).find(Boolean);
    if (currency) carry.push(currency);
  }
  return [...carry, message].join('\n');
}

/** A bare count is a preference only immediately after the missing Stay guest question. */
function contextualStayGuests(message: string, history: Turn[]): string | null {
  const number = normalizePlatformQuery(message);
  if (!/^[1-9]\d?$/.test(number) || Number(number) > 20) return null;
  const recent = history.slice(-8);
  const question = recent.at(-1);
  const user = recent.at(-2);
  if (question?.role !== 'assistant' || user?.role !== 'user') return null;
  const lastLine = question.content.trim().split(/\n\s*\n/).at(-1);
  if (![AI2_DABRA_CONVERSATION_COPY.ar.guestsQuestion, AI2_DABRA_CONVERSATION_COPY.en.guestsQuestion].some(copy => copy === lastLine)) return null;
  if (/\breq-|my requests|my bookings|operations|executive|\bceo\b|طلباتي|حجوزاتي|عمليات|الغاء|استرد|payment|\bpay\b/.test(normalizePlatformQuery(user.content))) return null;
  // Assistant text only signals conversational position. Recheck family and missing
  // preference from bounded USER context; it supplies no factual/account authority.
  const prior = preferenceContext(user.content, recent.slice(0, -2));
  const families = platformFamilies(prior), preferences = tripPreferences(normalizePlatformQuery(prior));
  if (families.length !== 1 || families[0] !== 'stay' || !preferences.city || preferences.dates.length !== 2 || preferences.party) return null;
  return `${number} adults`;
}

const months = ['january|يناير', 'february|فبراير', 'march|مارس', 'april|ابريل', 'may|مايو', 'june|يونيو', 'july|يوليو', 'august|اغسطس', 'september|سبتمبر', 'october|اكتوبر', 'november|نوفمبر', 'december|ديسمبر'];
function tripPreferences(text: string, trip?: SavedTrip | null) {
  const roles = cityRoles(text);
  const city = roles.ambiguous ? undefined : trip ? routingPlace(trip.destination) : roles.city;
  const iso = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2})?\b/g)];
  const range = [...text.matchAll(new RegExp(`(?:^|\\s)(\\d{1,2})\\s*(?:to|through|until|الي|حتي|[-–])\\s*(\\d{1,2})\\s+(${months.join('|')})\\s+(\\d{4})(?=\\s|[.,،]|$)`, 'g'))].at(-1);
  const month = range ? months.findIndex(names => names.split('|').includes(range[3])) + 1 : 0;
  const dates = range && (range.index ?? 0) > (iso.at(-1)?.index ?? -1)
    ? [range[1], range[2]].map(day => `${range[4]}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`)
    : iso.slice(-2).map(match => match[0]);
  const safeDates = dates.filter(date => validSearchDate(date.slice(0, 10)) && (!date.includes('t') || /t(?:[01]\d|2[0-3]):[0-5]\d$/.test(date)));
  const parties = [...text.matchAll(/(?:^|\s)([1-9]\d?)\s*(?:adults?|people|passengers?|بالغ(?:ين|ان)?|اشخاص|مسافر(?:ين|ان)?)(?=\s|[.,،]|$)/g)];
  const numericParty = parties.at(-1)?.[1];
  const party = numericParty && Number(numericParty) <= 20 ? numericParty : /(?:لشخصين|شخصين|بالغين|two adults)/.test(text) ? '2' : undefined;
  const roomMatches = [...text.matchAll(/(?:^|\s)([1-8])\s*(?:rooms?|غرف(?:ه)?)(?=\s|[.,،]|$)/g)];
  const rooms = roomMatches.at(-1)?.[1] ?? (/\bone room\b|غرفه واحده/.test(text) ? '1' : undefined);
  return { city, ambiguous: roles.ambiguous, dates: safeDates.length === dates.length ? safeDates : [], hasDates: iso.length > 0 || Boolean(range), party, rooms };
}
export function platformEntry(family: PlatformFamily, message: string, locale: Locale, displayCurrency?: DisplayCurrency, trip?: SavedTrip | null) {
  const text = normalizePlatformQuery(message);
  const params = new URLSearchParams({ language: locale });
  const { city, dates, party, rooms } = tripPreferences(text, trip);
  if (city) params.set('destination', city);
  const currency = displayCurrency ?? platformCurrency(message);
  if (currency) params.set('currency', currency);
  if (family === 'drive') {
    if (dates[0]) params.set(dates[0].includes('t') ? 'pickupAt' : 'pickupDate', dates[0].replace('t', 'T'));
    if (dates[1]) params.set(dates[1].includes('t') ? 'returnAt' : 'returnDate', dates[1].replace('t', 'T'));
    if (/airport|المطار/.test(text)) params.set('mode', 'airport');
  } else if (family === 'stay') {
    if (dates[0]) params.set('checkIn', dates[0].slice(0, 10));
    if (dates[1]) params.set('checkOut', dates[1].slice(0, 10));
    if (rooms) params.set('rooms', rooms);
  }
  if (party) params.set(family === 'stay' ? 'adults' : 'passengers', party);
  return serviceEntryHref(family, params);
}

/** Ephemeral explicit refinements, never a write to saved account continuity. */
export function refinePlatformTrip(trip: SavedTrip, message: string): SavedTrip {
  const parsed = tripPreferences(normalizePlatformQuery(message));
  return { ...refineRoutingTrip(trip, message),
    adults: parsed.party && Number(parsed.party) + trip.children <= 20 ? Number(parsed.party) : trip.adults,
    rooms: parsed.rooms ? Number(parsed.rooms) : trip.rooms,
    startDate: parsed.dates.length === 2 && parsed.dates[0] <= parsed.dates[1] ? parsed.dates[0].slice(0, 10) : trip.startDate,
    endDate: parsed.dates.length === 2 && parsed.dates[0] <= parsed.dates[1] ? parsed.dates[1].slice(0, 10) : trip.endDate };
}

/** Approved rate catalogue, never live supplier availability. No network or transaction side effects. */
export function findPlatformDriveOffers(message: string, pricing?: PlatformPricing): DriveOffer[] {
  const text = normalizePlatformQuery(message);
  // The latest explicit destination wins over carried conversation context.
  if (['riyadh', 'jeddah', 'dubai'].includes(tripPreferences(text).city ?? '')) return [];
  if (/\b(bmw|tesla|audi|honda)\b|بي ام|تسلا|اودي|هوندا/.test(text)) return [];
  const makes = [...new Set(DRIVE_OFFERS.map(o => vehicleFor(o).make))];
  const matchingMakes = makes.filter(make => DRIVE_OFFERS.some(o => {
    const v = vehicleFor(o);
    return v.make === make && (text.includes(normalizePlatformQuery(make)) || text.includes(normalizePlatformQuery(v.ar.split(' ')[0])));
  }));
  const modelTokens = [...new Set(DRIVE_OFFERS.map(o => normalizePlatformQuery(vehicleFor(o).model)))];
  const models = modelTokens.filter(model => new RegExp(`(?:^|[^a-z0-9])${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')}(?:$|[^a-z0-9])`).test(text));
  const requestedCodes = text.match(/\b(?:[a-z]{1,3}\d{1,3}|[tesvghx]\s+\d{1,3})\b/g) ?? [];
  if (requestedCodes.some(code => !modelTokens.some(model => model.replace(/\s/g,'').includes(code.replace(/\s/g,''))))) return [];
  const longestModels = models.filter(model => !models.some(other => other !== model && other.includes(model)));
  const airport = /airport|المطار/.test(text);
  const budget = text.match(/(?:under|below|max(?:imum)?|اقل من|حد اقصي|ميزانيه)\s*\$?\s*(\d+(?:\.\d{1,2})?)/)?.[1];
  const budgetCurrency = platformCurrency(message) ?? pricing?.currency ?? 'USD';
  const maxBudget = budget ? Number(budget) : undefined;
  return DRIVE_OFFERS.filter(o => {
    const vehicle = vehicleFor(o), price = airport ? o.airport : o.chauffeur;
    return price !== null && (!matchingMakes.length || matchingMakes.includes(vehicle.make))
      && (!longestModels.length || longestModels.includes(normalizePlatformQuery(vehicle.model)))
      && (maxBudget === undefined || (() => { const converted = displayPrice(price, o.currency, budgetCurrency, pricing?.snapshot); return !converted.unavailable && converted.amount <= maxBudget; })());
  }).sort((a, b) => {
    const direction = /expensive|highest|اغلي|الاعلي/.test(text) ? -1 : 1;
    const target = pricing?.currency ?? budgetCurrency;
    const left = displayPrice(airport ? a.airport! : a.chauffeur, a.currency, target, pricing?.snapshot);
    const right = displayPrice(airport ? b.airport! : b.chauffeur, b.currency, target, pricing?.snapshot);
    return (left.currency === right.currency ? direction * (left.amount - right.amount) : left.currency.localeCompare(right.currency)) || a.id.localeCompare(b.id);
  });
}

/** Public DABRA uses platform capabilities only. Environment flags cannot enable a web fallback. */
export function buildPlatformAssistantResponse(message: string, history: Turn[] = [], locale: Locale = 'ar', now = Date.now(), familyOverride?: PlatformFamily, pricing?: PlatformPricing, trip?: SavedTrip | null) {
  if (newTripRequested(message)) trip = null;
  const context = platformContext(message, history, trip), text = normalizePlatformQuery(context), current = withoutNegativeActions(normalizePlatformQuery(message));
  const ar = locale === 'ar';
  const families = familyOverride ? [familyOverride] : platformFamilies(context);
  const link = serverReplyLink;
  const lines = serverReplySegments();
  const smallTalk = familyOverride ? null : conversationReply(message, history, locale);
  if (smallTalk) lines.push(smallTalk);
  else if (/cancel|refund|الغاء|الغي|استرد|حجوزاتي|طلباتي|my requests|my bookings|حاله طلبي|حالة الطلب/.test(current)) {
    lines.push(ar ? 'تابع حالة طلبك أو عرض العمليات من حسابك. افتح الطلب المحدد للمراجعة؛ لا أعدّل أو ألغي طلبًا من المحادثة.' : 'Review your request and the Operations offer in your account. Open the specific request; chat does not change or cancel it.');
    lines.push(link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
  } else if (/pay|payment|ادفع|دفع|تحويل|كاش/.test(current) && !families.length) {
    lines.push(ar ? 'راجع المبلغ وطريقة التحصيل مع العمليات من طلبك. لا أسجّل دفعًا أو تأكيدًا من المحادثة.' : 'Review the amount and collection method with Operations in your request. Chat does not record payment or confirmation.', link(ar ? 'متابعة الطلب' : 'View requests', '/my-requests'));
  } else {
    if (!families.length && /trip|itinerary|رحله|برنامج|خطه سفر/.test(current)) families.push('drive', 'stay');
    for (const family of families) {
      const href = platformEntry(family, context, locale, pricing?.currency, trip);
      if (family === 'drive') {
        const offers = findPlatformDriveOffers(context, pricing), airport = /airport|المطار/.test(text);
        const pickup = new URL(href, 'https://dir3com.com').searchParams.get('pickupAt');
        const instant = pickup ? cairoInstant(pickup) : null;
        const tooSoon = (instant !== null && instant < now + 6 * 3600000) || /(?:after|in)\s*[1-5]\s*hours?|بعد\s*(?:ساعه|ساعتين|[1-5]\s*ساعات)/.test(current);
        if (tooSoon) lines.push(ar ? 'الموعد أقرب من 6 ساعات؛ اختر موعدًا بعد 6 ساعات على الأقل حتى تقبل المنصة إنشاء الطلب.' : 'Pickup is less than 6 hours away. Choose a pickup at least 6 hours ahead to submit a request.');
        if (offers.length) {
          lines.push(ar ? `هذه أسعار كتالوج dir3com في مصر، والتوفر تؤكده العمليات (${offers.length} خيارًا مطابقًا):` : `These are dir3com catalogue rates in Egypt, with availability confirmed by Operations (${offers.length} matching options):`);
          for (const offer of offers.slice(0, 3)) {
            const price = displayPrice(airport ? offer.airport! : offer.chauffeur, offer.currency, pricing?.currency ?? platformCurrency(context) ?? offer.currency, pricing?.snapshot);
            lines.push(link(`${vehicleTitle(vehicleFor(offer), locale)}: ${price.amount.toFixed(2)} ${price.currency} / ${airport ? (ar ? 'استقبال مطار' : 'airport transfer') : (ar ? 'يوم' : 'day')}`, `${href}&offer=${encodeURIComponent(offer.id)}`));
          }
          if (pricing?.snapshot && pricing.currency !== 'USD') lines.push(ar ? `تحويل للعرض بتاريخ ${pricing.snapshot.asOf}؛ سعر الطلب النهائي تؤكده العمليات.` : `Display conversion as of ${pricing.snapshot.asOf}; Operations confirms the final quote.`);
          else if (pricing && !pricing.snapshot && offers.some(o => o.currency !== pricing.currency)) lines.push(ar ? 'تعذر جلب سعر الصرف؛ الأسعار بعملة المصدر، وليست بالعملة المختارة.' : 'Exchange rates are unavailable; prices are in source currency, not the selected currency.');
          lines.push(ar ? 'السعر المعروض للسيارة، وليس إجمالي الرحلة. اليوم يشمل السائق والبنزين و120 كم؛ تؤكد العمليات الإجمالي والمواصفات.' : 'Shown rates are per vehicle, not a trip total. A day includes driver, fuel and 120 km; Operations confirms the total and vehicle details.');
        } else lines.push(ar ? 'لم أجد سيارة مطابقة ضمن الكتالوج الحالي. غيّر الطراز أو الميزانية، أو راجع خيارات مصر.' : 'No car matches the current catalogue. Adjust the model or budget, or review Egypt options.');
        lines.push(link(ar ? 'اختيار السيارة وإكمال مواعيد الطلب' : 'Choose a car and complete request dates', href));
        lines.push(ar ? 'إنشاء الطلب قبل الموعد بـ6 ساعات على الأقل. الدخول عند إرسال الطلب، ثم تؤكد عمليات مصر السيارة والسعر. لم يُنشأ طلب أو حجز من هذه المحادثة.' : 'Submit at least 6 hours before pickup. Sign in when submitting; Egypt Operations confirms the vehicle and price. This chat has not created a request or booking.');
      } else if (family === 'stay') {
        if (tripPreferences(text, trip).ambiguous) {
          lines.push(ar ? 'أي مدينة تقصد للإقامة؟ حدّد الوجهة ومدينة المغادرة بشكل منفصل.' : 'Which city is your Stay destination? Specify the destination and departure city separately.');
          continue;
        }
        lines.push(ar ? 'ابحث عن الفنادق داخل Stay وحدد المدينة والتواريخ والنزلاء. نتائج LiteAPI موسومة Sandbox؛ الأسعار تأتي من البحث نفسه، والحجز والدفع غير مفعّلين لهذا المسار.' : 'Search hotels inside Stay with a city, dates and guests. LiteAPI results are labelled Sandbox; rates come from the search response. Booking and payment are disabled for this flow.', link(ar ? 'البحث عن الفنادق داخل dir3com' : 'Search hotels inside dir3com', href));
      } else if (family === 'fly' || family === 'concierge') {
        lines.push(ar ? `${family === 'fly' ? 'الطيران' : 'الكونسيرج'} قيد التجهيز داخل dir3com. أستطيع الآن ترتيب التنقل في مصر واستكشاف الإقامة من المنصة.` : `${family === 'fly' ? 'Fly' : 'Concierge'} is coming soon inside dir3com. I can help with Egypt transport and Stay discovery now.`, link(ar ? 'الخدمات داخل المنصة' : 'Services inside dir3com', '/services'));
      } else lines.push(ar ? 'راجع عروض VIP المنشورة داخل المنصة. تفاصيل الخدمة والسعر والتوفر تتحدد في العرض ومراجعة العمليات.' : 'Review published VIP options inside dir3com. The listing and Operations review determine details, price and availability.', link(ar ? 'استكشاف VIP' : 'Explore VIP', href));
    }
    const copy = AI2_DABRA_CONVERSATION_COPY[locale];
    if (!lines.length) {
      if (!history.slice(-8).some(turn => turn.role === 'assistant')) lines.push(copy.identity);
      lines.push(copy.serviceQuestion);
      lines.push(link(ar ? 'السيارات والأسعار' : 'Cars and rates', platformEntry('drive', context, locale, pricing?.currency)), link(ar ? 'بحث الإقامة' : 'Stay search', platformEntry('stay', context, locale, pricing?.currency)), link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
    } else if (families.length === 1 && (families[0] === 'drive' || families[0] === 'stay')) {
      const preferences = tripPreferences(text, trip);
      // Ask for only the next missing preference, using bounded user context.
      if (!preferences.ambiguous) {
        if (!preferences.city) lines.push(copy.cityQuestion);
        else if (preferences.dates.length < 2) lines.push(copy.datesQuestion);
        else if (families[0] === 'stay' && !preferences.party) lines.push(copy.guestsQuestion);
      }
    }
  }
  return { answer: renderServerReply(lines.segments, locale, message), sources: [{ sourceId: 'dir3com-platform', sourceName: 'dir3com catalogue and service journeys', sourceType: 'internal' as const }], language: locale, groundingStatus: 'grounded' as const, provider: 'local' as const, retrievalMode: 'internal-catalog' as const };
}
