import { assertSafeUserInput, sanitizeUntrustedText } from './security';
import { validateTravelerCounts } from '@/lib/travel/traveler-counts';
import type { TravelCapability, TravelIntent, TravelLanguage } from './types';

const CITY_ALIASES: Record<string, string> = {
  cairo: 'Cairo', 'القاهرة': 'Cairo', 'القاهره': 'Cairo',
  riyadh: 'Riyadh', 'الرياض': 'Riyadh',
  jeddah: 'Jeddah', 'جدة': 'Jeddah', 'جده': 'Jeddah',
  dammam: 'Dammam', 'الدمام': 'Dammam',
  madinah: 'Madinah', 'المدينة': 'Madinah', 'المدينه': 'Madinah',
  makkah: 'Makkah', 'مكة': 'Makkah', 'مكه': 'Makkah',
  alexandria: 'Alexandria', 'الإسكندرية': 'Alexandria', 'الاسكندرية': 'Alexandria',
  hurghada: 'Hurghada', 'الغردقة': 'Hurghada', 'الغردقه': 'Hurghada',
  'sharm el sheikh': 'Sharm El Sheikh', 'شرم الشيخ': 'Sharm El Sheikh',
};

const CAPABILITY_PATTERNS: Array<[TravelCapability, RegExp]> = [
  ['fly', /\b(?:flight|flights|airfare|plane|ticket)\b|(?:طيران|رحلة جوية|تذكرة طيران)/i],
  ['stay', /\b(?:hotel|stay|accommodation|room)\b|(?:فندق|فنادق|إقامة|غرفة)/i],
  ['drive', /\b(?:car|chauffeur|driver|airport transfer|rental)\b|(?:سيارة|سائق|توصيل من المطار|نقل من المطار)/i],
  ['concierge', /\b(?:activity|activities|experience|tour|things to do)\b|(?:نشاط|نشاطات|فعاليات|جولات|تجارب)/i],
  ['vip', /\bvip\b|(?:كبار الشخصيات|استقبال خاص|خدمة خاصة في المطار)/i],
];

function detectLanguage(message: string): TravelLanguage {
  return /[\u0600-\u06ff]/.test(message) ? 'ar' : 'en';
}

function detectCities(message: string): string[] {
  const normalized = message.toLowerCase();
  return Object.entries(CITY_ALIASES)
    .map(([alias, city]) => ({ city, index: normalized.indexOf(alias.toLowerCase()) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.city)
    .filter((city, index, list) => list.indexOf(city) === index);
}

function detectCapabilities(message: string): TravelCapability[] {
  const matches = CAPABILITY_PATTERNS.filter(([, pattern]) => pattern.test(message)).map(([capability]) => capability);
  if (/\b(?:whole trip|complete trip|full itinerary|trip plan)\b|(?:رتب لي برنامج|خطط لي رحلة|الرحلة كاملة)/i.test(message)) {
    return [...new Set<TravelCapability>(['fly', 'stay', 'drive', 'concierge', ...matches])];
  }
  return [...new Set(matches)];
}

function detectTravelers(message: string) {
  const count = '([+-]?(?:\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?|Infinity|NaN))';
  const tokenStart = '(?<![\\p{L}\\p{N}.+-])';
  const adults = message.match(new RegExp(`${tokenStart}${count}\\s*(?:adults?|بالغ|بالغين)`, 'iu'));
  const children = message.match(new RegExp(`${tokenStart}${count}\\s*(?:children|kids|أطفال|طفل)`, 'iu'));
  if (!adults && !children && !/(?:عائلة|family)/i.test(message)) return undefined;
  return validateTravelerCounts(
    Number(adults?.[1] ?? (/family|عائلة/i.test(message) ? 2 : 1)),
    Number(children?.[1] ?? (/family|عائلة/i.test(message) ? 2 : 0)),
  );
}

function detectBudget(message: string): { amount?: number; currency?: string } {
  const match = message.match(/(?:budget|ميزانية|ميزانيتي)?\s*[:=]?\s*([\d,.]+)\s*(SAR|EGP|USD|ريال|جنيه|دولار)/i);
  if (!match) return {};
  const currencyMap: Record<string, string> = { 'ريال': 'SAR', 'جنيه': 'EGP', 'دولار': 'USD' };
  return { amount: Number(match[1].replace(/,/g, '')), currency: currencyMap[match[2]] ?? match[2].toUpperCase() };
}

export function parseTravelIntent(rawMessage: string): TravelIntent {
  const message = sanitizeUntrustedText(rawMessage, 1000);
  assertSafeUserInput(message);
  const language = detectLanguage(message);
  const cities = detectCities(message);
  const requestedCapabilities = detectCapabilities(message);
  const budget = detectBudget(message);
  const modifications: TravelIntent['modifications'] = [];
  const replacement = message.match(/(?:instead of|بدل)\s+([\p{L}\s]+?)(?:$|,|\.|مع)/iu);
  if (replacement && cities.length) modifications.push({ field: 'destination', value: cities[0] });
  if (/\b(?:cheaper|cheapest|lower budget)\b|(?:أرخص|اقل تكلفة|أقل تكلفة)/i.test(message)) modifications.push({ field: 'budgetTendency', value: 'value' });
  if (/\b(?:premium|luxury|upgrade)\b|(?:أفخم|فاخر|ترقية)/i.test(message)) modifications.push({ field: 'budgetTendency', value: 'premium' });
  const dateText = message.match(/\b(?:next week|next month|tomorrow|this weekend)\b|(?:الأسبوع الجاي|الاسبوع الجاي|الشهر الجاي|بكرة|غدا|غداً)/i)?.[0];
  const dateRange = message.match(/(20\d{2}-\d{2}-\d{2})\s*(?:to|until|-|إلى|الى)\s*(20\d{2}-\d{2}-\d{2})/i);
  const compare = /\b(?:compare|cheapest|fastest|best value|recommended)\b|(?:قارن|أرخص|أسرع|أفضل قيمة|رشح)/i.test(message);
  const human = /\b(?:human|person|agent|support)\b|(?:موظف|شخص|دعم بشري|إنسان)/i.test(message);
  const modify = modifications.length > 0 || /\b(?:change|replace|remove|same trip)\b|(?:غيّر|غير|بدّل|بدل|احذف|نفس الرحلة)/i.test(message);
  const destination = modify ? cities[0] : cities.at(-1);
  const missingRequired: string[] = [];
  if (!destination && !modify && !human) missingRequired.push('destination');
  if (!dateText && !dateRange && !modify && !human) missingRequired.push('dates');
  if (requestedCapabilities.length === 0 && !modify && !human) missingRequired.push('services');

  return {
    language,
    kind: human ? 'human_handoff' : modify ? 'modify_trip' : compare ? 'compare' : requestedCapabilities.length || destination ? 'new_trip' : 'unknown',
    origin: !modify && cities.length > 1 ? cities[0] : undefined,
    destination,
    startDate: dateRange?.[1],
    endDate: dateRange?.[2],
    dateText,
    flexibility: /\bflexible\b|مرن/i.test(message) ? 'flexible' : undefined,
    travelers: detectTravelers(message),
    budget: budget.amount,
    currency: budget.currency,
    preferences: {
      familyFriendly: /\b(?:family|kids|children)\b|(?:عائلة|أطفال|طفل)/i.test(message) || undefined,
      hotelClass: Number(message.match(/([345])\s*(?:star|نجوم)/i)?.[1]) || undefined,
      cabin: message.match(/\b(economy|premium economy|business|first)\b/i)?.[1]?.toLowerCase(),
      carType: message.match(/\b(suv|sedan|luxury|van)\b/i)?.[1]?.toLowerCase(),
    },
    requestedCapabilities,
    constraints: [compare ? 'comparison_requested' : '', /nonstop|مباشر/i.test(message) ? 'nonstop' : ''].filter(Boolean),
    modifications,
    missingRequired,
    confidence: Math.min(1, 0.25 + cities.length * 0.2 + requestedCapabilities.length * 0.12 + (dateText || dateRange ? 0.2 : 0)),
  };
}
