import { withoutDriveEndpointPlaces, driveEndpointRouteText, airportDriveService, driveHandoffForUsers, applyDriveHandoff, type DriveHandoff } from './drive-handoff';
import { AI2_DABRA_CONVERSATION_COPY } from '../ai2/prompt/contract';
import { driveQuantities, driveDialogue, driveDialogueCopy, driveBudgetState, isRejectedBudgetChangeCurrency, bareDriveParty, bareDrivePartyWithLuggage, dateWithdrawalIndex } from './drive-planning';
import { CORE_REQUIRED_DIALOGUE_UNITS, conversationIntent, conversationTopicChange, conversationClarification, conversationReply, renderServerReply, serverReplyLink, serverReplySegments } from './conversation-renderer';
import { DRIVE_OFFERS, vehicleFor, vehicleTitle, type DriveOffer } from '../drive/catalog';
import { driveOwnerAvailabilityCopy } from '../drive/owner-availability';
import { driveModelReferenceCopy } from '../drive/model-reference';
import { serviceEntryHref } from '../marketplace/public-entry';
import { cairoInstant } from '../drive/search';
import { validSearchDate } from '../marketplace/search-context';
import { withoutNegativeActions } from './intent-constraints';
import type { SavedTrip } from './continuity-contract';
import { cityRoles, newTripRequested, routingPlace, refineRoutingTrip, withoutRoutingCities } from './trip-routing';

import { displayPrice, parseDisplayCurrency, type DisplayCurrency, type FxSnapshot } from '../currency/display';
function driveCityRoles(value:string){return cityRoles(driveEndpointRouteText(value));}
export type PlatformPricing = { currency: DisplayCurrency | null; snapshot: FxSnapshot | null; excludedCurrencies?: readonly DisplayCurrency[] };
/** A negative display action can have an object before its currency.
 * A numeric or budget object is not by itself a rejection of the currency. */
function negatedDisplayAction(prefix:string) {
  const clause=prefix.split(/[;؛.!?؟\n]/u).at(-1) ?? '';
  // Negative desire can govern the price noun directly or a dependent
  // display action. Keep the target within this bounded clause.
  const actions=[...clause.matchAll(/\b(?:never|do not|don't|dont|can not|avoid)\s+(?:(?:want|intend|need)(?:\s+(?:you|me|us|them))?\s+(?:to\s+)?)?(?:use|using|show|showing|shown|display|displaying|displayed|present|choose|accept|quote|see|view|look\s+at)\b|\b(?:never|do not|don't|dont|can not)\s+(?:want|need|prefer)\s+(?:(?:the|my|any|these|those)\s+){0,2}(?:(?:car|vehicle|hotel|lodging|service|trip)(?:['’]s)?\s+)?(?:prices?|rates?|fares?|quotes?)\b|(?<![\p{L}])(?:لا|لن|ما)\s*(?:(?:اريد|ابي|ابغي|احتاج|استطيع|يمكنني)\s+(?:ان\s+)?)?(?:استخدم|استخدام|استعمال|تستخدم|اعرض|عرض|تعرض|اظهر|تظهر|تختار|تقبل)(?![\p{L}])|(?<![\p{L}])(?:لا|لن|ما)\s*(?:اريد|ابي|ابغي|احتاج)\s+(?:(?:هذه|تلك|كل)\s+)?(?:ال)?(?:اسعار|سعر|تسعير)(?![\p{L}])/gu)];
  const action=actions.at(-1);
  if (!action) return false;
  const object=clause.slice((action.index ?? 0)+action[0].length);
  // A later action begins a new scope; a currency conjunction without a new
  // action remains inside the preceding rejection.
  const laterActions=[...object.matchAll(/\b(?:use|show|display|present|choose|accept|quote)\b|(?<![\p{L}])(?:استخدم|تستخدم|اعرض|تعرض|اظهر|تظهر|اختر|تختار|تقبل)(?![\p{L}])/gu)];
  const laterAction=laterActions.some(match=>{
    const before=object.slice(0,match.index);
    const dependentEnglish=/\bto\s+(?:be\s+)?$/u.test(before)
      && !/(?:[,،]|\b(?:and|but|then|however|instead)\b)\s*to\s+(?:be\s+)?$/u.test(before);
    const dependentArabic=/(?<![\p{L}])ان\s*$/u.test(before)
      && !/(?:[,،]|(?<![\p{L}])(?:لكن|بل)(?![\p{L}]))\s*ان\s*$/u.test(before);
    return !dependentEnglish && !dependentArabic;
  });
  return object.length<=80 && !laterAction && !/\d|\bbudget\b|ميزاني/u.test(object);
}
/** Questions about a choice or conditional requests are not display choices.
 * A direct request to the assistant remains eligible, including polite ones. */
function currencyMentionScope(text:string,index:number,end:number):'certain'|'uncertain'|'contested' {
  const before=text.slice(0,index);
  const after=text.slice(end).split(/[;؛.!?؟\n]/u,1)[0];
  const conditional=/\b(?:if|unless|when|once|until|perhaps|maybe|might|provided)\b|(?<![\p{L}])و?(?:اذا|لو|عندما|حين|ربما|لعل|بشرط)(?![\p{L}])/u;
  const advisory=/\b(?:should i|can i|could i|would you recommend|would you advise|do you recommend)\b|هل\s*(?:يمكنني|استطيع|تنصحني|تنصح|افضل)/u;
  const trailing=/^\s*[,،]?\s*(?:if|unless|when|once|اذا|لو|عندما|بشرط)(?=$|[^\p{L}\p{N}_])/u;
  const boundaries=[...before.matchAll(/[;؛.!?؟\n]/gu)];
  const last=boundaries.at(-1);
  const current=before.slice(last ? (last.index ?? 0)+1 : 0);
  if (conditional.test(current) || advisory.test(current) || trailing.test(after)) return 'uncertain';
  if (!last) return 'certain';
  const earlier=before.slice(0,last.index);
  const earlierBoundary=[...earlier.matchAll(/[;؛.!?؟\n]/gu)].at(-1);
  const prior=earlier.slice(earlierBoundary ? (earlierBoundary.index ?? 0)+1 : 0);
  if (!conditional.test(prior) && !advisory.test(prior)) return 'certain';
  // A completed conditional currency event can be followed by a separate
  // explicit decision. A dangling condition or a correction remains scoped.
  const completed=(/\b(?:show|display|use|choose|budget|spend)\b|اعرض|اظهر|استخدم|ميزاني|انفاق/u.test(prior)
    || negatedDisplayAction(prior))
    && /\b(?:usd|sar|egp|eur|aed|euros?|dollars?)\b|يورو|دولار|ريال|جنيه|درهم/u.test(prior);
  const correction=/^\s*(?:actually|rather|instead|بل|تصحيح)(?=$|[^\p{L}\p{N}_])/u.test(current);
  // A completed conditional proposal cannot govern an explicit, absolute
  // refusal which independently rejects a different display currency.
  const absoluteRefusal=negatedDisplayAction(current)
    && (/\b(?:under (?:any|no) circumstances|in any circumstances|for (?:any|no) reason|regardless)\b/u.test(after)
      || /(?:تحت\s+اي\s+ظرف|مهما\s+كانت\s+الظروف)/u.test(after));
  if (!completed) return 'uncertain';
  return correction && !absoluteRefusal ? 'contested' : 'certain';
}
/** A denomination of an amount is not, by itself, a display selection. */
function explicitCurrencyDisplay(text:string,index:number,end:number) {
  const before=text.slice(0,index);
  const boundary=[...before.matchAll(/[,،;؛.!?؟\n]/gu)].at(-1);
  const clause=before.slice(boundary ? (boundary.index ?? 0)+1 : 0);
  const after=text.slice(end).split(/[,،;؛.!?؟\n]/u,1)[0];
  if (/\d[\d.,]*\s*$/u.test(clause) || /^\s*\d/u.test(after)) return false;
  if (/\b(?:budget|spend|cost|quote)\b|ميزاني|يكلف|تكلف/u.test(clause)
      && !/\b(?:show|display)\s+(?:the\s+)?prices?\b|(?:اعرض|اظهر)\s+(?:ال)?اسعار/u.test(clause)) return false;
  return /\b(?:use|choose|select)\s+(?:(?:the\s+)?currency\s+)?$/u.test(clause)
    || /\b(?:show|display|list)\b[^;؛.!?؟\n]{0,80}\b(?:in|using|as)\s*$/u.test(clause)
    || /\bprices?\s+in\s*$/u.test(clause)
    || /(?:استخدم|اختر)\s*(?:العمله\s*)?$/u.test(clause)
    || /(?:اعرض|اظهر|عرض)\s*[^;؛.!?؟\n]{0,80}ب\s*$/u.test(clause)
    || /^\s*$/u.test(clause) && /^\s*(?:prices?\s*(?:please)?|اسعار\s*(?:من فضلك)?)?\s*$/u.test(after);
}
/** Distinguish a currency rejected by the user from an affirmative selection. */
export function platformCurrencySelection(message: string) {
  // Context may join separate user-derived facts with newlines. Preserve those
  // boundaries while applying the same normalization to each line.
  const text = message.split(/\r?\n/u).map(line=>isRejectedBudgetChangeCurrency.normalizeText(normalizePlatformQuery(line))).join('\n');
  const aliases: Record<string, string> = { دولار: 'USD', '$': 'USD', ريال: 'SAR', جنيه: 'EGP', يورو: 'EUR', درهم: 'AED', 'us dollar': 'USD', 'us dollars': 'USD', euro: 'EUR', euros: 'EUR', 'saudi riyal': 'SAR', 'saudi riyals': 'SAR', 'egyptian pound': 'EGP', 'egyptian pounds': 'EGP', 'emirati dirham': 'AED', 'emirati dirhams': 'AED' };
  const mentions = [...text.matchAll(/\b(?:usd|sar|egp|eur|aed|us\s+dollars?|euros?|saudi\s+riyals?|egyptian\s+pounds?|emirati\s+dirhams?)\b|(?:ال)?(?:دولار|ريال|جنيه|يورو|درهم)(?:\s+(?:الامريكي|امريكي|السعودي|سعودي|المصري|مصري|الاماراتي|اماراتي|الاوروبي|اوروبي))?|\$/g)];
  const latest = new Map<DisplayCurrency, { excluded: boolean; index: number; explicit: boolean }>();
  const contested = new Set<DisplayCurrency>();
  for (const match of mentions) {
    const token = match[0].replace(/^ال/, '').replace(/\s+(?:الامريكي|امريكي|السعودي|سعودي|المصري|مصري|الاماراتي|اماراتي|الاوروبي|اوروبي)$/, '');
    const currency = parseDisplayCurrency(aliases[token] ?? token);
    if (!currency) continue;
    // A rejected budget change does not select or exclude its denomination
    // for display. A later explicit display choice is interpreted separately.
    const scope=currencyMentionScope(text, match.index ?? 0, (match.index ?? 0) + match[0].length);
    if (isRejectedBudgetChangeCurrency(text, match.index ?? 0)) continue;
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 64), match.index);
    const negative = /(?:\b(?:do not|don't|dont|never|not|no)(?:\s+(?:use|want|show|display|choose|accept|in))?|\b(?:avoid|exclude|without)|(?<!\p{L})(?:ليست|ليس|لا|مش|مو)(?:\s+(?:اريد|ابغي|ابي|احتاج|استخدم|تستخدم|تعرض|تظهر|تختار|اقبل|افضل))?|(?<!\p{L})ما\s+(?:اريد|ابغي|ابي|اقبل))(?:\s+(?:the|budget|عمله|العمله|ميزانيه|الميزانيه))?\s*(\d+(?:\.\d+)?\s*)?$/u.exec(prefix);
    const suffix = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 64);
    const rejectedAfter = /^\s*[:\-]?\s*(?:(?:is|are)\s+)?(?:not\s+(?:acceptable|accepted|allowed|wanted|preferred|usable|permitted|suitable|okay|ok)|unacceptable|rejected|refused)\b|^\s*[:\-]?\s*(?:isn't|isnt|aren't|arent)\s+(?:acceptable|accepted|allowed|wanted|preferred|usable|permitted|suitable|okay|ok)\b|^\s*[:\-]?\s*(?:غير\s+(?:مقبول(?:ه|ا)?|مناسب(?:ه|ا)?|مسموح(?:ه|ا)?|مرغوب(?:ه|ا)?)|مرفوض(?:ه)?|ليس(?:ت)?\s+(?:مقبول(?:ه|ا)?|مناسب(?:ه|ا)?|مسموح(?:ه|ا)?)|(?:لا|ما)\s+(?:يناسب|يصلح))(?=$|[\s.!?,،؛;؟])/u.test(suffix);
    // Rejecting an amount does not by itself reject its denomination.
    if (negative?.[1] && !rejectedAfter) continue;
    const excluded=Boolean(negative) || rejectedAfter || negatedDisplayAction(text.slice(0,match.index ?? 0));
    if (scope==='contested' || scope==='uncertain') {
      // This is a temporary display guard, not a claim that a conditional
      // rejection was an unconditional user decision.
      if (excluded) contested.add(currency);
      continue;
    }
    const explicit=!excluded && explicitCurrencyDisplay(text,match.index ?? 0,(match.index ?? 0)+match[0].length);
    // An amount in a service budget cannot override an earlier display refusal.
    if (!excluded && latest.get(currency)?.excluded && !explicit) continue;
    if (excluded || explicit) contested.delete(currency);
    latest.set(currency, { excluded, explicit, index: match.index ?? 0 });
  }
  const entries = [...latest.entries()];
  const explicitRequested = entries.filter(([currency, value]) => !value.excluded && value.explicit && !contested.has(currency)).sort((a,b) => a[1].index-b[1].index).at(-1)?.[0] ?? null;
  // A later numeric denomination must not override an explicit display choice.
  const requested = explicitRequested ?? entries.filter(([currency, value]) => !value.excluded && !contested.has(currency)).sort((a,b) => a[1].index-b[1].index).at(-1)?.[0] ?? null;
  return { requested, explicitRequested, excluded: entries.filter(([, value]) => value.excluded).map(([currency]) => currency), contested:[...contested], mentioned: mentions.length > 0 };
}
export function platformCurrency(message: string) { return platformCurrencySelection(message).requested; }
type Locale = 'ar' | 'en';
type Turn = { role: 'user' | 'assistant'; content: string };
export type PlatformFamily = 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';
// Service nouns are shared by positive identification and direct refusals.
// Driver preferences and model names remain Drive refinements, not a refusal
// of the entire car service when they are negated.
const serviceNames: Record<PlatformFamily, RegExp> = {
  drive: /\b(?:cars?|vehicles?|transfers?)\b|(?<![\p{L}])(?:و)?(?:ال)?(?:سيار[\p{L}]*|توصيل)(?![\p{L}])/u,
  stay: /\b(?:hotels?|stays?|apartments?|accommodation|lodging)\b|(?<![\p{L}])(?:و)?(?:ال)?(?:فندق[\p{L}]*|فنادق[\p{L}]*|اقامه|شقه|شقق)(?![\p{L}])/u,
  fly: /\b(?:flights?|fly|airlines?)\b|(?<![\p{L}])(?:و)?(?:ال)?(?:طيران|تذاكر|تذكره)(?![\p{L}])/u,
  concierge: /\b(?:concierge|restaurants?)\b|(?<![\p{L}])(?:و)?(?:ال)?(?:كونسيرج|مطعم|مطاعم|تجارب|فعاليات)(?![\p{L}])/u,
  vip: /\bvip\b|(?<![\p{L}])(?:كبار الشخصيات|استقبال فاخر)(?![\p{L}])/u,
};
const familyTerms: Record<PlatformFamily, RegExp> = {
  drive: new RegExp(serviceNames.drive.source + String.raw`|\b(?:drive|chauffeur|driver|mercedes|jetour|nissan|kia|hyundai|toyota|rover|cadillac|soueast|bmw|tesla|audi|honda)\b|سواق|سائق|استقبال المطار|مرسيدس|جيتور|نيسان|كيا|هيونداي|تويوتا|روفر|كاديلاك|بي ام|تسلا|اودي|هوندا|ساوايست|سوإيست|سوايست`, 'u'),
  stay: serviceNames.stay,
  fly: serviceNames.fly,
  concierge: serviceNames.concierge,
  vip: serviceNames.vip,
};
// The same noun spans that select a family are recognized as direct objects
// of refusal; a condition still prevents an unconditional decision.
// Shared viewing actions: the same verb/object grammar is used when
// recognizing a refusal and a later explicit positive service choice.
const englishServiceVerb=String.raw`(?:use|show|display|find|see|view|watch|look\s+at)`;
// A dependent action may be infinitive, progressive or passive. Keep the
// object and optional actor inside the same service-refusal event.
const englishServiceDependent=String.raw`(?:${englishServiceVerb}|(?:be\s+)?(?:using|showing|displaying|finding|seeing|viewing|watching)|(?:be\s+)?(?:shown|displayed|found|seen|viewed|used))`;
let cachedFamilyRefusalPatterns:Array<{family:PlatformFamily;pattern:RegExp}>|null=null;
function familyRefusalPatterns() {
 if (cachedFamilyRefusalPatterns) return cachedFamilyRefusalPatterns;
 const anyDeterminer=newTripRequested.arabicAnyDeterminer,arabicVerb=newTripRequested.arabicServiceVerb;
 cachedFamilyRefusalPatterns=(Object.keys(serviceNames) as PlatformFamily[]).flatMap(family=>{
  const noun='(?:'+serviceNames[family].source+')';
  const prefixes=[
    String.raw`\b(?:do not|don't|dont|can not|never|no longer|no|not|cannot|can't)\s+(?:(?:want|need)\s+(?:(?:you|me|us|them|him|her)\s+)?(?:to\s+)?|(?:let|allow)\s+(?:you|me|us|them|him|her)\s+(?:to\s+)?|(?:use|book|afford|request|show|display|list|find)\s+(?:to\s+)?)?(?:${englishServiceDependent}\s+)?(?:(?:me|us|the|a|an|my|any|some)\s+){0,3}(?:(?:rental|rented|hire)\s+)?`,
    String.raw`\b(?:refuse|decline|reject)\s+(?:(?:the|a|an|my|any)\s+)?`,
    String.raw`(?<![\p{L}])لا\s*(?:(?:اريد|ابي|احتاج)\s*(?:ان\s+)?)?(?:${arabicVerb}(?:\s+(?:لي|علي|لنا|علينا))?\s*)?(?:${anyDeterminer}(?:\s+من)?\s*)?`,
    String.raw`(?<![\p{L}])(?:ليس|ليست|مو|مش)\s*`,
    String.raw`(?<![\p{L}])(?:ارفض|نرفض|تجنب)\s*`,
  ];
  return prefixes.map(prefix=>({family,pattern:new RegExp(prefix+noun,'gu')}));
 });
 return cachedFamilyRefusalPatterns;
}
export function normalizePlatformQuery(input: string) {
  return input.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/جي\s*كلاس/g, 'g class').replace(/سبورت/g, 'sport').replace(/رينج روفر|رانج روفر|رنج روفر/g, 'range rover').replace(/مرسيدس بنز/g, 'مرسيدس').replace(/رانج|رنج/g, 'رينج').replace(/صاني/g, 'صني').replace(/\s+/g, ' ').trim();
}
function platformRooms(text:string) {
  const roomMatches = [...text.matchAll(/(?:^|\s)([1-8])\s*(?:rooms?|غرف(?:ه)?)(?=\s|[.,،]|$)/g)];
  return roomMatches.at(-1)?.[1] ?? (/\bone room\b|غرفه واحده/.test(text) ? '1' : undefined);
}
export function platformFamilies(message: string): PlatformFamily[] {
  const text = withoutDriveEndpointPlaces(normalizePlatformQuery(message));
  const families=(Object.keys(familyTerms) as PlatformFamily[]).filter(f => familyTerms[f].test(text));
  // A bounded room count is itself a Stay preference, even after old turns leave the transcript window.
  if (!families.includes('stay') && platformRooms(text)) families.push('stay');
  return families;
}
/** Reduce explicit service mentions from bounded USER turns. A service named
 * as the object of refusal is not affirmative evidence for selecting it;
 * driver-only preferences remain Drive preferences rather than car refusal. */
function serviceFinancialObject(value:string) {
  // A request to inspect a limit is not a request to select the service.
  return /^(?:['’]s)?\s*(?:(?:daily|nightly|hourly|weekly|monthly|annual|total|per(?:\s*-\s*|\s+)(?:day|night|hour|week|month|year))\s+)*(?:(?:budget|allowance|limit|cap|ceiling|max(?:imum)?)(?:\s+(?:price|cost|rate))?|(?:price|cost|rate|pricing|spending)\s+(?:(?:daily|nightly|hourly|weekly|monthly|annual|total|per(?:\s*-\s*|\s+)(?:day|night|hour|week|month|year))\s+)*(?:budget|allowance|limit|cap|ceiling|max(?:imum)?))\b/u.test(value)
    || /^(?:['’]s)?\s*(?:prices?|rates?|fares?|quotes?|costs?)\b/u.test(value)
    || /^\s*(?:ميزاني|سقف|حد)(?![\p{L}])/u.test(value);
}
function scopedFamilyState(message:string,history:Turn[]) {
  const arabicDirectRequest=new RegExp(String.raw`(?<![\p{L}])${newTripRequested.arabicServiceIntent}(?:\s+(?:لي|علي|لنا|علينا))?\s*(?:${newTripRequested.arabicAnyDeterminer}(?:\s+من)?\s*)?(?:ال)?$`,'u');
  const englishViewRequest=new RegExp(String.raw`\b(?:(?:want|need)\s+(?:(?:you|me|us|them)\s+)?to\s+)?${englishServiceVerb}\s+(?:(?:me|us|a|an|the|my|any|some)\s+){0,3}$`,'u');
  const denied=new Set<PlatformFamily>(),contested=new Set<PlatformFamily>();let active:PlatformFamily[]=[];
  for (const input of [...history.filter(turn=>turn.role==='user').slice(-64).map(turn=>turn.content),message]) {
    const positives:PlatformFamily[]=[];
    for (const span of newTripRequested.actionSpans(newTripRequested.normalizeNegation(withoutDriveEndpointPlaces(normalizePlatformQuery(input))))) {
      const uncertain=newTripRequested.deferredMarker(span);
      const spans:Array<{start:number;end:number;family:PlatformFamily;negative:boolean}>=[];
      for (const {family,pattern} of familyRefusalPatterns()) for (const match of span.matchAll(pattern)) {
        const at=match.index,prior=span.slice(Math.max(0,at-40),at),suffix=span.slice(at+match[0].length);
        // Negating the intention to refuse is not a refusal. A car budget is
        // a different object from the car service itself.
        if (/^(?:refuse|decline|reject)/u.test(match[0]) && /\b(?:do not|don't|dont|never|not)\s+(?:(?:want|intend|plan)\s+to\s+)?$/u.test(prior)
          || /^(?:ارفض|نرفض|تجنب)/u.test(match[0]) && /(?<![\p{L}])لا\s*(?:(?:اريد|ابي|احتاج)\s*(?:ان\s*)?)?$/u.test(prior)
          || serviceFinancialObject(suffix)) continue;
        spans.push({start:at,end:at+match[0].length,family,negative:true});
      }
      let masked=span;for (const item of [...spans].sort((a,b)=>b.start-a.start)) masked=masked.slice(0,item.start)+' '.repeat(item.end-item.start)+masked.slice(item.end);
      const events=[...spans];
      for (const family of Object.keys(familyTerms) as PlatformFamily[]) {
        const pattern=new RegExp(familyTerms[family].source,'gu');
        for (const match of masked.matchAll(pattern)) events.push({start:match.index,end:match.index+match[0].length,family,negative:false});
      }
      if (platformRooms(masked) && !events.some(event=>event.family==='stay')) events.push({start:masked.length,end:masked.length,family:'stay',negative:false});
      let previousNegativeEnd=-1;
      for (const event of events.sort((a,b)=>a.start-b.start)) {
        const driverOnly=event.family==='drive' && /\b(?:driver|chauffeur)\b|سائق|سواق/u.test(span.slice(event.start,event.end));
        const between=previousNegativeEnd>=0 ? span.slice(previousNegativeEnd,event.start) : '';
        const joinedArabic=/^و(?=[\p{L}])/u.test(span.slice(event.start,event.end));
        const listConnector=previousNegativeEnd>=0 && (/^\s*[,،]?\s*(?:and|or|و|او)\s*(?:(?:the|a|an|my|any)\s+)?$/u.test(between)
          || joinedArabic && /^\s*[,،]?\s*$/u.test(between));
        const budgetObject=serviceFinancialObject(span.slice(event.end));
        if (!event.negative && listConnector && !driverOnly && !budgetObject) event.negative=true;
        previousNegativeEnd=event.negative?event.end:-1;
        const before=span.slice(0,event.start),after=span.slice(event.end);
        const directRequest=/\b(?:show|find|search\s+for|want|need|choose|select|book|arrange|use|reserve|get|prefer|request)\s+(?:(?:me|us|a|an|the|my|any|some)\s+){0,3}$/u.test(before)
          || arabicDirectRequest.test(before) || englishViewRequest.test(before)
          || /^\s*[,،]?\s*(?:please|من\s+فضلك)(?=$|[\s.!?؟,،;؛])/u.test(after);
        // A conditional service request needs an explanation, not an empty
        // generic-market search. It remains contested and cannot authorize a
        // family, link or match; budget and driver mentions are not requests.
        if (uncertain) {if(event.negative || !driverOnly && !budgetObject && directRequest)contested.add(event.family);continue;}
        if (event.negative) {denied.add(event.family);contested.delete(event.family);active=active.filter(family=>family!==event.family);const at=positives.indexOf(event.family);if(at>=0)positives.splice(at,1);}
        else {
          // A later mention (for example, a car budget or an adjective) is
          // not authority to retract a service refusal. Require a positive
          // action directed at that service before clearing its denial.
          if (denied.has(event.family) || contested.has(event.family)) {
            if (driverOnly || budgetObject || !directRequest) continue;
          }
          denied.delete(event.family);contested.delete(event.family);if(!positives.includes(event.family))positives.push(event.family);
        }
      }
    }
    if (positives.length) active=positives.filter(family=>!denied.has(family));
  }
  return {active,denied:[...denied],contested:[...contested]};
}
/** A resume request selects only the separately supplied, server-owned trip. */
function resumePlatformTripRequested(message: string) {
  if (newTripRequested(message)) return false;
  const text = normalizePlatformQuery(message);
  return /^(?:(?:resume|continue|reopen) (?:my |the )?(?:saved|previous) trip|(?:return|go) (?:back )?to (?:my |the )?(?:saved|previous) trip)\b/.test(text)
    || /^(?:(?:استانف|استكمل|اكمل|واصل) (?:رحلتي(?: (?:المحفوظه|السابقه))?|الرحله (?:المحفوظه|السابقه))|(?:ارجع|عد) (?:الي )?(?:لرحلتي|للرحله (?:المحفوظه|السابقه)|رحلتي|الرحله (?:المحفوظه|السابقه)))(?=$|[\s.!?؟،;؛:])/.test(text);
}
function explicitlyFreshServiceRequest(text:string) {
  // A conditional, negative, or interrogative mention is not a new request.
  if (uncertainRequestBoundary(text)) return false;
  return /\b(?:new|another) (?:car|hotel|request)\b|(?:سياره|فندق|طلب)\s+(?:اخر|اخري|جديد|جديده)/.test(text);
}
/** An explicitly different service or destination starts a new ephemeral request. */
function differentRequest(message: string, history: Turn[], trip?: SavedTrip | null) {
  const text = normalizePlatformQuery(message);
  const correction = /\b(?:instead|same trip|same request|change the destination)\b|بدلا|نفس الرحله|نفس الطلب|تعديل الوجهه|غير الوجهه/.test(text);
  const fresh = explicitlyFreshServiceRequest(text);
  if (fresh && (history.some(turn => turn.role === 'user') || trip)) return true;
  // Room-count projections are not explicit new Stay requests. Only service
  // words written in a turn can establish a service boundary.
  const explicitFamilies = (value:string, stripRefusals=false) => {
    let words=withoutDriveEndpointPlaces(normalizePlatformQuery(value));
    const tripDecision=newTripRequested.decision(value);
    if (stripRefusals || tripDecision.mentioned && tripDecision.kind==='continue' && !tripDecision.refused && !tripDecision.contested) {
      // An explicitly rejected service is not itself a new service request.
      words=words.replace(/\b(?:do not|don't|dont|never|no|not)\s+(?:(?:want|need)\s+(?:to\s+)?)?(?:use\s+)?(?:(?:the|a|an|my)\s+)?(?:hotels?|lodging|accommodation|cars?|drivers?)\b/gu,' ')
        .replace(/(?<![\p{L}])لا\s*(?:(?:اريد|ابي|احتاج)\s*)?(?:(?:استخدم|تستخدم)\s*)?(?:ال)?(?:فندق|اقامه|سياره|سائق)(?![\p{L}])/gu,' ')
        .replace(/(?<![\p{L}])(?:ليس|ليست|مو|مش)\s*(?:ال)?(?:فندق|اقامه|سياره|سائق)(?![\p{L}])/gu,' ');
      // A clear refusal of a different service is not a request to switch to
      // it. Negated or conditional refusals remain ambiguous and in scope.
      if (!newTripRequested.deferredMarker(value)) {
        words=words.replace(/\b(?:refuse|decline|reject)\s+(?:(?:the|a|an|my)\s+)?(?:hotels?|lodging|accommodation|cars?|drivers?)\b/gu,(match,offset,full)=>/\b(?:do not|don't|dont|never|not)\s+(?:(?:want|intend|plan)\s+to\s+)?$/u.test(full.slice(Math.max(0,offset-40),offset))?match:' ')
          .replace(/(?<![\p{L}])(?:ارفض|نرفض|تجنب)\s*(?:ال)?(?:فندق|اقامه|سياره|سائق)(?![\p{L}])/gu,(match,offset,full)=>/(?<![\p{L}])لا\s*(?:(?:اريد|ابي|احتاج)\s*(?:ان\s*)?)?$/u.test(full.slice(Math.max(0,offset-32),offset))?match:' ');
      }
    }
    return (Object.keys(familyTerms) as PlatformFamily[]).filter(family => familyTerms[family].test(words));
  };
  const users = history.filter(turn => turn.role === 'user');
  const priorFamily = users.slice().reverse().map(turn => explicitFamilies(turn.content,true)).find(value => value.length === 1)?.[0];
  const familyState=scopedFamilyState(message,history);
  const mentionedFamilies=explicitFamilies(message),affirmativeFamilies=explicitFamilies(message,true)
    .filter(family=>!familyState.denied.includes(family)&&!familyState.contested.includes(family));
  // A refusal of a different service is not a request to switch away from the
  // user's current service. Keep refusals of that current service in scope.
  const families=priorFamily ? mentionedFamilies.filter(family=>family===priorFamily || affirmativeFamilies.includes(family)) : mentionedFamilies;
  if (families.length > 1 && !correction && (users.length > 0 || trip)) return true;
  const location=driveCityRoles(message);
  // A competing or multi-leg route is a pending route constraint, not by
  // itself a new request that discards an earlier confirmed service budget.
  if ((location.unknownDestination || location.unknownOrigin) && (users.length > 0 || trip)) return true;
  if (families.length !== 1) return false;
  const priorCity = users.slice().reverse().map(turn => driveCityRoles(turn.content).city).find(Boolean) ?? (trip ? routingPlace(trip.destination) : undefined);
  const city = driveCityRoles(message).city;
  // An explicit same-trip transition can move among the services already in
  // the attached trip without discarding the preceding USER facts. A new
  // request, a different location, or an absent/refused anchor remains guarded.
  const sameTripInScope=/\b(?:same trip|same request)\b|نفس الرحله|نفس الطلب/u.test(text) || users.some(turn=>{
    const decision=newTripRequested.decision(turn.content);
    return decision.mentioned && decision.kind==='continue' && !decision.refused;
  });
  const sharedTripFamilies=Boolean(sameTripInScope && trip && priorFamily
    && trip.families.includes(priorFamily) && trip.families.includes(families[0]));
  return Boolean((priorFamily && priorFamily !== families[0] && !sharedTripFamilies)
    || (trip && !trip.families.includes(families[0]))
    || (!correction && city && priorCity && city !== priorCity));
}
/** Apply the whole-turn trip decision before any history boundary. */
function scopedTopicChange(message:string) {
  const decision=newTripRequested.decision(message);
  if (decision.mentioned) return decision.kind==='new'||decision.refused||decision.contested?message:null;
  return conversationTopicChange(message);
}
/** Resolve a bare negative pronoun from the immediately preceding USER turn.
 * Client history is not authority; a competing service or absent referent
 * withholds the anchor instead of asserting which object was rejected. */
function userTripTurnDecision(message:string,previousUser?:string) {
  const direct=newTripRequested.decision(message);
  if (direct.mentioned) return direct;
  const probe=newTripRequested.decision(`the same trip; ${message}`);
  if (!probe.refused && !probe.contested) return direct;
  const previous=previousUser ? newTripRequested.decision(previousUser) : null;
  if (previousUser && previous?.mentioned && previous.kind==='continue' && !previous.refused
      && !previous.contested && platformFamilies(previousUser).length===0) {
    return newTripRequested.decision(`${previousUser}; ${message}`);
  }
  return {...direct,kind:'uncertain' as const,mentioned:true,refused:false,contested:true};
}
type ProtectedTripStatus='active'|'contested'|'revalidation'|'detached';
/** Separate a clear continuation clause from later user input. The complete
 * original turn remains protected; the remainder is not authorization. */
function tripContinuationParts(message:string) {
  return normalizePlatformQuery(message).split(/[,،;؛]|\s+and\s+|\s+و(?=[\p{L}])/u).map(part=>part.trim()).filter(Boolean);
}
/** A clear answer identifies intent; it never proves the anchor is valid. */
function explicitTripContinuation(message:string) {
  const text=tripContinuationParts(message)[0] ?? '';
  const decision=newTripRequested.decision(text);
  if (!decision.mentioned || decision.kind!=='continue' || decision.refused || decision.contested) return false;
  if (resumePlatformTripRequested(text)) return true;
  return /^(?:please\s+)?(?:continue(?:\s+with)?|keep|stay\s+(?:on|with))\s+(?:(?:the|my)\s+)?(?:same|current|this)\s+(?:trip|journey)[.!?؟]*$/u.test(text)
    || /^(?:the\s+)?(?:same|current|this)\s+(?:trip|journey)[.!?؟]*$/u.test(text)
    || /^(?:استمر|ابق|واصل)\s*(?:في\s+|علي\s+)?(?:نفس|هذه|الرحله\s+الحاليه)\s*(?:الرحله)?[.!?؟]*$/u.test(text);
}
/** This reduction is request-local. History can signal a restriction but
 * cannot establish ownership, consent, expiry, or a successful revalidation. */
function tripScopeStatus(message:string,history:Turn[],withAnchor=false) {
  let status:ProtectedTripStatus='active';
  let protectedTurns:string[]=[];
  let deferredTurns:Array<{text:string;sourceTurn:number}>=[];
  const turns=[...history.filter(item=>item.role==='user').map(item=>item.content),message];
  for (const [sourceTurn,turn] of turns.entries()) {
    // An unresolved separate-request proposal can contest an attached anchor
    // too. Keep it protected, while withholding its consumer projection.
    const requestIntent=withAnchor ? unanchoredScopeIntent(turn) : null;
    if (requestIntent==='pending') {
      if (status!=='detached') {status='contested';deferredTurns.push({text:turn,sourceTurn});}
      continue;
    }
    if ((status==='contested' || status==='revalidation') && requestIntent==='same') {status='revalidation';continue;}
    if (requestIntent==='separate') {status='detached';protectedTurns=[];deferredTurns=[];continue;}
    const decision=userTripTurnDecision(turn,turns[sourceTurn-1]);
    if (decision.refused || decision.kind==='new') { status='detached'; protectedTurns=[]; deferredTurns=[]; continue; }
    if (decision.contested) {
      if (status!=='detached') { status='contested'; deferredTurns.push({text:turn,sourceTurn}); }
      continue;
    }
    if ((status==='contested' || status==='revalidation') && explicitTripContinuation(turn)) {
      status='revalidation';
      if (tripContinuationParts(turn).length>1) deferredTurns.push({text:turn,sourceTurn});
      continue;
    }
    if (status==='active') protectedTurns.push(turn);
    else if (status==='contested' || status==='revalidation') deferredTurns.push({text:turn,sourceTurn});
  }
  return {status,protectedTurns,deferredTurns};
}
/** Protected request-local facts are separate from the consumer projection.
 * The caller-supplied reference is not proof of ownership or consent. */
export function platformProtectedTripScope(message:string,history:Turn[] = [],trip?:SavedTrip|null) {
  const state=tripScopeStatus(message,history,Boolean(trip));
  // Later amounts stay unbound even when their syntax names a service; no
  // authority ties them to the withheld trip before scope is revalidated.
  const unboundBudgetInputs=state.deferredTurns.flatMap(input=>{
    const proposal=driveBudgetState([normalizePlatformQuery(input.text)]);
    const confirmed=proposal.confirmed ? [{value:proposal.confirmed,conditional:false}] : [];
    return [...confirmed,...proposal.pending.map(item=>({value:item.value,conditional:item.reason==='conditional'}))]
      .map(item=>({...item,scope:'unbound' as const,sourceTurn:input.sourceTurn}));
  });
  return {status:state.status,anchor:state.status==='detached'?null:trip ?? null,
    protectedTurns:state.protectedTurns,deferredTurns:state.deferredTurns,unboundBudgetInputs,
    budget:driveBudgetState(state.protectedTurns.map(normalizePlatformQuery))};
}
const TRIP_SCOPE_GUARD='trip context requires clarification';
type ConsumerProjection={message:string;history:Turn[];trip:SavedTrip|null;tripStatus?:ProtectedTripStatus;scopeReason?:'service-budget'|'trip-refused'};
const scopeOwnerBrand=Symbol('platform-scope-owner');
export type PlatformScopeOwner={readonly [scopeOwnerBrand]:true;advance:()=>number;isCurrent:(version:number)=>boolean;invalidate:()=>void};
/** Caller-owned, process-local lifecycle. This does not verify a server actor,
 * source, consent, expiry or state across requests. */
export function createPlatformScopeOwner():PlatformScopeOwner {
  let version=0;
  return Object.freeze({[scopeOwnerBrand]:true as const,advance:()=>++version,
    isCurrent:(candidate:number)=>candidate===version,invalidate:()=>{version++;}});
}
type MatchingSnapshot={message:string;history:Turn[];trip:SavedTrip|null;tripValue:SavedTrip|null;blocked:boolean;owner:PlatformScopeOwner|null;version:number;source:'user'|'legacy'};
const matchingScopes=new WeakMap<object,MatchingSnapshot>();
function sameMatchingTrip(current:SavedTrip|null,snapshot:SavedTrip|null) {
  if (!current || !snapshot) return current===snapshot;
  return current.id===snapshot.id && current.origin===snapshot.origin && current.destination===snapshot.destination
    && current.startDate===snapshot.startDate && current.endDate===snapshot.endDate
    && current.adults===snapshot.adults && current.children===snapshot.children && current.rooms===snapshot.rooms
    && current.budget===snapshot.budget && current.currency===snapshot.currency
    && Array.isArray(current.families) && current.families.length===snapshot.families.length
    && current.families.every((family,index)=>family===snapshot.families[index]);
}
/** Request-local capability for matching. It is a safety gate, not proof of
 * identity, ownership, consent, expiry, or durable conversation state. */
function issueConsumerScope<T extends ConsumerProjection>(scope:T,owner:PlatformScopeOwner|null,version:number,source:'user'|'legacy'):T {
  const tripValue=scope.trip && Array.isArray(scope.trip.families)
    ? {...scope.trip,families:[...scope.trip.families]} : null;
  matchingScopes.set(scope,{message:scope.message,history:scope.history.map(turn=>({...turn})),
    trip:scope.trip,tripValue,owner,version,source,blocked:Boolean(scope.trip && !tripValue)
      || scope.tripStatus==='contested'||scope.tripStatus==='revalidation'||scope.scopeReason==='trip-refused'});
  return scope;
}
function currentMatchingScope(scope:ConsumerProjection|undefined) {
  const snapshot=scope ? matchingScopes.get(scope) : undefined;
  return Boolean(snapshot?.owner?.[scopeOwnerBrand] && snapshot.owner.isCurrent(snapshot.version)
    && sameMatchingTrip(scope?.trip ?? null,snapshot.tripValue));
}
/** Opaque local request: the caller must supply a real USER event and an
 * appropriate owner. This separates provenance but is not authentication. */
export type PlatformUserRequest={readonly kind:'platform-user-request'};
const scopedUserRequests=new WeakMap<object,ConsumerProjection>();
export type PlatformLocalCurrencyPolicy={readonly kind:'platform-local-currency-policy'};
const localCurrencyPolicies=new WeakMap<object,{scope:ConsumerProjection;currency:DisplayCurrency|null;excludedCurrencies:readonly DisplayCurrency[];supersede:boolean;revision:number;isCurrent:()=>boolean}>();
export function platformUserRequest(input:string|Turn,history:Turn[] = [],trip?:SavedTrip|null,owner?:PlatformScopeOwner):PlatformUserRequest {
  // A structured event preserves the caller's role label. It is still a
  // caller assertion, not authentication. Raw strings remain a legacy path
  // until the unavailable ingress has migrated to the same request contract.
  const userMessage=typeof input==='string' ? input
    : input && typeof input==='object' && input.role==='user' && typeof input.content==='string' ? input.content : null;
  const scope=platformConversationScopeForSource(userMessage ?? '',userMessage===null?[]:history,userMessage===null?null:trip,owner,userMessage===null?'legacy':'user');
  const request=Object.freeze({kind:'platform-user-request' as const});
  scopedUserRequests.set(request,scope);
  return request;
}
export function platformUserRequestScope(request:PlatformUserRequest):ConsumerProjection|null {
  const scope=request && typeof request==='object' ? scopedUserRequests.get(request) : undefined;
  const snapshot=scope ? matchingScopes.get(scope) : undefined;
  return scope && snapshot?.source==='user' && currentMatchingScope(scope) ? scope : null;
}

/** One locally scoped market lifecycle. A caller must keep it for the whole
 * view session. It does not prove authentication or invalidate another process. */
export function createPlatformMarketSession() {
  const owner=createPlatformScopeOwner();
  let revision=0,userVersion=0,currencyVersion=0,chatId:string|null=null,observedLease='null';
  let explicitCurrency:DisplayCurrency|null=null,explicitCurrencyVersion=0;
  let priorMessageIds=new Set<string>();
  return Object.freeze({
    begin:()=>{owner.invalidate(); return ++revision;},
    invalidate:()=>{owner.invalidate();revision++;},
    isCurrent:(ticket:number)=>ticket===revision,
    noteUserInput:()=>{userVersion++;}, userVersion:()=>userVersion,
    beginChat:(id:string)=>{chatId=id;}, endChat:(id:string)=>{if(chatId===id)chatId=null;},
    hasChat:()=>chatId!==null, ownsChatMessage:(id:string)=>Boolean(chatId && id===`user-${chatId}`),
    noteCurrencyChange:(selected:DisplayCurrency|null=null)=>{currencyVersion++;if(selected){explicitCurrency=selected;explicitCurrencyVersion=currencyVersion;}}, currencyVersion:()=>currencyVersion,
    explicitCurrencyAfter:(version:number,selected:DisplayCurrency|null)=>Boolean(selected && selected===explicitCurrency && explicitCurrencyVersion>version),
    trackLease:(value:string)=>{observedLease=value;}, leaseMatches:(value:string)=>observedLease===value,
    setHistoryBoundary:(ids:readonly string[])=>{priorMessageIds=new Set(ids);},
    includeHistoryMessage:(id:string)=>!priorMessageIds.has(id),
    issueCurrencyPolicy:(ticket:number,request:PlatformUserRequest,currency:DisplayCurrency|null,excludedCurrencies:readonly DisplayCurrency[],supersede:boolean)=>{
      const scope=scopedUserRequests.get(request),snapshot=scope ? matchingScopes.get(scope) : undefined;
      if (ticket!==revision || !scope || snapshot?.owner!==owner || !currentMatchingScope(scope)) return null;
      const version=currencyVersion,policy=Object.freeze({kind:'platform-local-currency-policy' as const});
      localCurrencyPolicies.set(policy,{scope,currency,excludedCurrencies:[...excludedCurrencies],supersede,revision:version,isCurrent:()=>ticket===revision && version===currencyVersion});
      return policy;
    },
    issue:(ticket:number,event:Turn,history:Turn[],trip?:SavedTrip|null)=>
      ticket===revision ? platformUserRequest(event,history,trip,owner) : null,
  });
}
export type PlatformMarketSession=ReturnType<typeof createPlatformMarketSession>;
/** Start at receipt, before reading or constructing input. A failed input or
 * later await still invalidates the preceding local delivery. */
export function preparePlatformMarketInput(session:PlatformMarketSession,readEvent:()=>Turn,
  resolve:(event:Turn,isCurrent:()=>boolean)=>Promise<{history:Turn[];trip?:SavedTrip|null}>) {
  const ticket=session.begin();
  return (async()=>{
    try {
      const input=readEvent();
      if (!input || input.role!=='user' || typeof input.content!=='string') return {status:'error' as const};
      const event=Object.freeze({role:'user' as const,content:input.content});
      const {history,trip}=await resolve(event,()=>session.isCurrent(ticket));
      if (!session.isCurrent(ticket)) return {status:'stale' as const};
      const request=session.issue(ticket,event,history,trip);
      return request ? {status:'ready' as const,ticket,request,event} : {status:'stale' as const};
    } catch {
      return session.isCurrent(ticket) ? {status:'error' as const} : {status:'stale' as const};
    }
  })();
}
/** A display selection is a view-local event, never server authority. */
export function platformLocalCurrencyPolicy(request:PlatformUserRequest,policy:PlatformLocalCurrencyPolicy) {
  const value=policy && typeof policy==='object' ? localCurrencyPolicies.get(policy) : undefined;
  if (!value || scopedUserRequests.get(request)!==value.scope || !value.isCurrent() || !currentMatchingScope(value.scope)) return null;
  const snapshot=matchingScopes.get(value.scope);
  if (!snapshot) return null;
  // A later selector can re-allow only its own selected currency. Other
  // independently rejected/contested currencies remain in force.
  const exclusions=new Set(scopedDisplayExclusions(snapshot.history,snapshot.message,value.excludedCurrencies));
  if (value.supersede && value.currency && !value.excludedCurrencies.includes(value.currency)) exclusions.delete(value.currency);
  return Object.freeze({currency:value.currency,excludedCurrencies:[...exclusions],supersede:value.supersede,revision:value.revision});
}
/** Derive display facts from the same immutable, issued USER snapshot as
 * matching and links. The caller's USER label is not a server-side proof. */
export function platformUserRequestFacts(request:PlatformUserRequest) {
  const scope=request && typeof request==='object' ? scopedUserRequests.get(request) : undefined;
  const snapshot=scope ? matchingScopes.get(scope) : undefined;
  if (!scope || !snapshot || snapshot.source!=='user' || !currentMatchingScope(scope)) return null;
  const userText=preferenceContext(snapshot.message,snapshot.history);
  const choice=platformCurrencySelection(snapshot.message);
  const familyState=scopedFamilyState(snapshot.message,snapshot.history);
  return Object.freeze({
    blocked:snapshot.blocked,
    families:snapshot.blocked ? [] : familyState.active,
    // A denied family can render a refusal explanation, but is never an
    // affirmative selection and remains barred from links and matches.
    deniedFamilies:snapshot.blocked ? [] : familyState.denied,
    contestedFamilies:snapshot.blocked ? [] : familyState.contested,
    airport:!snapshot.blocked && /airport|المطار/i.test(userText),
    requestedCurrency:snapshot.blocked ? null : choice.explicitRequested,
    currentExcludedCurrencies:[...new Set([...choice.excluded,...choice.contested])],
    excludedCurrencies:snapshot.blocked ? [] : scopedDisplayExclusions(snapshot.history,snapshot.message),
  });
}

/** A validated display selection is view-local, never record authority. */
export function platformRequestDisplayPolicy(request:PlatformUserRequest,currency:DisplayCurrency|null,excludedCurrencies:readonly DisplayCurrency[],supersede:boolean) {
 const scope=platformUserRequestScope(request);
 if (!scope) return undefined;
 const policy=Object.freeze({kind:'platform-local-currency-policy' as const});
 localCurrencyPolicies.set(policy,{scope,currency,excludedCurrencies:[...excludedCurrencies],supersede,revision:0,isCurrent:()=>currentMatchingScope(scope)});
 return policy;
}
/** Currency facts from the issued USER snapshot, never generated display text. */
export function platformRequestCurrencySelection(request:PlatformUserRequest) {
  const scope=platformUserRequestScope(request);
  return platformCurrencySelection(scope ? preferenceContext(scope.message,scope.history) : '');
}

// Treat a conditional or interrogative scope proposal as pending, never as
// authority to discard an existing request. The same decision is replayed.
// A pending condition is not an instruction. This predicate is shared by
// request-boundary and service-action decisions; ordinary negation has its
// own object and must not itself be mistaken for an uncertain instruction.
function deferredIntent(text:string) {
  return newTripRequested.deferred(text);
}
function uncertainRequestBoundary(text:string) {
  return /[?؟]/u.test(text) || deferredIntent(text) || /\b(?:not|never|dont|don't)\b|(?<![\p{L}])(?:ليس|لا)(?![\p{L}])/u.test(text);
}
function unanchoredScopeIntent(value:string):'same'|'separate'|'pending'|null {
  const text=normalizePlatformQuery(value);
  const mentionsSeparate=/\b(?:separate|different|new) request\b|طلب\s+(?:منفصل|جديد)/u.test(text);
  const mentionsSame=/\bsame request\b|نفس الطلب/u.test(text);
  if (!mentionsSeparate && !mentionsSame) return null;
  if (uncertainRequestBoundary(text) || mentionsSeparate && mentionsSame) return 'pending';
  const same=/^(?:the\s+)?same request(?=$|[\s,،;؛.!:])/u.test(text) || /^نفس الطلب(?=$|[\s,،;؛.!:])/u.test(text);
  const separate=/^(?:a\s+)?(?:separate|different|new) request(?=$|[\s,،;؛.!:])/u.test(text) || /^طلب\s+(?:منفصل|جديد)(?=$|[\s,،;؛.!:])/u.test(text);
  return same ? 'same' : separate ? 'separate' : 'pending';
}
export function platformUnanchoredScopeAnswer(value:string):'same'|'separate'|null {
  const intent=unanchoredScopeIntent(value);
  return intent==='same'||intent==='separate' ? intent : null;
}

/** One ephemeral topic boundary for Core planning and provider input, never a saved-trip write. */
function platformConversationScopeForSource(message: string, history: Turn[] = [], trip: SavedTrip | null | undefined, owner:PlatformScopeOwner | undefined, source:'user'|'legacy'):ConsumerProjection {
  const boundOwner=owner?.[scopeOwnerBrand] ? owner : null;
  // Each issuance is a new turn/request in this caller-owned lifecycle.
  const version=boundOwner?.advance() ?? -1;
  const issue=<T extends ConsumerProjection>(scope:T)=>issueConsumerScope(scope,boundOwner,version,source);
  const needsBudgetBoundaryClarification=(next:string,prior:Turn[],anchor:SavedTrip|null|undefined) => {
    const users=prior.filter(item=>item.role==='user');
    const previousFamilies=users.flatMap(item=>platformFamilies(item.content));
    const nextFamilies=platformFamilies(next);
    const priorInScope=previousFamilies.some(family=>!anchor || anchor.families.includes(family));
    const differentService=nextFamilies.some(family=>(!anchor || anchor.families.includes(family)) && !previousFamilies.includes(family));
    if (!priorInScope || !differentService) return false;
    const nextLocation=driveCityRoles(next);
    const priorCity=users.slice().reverse().map(turn=>driveCityRoles(turn.content).city).find(Boolean) ?? (anchor ? routingPlace(anchor.destination) : undefined);
    // An affirmative standalone request at a different known destination
    // cannot inherit the earlier service's budget. Corrections and conditional
    // mentions still require the existing same-request decision.
    if (nextLocation.city && priorCity && nextLocation.city!==priorCity
        && !nextLocation.ambiguous && !nextLocation.unknownDestination && !nextLocation.unknownOrigin
        && !uncertainRequestBoundary(normalizePlatformQuery(next))
        && !/\b(?:instead|same trip|same request)\b|بدلا|نفس الرحله|نفس الطلب/u.test(normalizePlatformQuery(next))) return false;
    const budget=driveBudgetState([...users.map(item=>item.content),next].map(normalizePlatformQuery));
    return Boolean(anchor?.budget != null || budget.confirmed || budget.pending.length);
  };
  // A clear new unanchored request is a boundary even after the earlier
  // same-request clarification was resolved. It never restores a trip.
  const requestIntent=unanchoredScopeIntent(message);
  if (requestIntent==='separate') return issue({message,history:[],trip:null});
  if (requestIntent==='pending') return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:'contested',scopeReason:'service-budget'});
  const previousUser=history.filter(turn=>turn.role==='user').at(-1)?.content;
  const decision=userTripTurnDecision(message,previousUser);
  const current = decision.mentioned && (decision.refused || decision.contested || decision.kind==='new') ? message : scopedTopicChange(message);
  const currentMessage = current ?? message;
  const status=tripScopeStatus(message,history,Boolean(trip)).status;
  if (status==='detached') trip=null;
  if (status==='contested' || status==='revalidation')
    return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:status});
  // Resolve the full turn before interpreting its initial resume phrase.
  if (decision.refused || decision.contested) return issue({ message: currentMessage, history: [], trip: null,
    ...(decision.refused && !platformFamilies(currentMessage).length ? {scopeReason:'trip-refused' as const} : {}) });
  if (resumePlatformTripRequested(currentMessage)) {
    // A text request cannot reattach an anchor detached by an earlier
    // boundary. A fresh authorized source must supply a new selection.
    const detached=history.some(turn=>turn.role==='user' && scopedTopicChange(turn.content)!==null);
    if (!detached && trip) {
      const previous:Turn[]=[];
      for (const turn of history) {
        if (turn.role==='user' && differentRequest(turn.content,previous,trip)
            && needsBudgetBoundaryClarification(turn.content,previous,trip))
          return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:'revalidation'});
        previous.push(turn);
      }
    }
    return issue({ message: currentMessage, history: [], trip: detached?null:trip ?? null });
  }
  if (current !== null) return issue({ message: current || message, history: [], trip: null });
  const boundary = history.findLastIndex(turn => turn.role === 'user' && (scopedTopicChange(turn.content) !== null
    || resumePlatformTripRequested(turn.content)));
  if (boundary >= 0) {
    const next = scopedTopicChange(history[boundary].content) ?? history[boundary].content;
    history = [...(next ? [{ role: 'user' as const, content: next }] : []), ...history.slice(boundary + 1)];
    if (newTripRequested.decision(next).refused || newTripRequested.decision(next).contested || !resumePlatformTripRequested(next)) trip = null;
  }
  // Find request boundaries in USER turns only, including earlier changes in this
  // transcript, so later short replies cannot resurrect another request's facts.
  let scoped: Turn[] = [];
  let unanchoredBoundaryPending=false,unanchoredScopeConfirmed=false;
  const staysInConfirmedRequest=(next:string,prior:Turn[]) => {
    if (!unanchoredScopeConfirmed || explicitlyFreshServiceRequest(normalizePlatformQuery(next))) return false;
    const location=driveCityRoles(next);
    const previousCity=prior.filter(item=>item.role==='user').slice().reverse().map(item=>driveCityRoles(item.content).city).find(Boolean);
    return !location.unknownOrigin && !location.unknownDestination && (!location.city || !previousCity || location.city===previousCity);
  };
  for (const turn of history) {
    const priorDecision=newTripRequested.decision(turn.content);
    const unresolved=priorDecision.mentioned && priorDecision.kind==='uncertain';
    const explicitlyContinues=priorDecision.mentioned && priorDecision.kind==='continue' && !priorDecision.refused && !priorDecision.contested;
    if (!trip && turn.role==='user') {
      const intent=unanchoredScopeIntent(turn.content);
      if (intent==='pending') {unanchoredBoundaryPending=true;scoped.push(turn);continue;}
      const answer=intent;
      if (answer==='separate') {unanchoredBoundaryPending=false;unanchoredScopeConfirmed=false;scoped=[turn];continue;}
      if (unanchoredBoundaryPending && (explicitlyContinues || answer==='same')) {unanchoredBoundaryPending=false;unanchoredScopeConfirmed=true;scoped.push(turn);continue;}
    }
    if (turn.role === 'user' && !unresolved && differentRequest(turn.content, scoped, trip)) {
      // A service boundary inside an attached multi-service trip may be a new
      // request or a continuation. Do not silently turn a known/pending budget
      // into an open match when that distinction has not been resolved.
      if (needsBudgetBoundaryClarification(turn.content,scoped,trip)) {
        if (!trip) {unanchoredBoundaryPending=true;scoped.push(turn);continue;}
        const currentDecision=newTripRequested.decision(message);
        const explicitlyContinues=currentDecision.mentioned && currentDecision.kind==='continue' && !currentDecision.refused && !currentDecision.contested;
        return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:explicitlyContinues?'revalidation':'contested'});
      }
      if (!trip && (unanchoredBoundaryPending || staysInConfirmedRequest(turn.content,scoped))) {scoped.push(turn);continue;}
      scoped = []; trip = null;unanchoredScopeConfirmed=false;
    }
    scoped.push(turn);
  }
  if (unanchoredBoundaryPending && !trip) {
    const explicitlyContinues=decision.mentioned && decision.kind==='continue' && !decision.refused && !decision.contested;
    const answer=platformUnanchoredScopeAnswer(message);
    if (answer==='separate') return issue({message,history:[],trip:null});
    if (explicitlyContinues || answer==='same') return issue({message,history:scoped,trip:null});
    return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:'contested',scopeReason:'service-budget'});
  }
  if (decision.mentioned && decision.kind==='uncertain') return issue({message,history:scoped,trip:trip ?? null});
  if (differentRequest(message, scoped, trip)) {
    if (!trip && staysInConfirmedRequest(message,scoped)) return issue({message,history:scoped,trip:null});
    if (needsBudgetBoundaryClarification(message,scoped,trip))
      return issue({message:TRIP_SCOPE_GUARD,history:[],trip:null,tripStatus:'contested',...(!trip?{scopeReason:'service-budget' as const}:{})});
    return issue({ message, history: [], trip: null });
  }
  return issue({ message, history: scoped, trip: newTripRequested(message) ? null : trip ?? null });
}
export function platformConversationScope(message: string, history: Turn[] = [], trip?: SavedTrip | null, owner?:PlatformScopeOwner) {
  return platformConversationScopeForSource(message,history,trip,owner,'legacy');
}
function buildPlatformContextText(message: string, history: Turn[] = [], trip?: SavedTrip | null):string {
  const scoped=platformConversationScope(message, history, trip);
  if (scoped.tripStatus==='contested' || scoped.tripStatus==='revalidation') return TRIP_SCOPE_GUARD;
  ({ message, history, trip } = scoped);
  // A conversation turn is not a travel refinement. Saved continuity is untouched.
  if (conversationIntent(message)) return message;
  // Replay contextual USER answers in order, so an accepted bare count has the
  // same preference semantics as a qualified count on subsequent refinements.
  // The bounded transcript is not mutated and assistant assertions are never facts.
  const reconstructed: Turn[] = [];
  for (const turn of history.slice(-24)) {
    const content = turn.content.slice(0, 500);
    reconstructed.push({ role: turn.role, content: turn.role === 'user' ? contextualStayGuests(content, reconstructed) ?? contextualDriveParty(content, reconstructed) ?? content : content });
  }
  const currentMessage=contextualStayGuests(message,reconstructed) ?? contextualDriveParty(message,reconstructed) ?? message;
  const currentPreferences=tripPreferences(normalizePlatformQuery(currentMessage));
  const planningContinuation = /^(?:plan my trip|خطط رحلتي|could you help me arrange things|هل تساعدني في ترتيب التفاصيل)[.!?؟،,;:]*$/.test(normalizePlatformQuery(currentMessage));
  // Inherit a service only for a bounded planning continuation or preference/answer, not every
  // unrecognized sentence. Assistant turns indicate question position, not facts.
  const followup=planningContinuation || newTripRequested.decision(currentMessage).mentioned || resumePlatformTripRequested(currentMessage) || platformFamilies(currentMessage).length>0 || currentPreferences.city || currentPreferences.ambiguous
    || currentPreferences.hasDates || currentPreferences.partyMentioned || currentPreferences.luggageMentioned || currentPreferences.durationMentioned || currentPreferences.rooms
    || /\b(?:per day|daily|whole trip|total)\b|للرحله|اجمالي|لكامل|لليوم|في اليوم|يومي/.test(normalizePlatformQuery(currentMessage))
    || platformCurrencySelection(currentMessage).mentioned || /^(?:yes|no|not sure|نعم|لا|مش عارف|ما ادري)$/.test(normalizePlatformQuery(currentMessage))
    || /\b(?:cheaper|cheapest|expensive|budget|manual|automatic|sport|quiet|quieter|slower|relaxed|shade|indoor|outdoor|accessible)\b|ارخص|أرخص|اغلى|أغلى|ميزاني|اقتصادي|اهدا|أهدأ|اهدأ|هادئ|هادي|خليه اهدى/.test(normalizePlatformQuery(currentMessage));
  if (!followup) return currentMessage;
  const context = preferenceContext(currentMessage, reconstructed);
  const party=platformPartyState(message,history,trip);
  const partyFact=platformFamilies(context).join(',')==='drive' && party.mentioned ? party.total===null ? 'passenger count is unknown' : `${party.total} passengers` : null;
  if (!trip || newTripRequested(message)) return [context,partyFact].filter(Boolean).join('\n');
  // Routing receives the typed trip separately. This projection only supplies
  // non-location preferences; no human-readable summary supplies city roles.
  const preferences = tripPreferences(normalizePlatformQuery(context));
  return [trip.families.join(' '), trip.startDate, trip.endDate,
    `${trip.adults} adults`, `${trip.rooms} rooms`, trip.currency,
    preferences.dateWithdrawn ? 'dates are undecided' : null,
    preferences.partyMentioned && !preferences.party ? 'passenger count is unknown' : null,
    preferences.durationMentioned && !preferences.durationDays ? 'duration is unknown' : null,
    message,partyFact].filter(Boolean).join('\n');
}


/** Generated context is an opaque local value. Its text stays private to this
 * module; coercion is rejected so appending user text cannot strip its source. */
export type PlatformGeneratedContext={readonly kind:'platform-generated-context'};
const generatedPlatformContextText=new WeakMap<object,string>();
function platformContextText(context:PlatformGeneratedContext):string {
  const text=generatedPlatformContextText.get(context);
  if (text===undefined) throw new TypeError('Unrecognized generated platform context');
  return text;
}
export function platformContext(message:string,history:Turn[] = [],trip?:SavedTrip|null):PlatformGeneratedContext {
  const context=Object.freeze({kind:'platform-generated-context' as const,
    [Symbol.toPrimitive]():never {throw new TypeError('Generated platform context cannot be coerced to text');}});
  generatedPlatformContextText.set(context,buildPlatformContextText(message,history,trip));
  return context;
}

/** Merge already reconstructed user preferences; no recursive transcript replay. */
function preferenceContext(message: string, history: Turn[]) {
  // Carry only bounded user preferences, never assistant assertions or account data.
  // New explicit preferences override old ones, including when the user names a family.
  const turns = [...history.filter(t => t.role === 'user').slice(-12).map(t => t.content.slice(0, 500)), message];
  const reset = turns.findLastIndex(turn => {const decision=newTripRequested.decision(turn);return decision.kind==='new'||decision.refused||decision.contested;});
  const relevant = turns.slice(Math.max(0, reset));
  const preferences = relevant.map(turn => tripPreferences(normalizePlatformQuery(turn)));
  const current = preferences.at(-1)!;
  const previous = preferences.slice(0, -1).reverse();
  const carry: string[] = [];
  if (!scopedFamilyState(message,[]).active.length) {
    const prior = relevant.slice(0, -1).reverse().find(turn => scopedFamilyState(turn,[]).active.length);
    // Retain catalogue refinements (model/budget), but never private/request text.
    if (prior && !/\bREQ-|طلباتي|my requests|operations|\bceo\b/i.test(prior)) {
      const priorText=normalizePlatformQuery(prior);
      const roomRefinement=platformRooms(priorText) && !Object.values(familyTerms).some(term=>term.test(priorText));
      carry.push(current.ambiguous || roomRefinement ? platformFamilies(prior).join(' ') : current.city ? withoutRoutingCities(prior) : prior);
    }
  }
  if (!current.city && !current.ambiguous) { const city = previous.find(p => p.city || p.ambiguous); if (city?.city) carry.push(`destination: ${city.city}`); else if (city?.ambiguous) carry.push('destination is unknown'); }
  if (!current.hasDates) {
    const prior = previous.find(p => p.hasDates);
    if (prior?.dateWithdrawn) carry.push('dates are undecided');
    else if (prior?.dates.length) carry.push(prior.dates.join(' '));
  }
  if (!current.partyMentioned) {
    const prior = previous.find(p => p.partyMentioned);
    if (prior?.party) carry.push(`${prior.party} adults`);
    else if (prior?.partyMentioned) carry.push('passenger count is unknown');
  }
  if (!current.luggageMentioned) {
    const prior = previous.find(p => p.luggageMentioned);
    if (prior?.luggage !== undefined) carry.push(`${prior.luggage} bags`);
    else if (prior?.luggageMentioned) carry.push('luggage count is unknown');
  }
  if (!current.durationMentioned) {
    const prior = previous.find(p => p.durationMentioned);
    if (prior?.durationDays) carry.push(`${prior.durationDays} days`);
    else if (prior?.durationMentioned) carry.push('duration is unknown');
  }
  if (!current.rooms) { const rooms = previous.find(p => p.rooms)?.rooms; if (rooms) carry.push(`${rooms} rooms`); }
  const rejectedCurrencies = new Set<DisplayCurrency>();
  for (const turn of relevant) {
    const choice = platformCurrencySelection(turn);
    for (const currency of choice.excluded) rejectedCurrencies.add(currency);
    if (choice.explicitRequested) rejectedCurrencies.delete(choice.explicitRequested);
  }
  const currencyChoice = platformCurrencySelection(message);
  if (!currencyChoice.requested) {
    const currency = relevant.slice(0, -1).reverse().map(platformCurrency).find(c => c && !rejectedCurrencies.has(c));
    if (currency) carry.push(currency);
  }
  // Preserve user-authored currency exclusions when a later short turn carries the request.
  for (const currency of rejectedCurrencies) carry.push(`not ${currency}`);
  return [...carry, message].join('\n');
}

/** A bare count is a preference only immediately after the missing Stay guest question. */
function contextualStayGuests(message: string, history: Turn[]): string | null {
  const number = normalizePlatformQuery(message);
  if (!/^[1-9]\d?$/.test(number) || Number(number) > 20) return null;
  const recent = history.slice(-24);
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

/** A short answer fills only the passenger question derived from prior USER facts. */
function contextualDriveParty(message: string, history: Turn[]): string | null {
  const normalized = normalizePlatformQuery(message);
  const compound = bareDrivePartyWithLuggage(normalized);
  const party = bareDriveParty(normalized) ?? compound?.party ?? null;
  if (party === null) return null;
  const question = history.at(-1), user = history.at(-2);
  if (question?.role !== 'assistant' || user?.role !== 'user') return null;
  const prior = preferenceContext(user.content, history.slice(0, -2));
  if (platformFamilies(prior).join(',') !== 'drive') return null;
  const users = history.filter(t => t.role === 'user').slice(-12).map(t => normalizePlatformQuery(t.content));
  const state = driveDialogue(users, tripPreferences(normalizePlatformQuery(prior)));
  if (state?.kind !== 'clarify' || state.question !== 'party') return null;
  const lastLine = question.content.trim().split(/\n\s*\n/).at(-1);
  if (![driveDialogueCopy(state, 'ar').question, driveDialogueCopy(state, 'en').question].includes(lastLine ?? '')) return null;
  return `${party} passengers${compound ? ` ${compound.luggage} bags` : ''}`;
}

const months = ['january|يناير', 'february|فبراير', 'march|مارس', 'april|ابريل', 'may|مايو', 'june|يونيو', 'july|يوليو', 'august|اغسطس', 'september|سبتمبر', 'october|اكتوبر', 'november|نوفمبر', 'december|ديسمبر'];
/** Reduce passenger categories from USER turns and the scoped saved trip.
 * A category correction preserves the other known category; an explicit
 * total is a separate fact and never manufactures a category breakdown. */
function planningUserTurns(message:string,history:Turn[]) {
  const reconstructed:Turn[]=[];
  for (const turn of history) reconstructed.push({...turn,content:turn.role==='user' ? contextualDriveParty(turn.content,reconstructed) ?? turn.content : turn.content});
  return [...reconstructed.filter(turn=>turn.role==='user').map(turn=>turn.content),contextualDriveParty(message,reconstructed) ?? message];
}
function platformPartyState(message:string,history:Turn[],trip?:SavedTrip|null) {
  const validTrip=Boolean(trip && Number.isInteger(trip.adults) && Number.isInteger(trip.children) && trip.adults>=1 && trip.children>=0);
  let adults:number|null=validTrip ? trip!.adults : null;
  let children:number|null=validTrip ? trip!.children : null;
  let total:number|null=validTrip ? adults!+children! : null;
  let mentioned=Boolean(trip);
  let childrenEverMentioned=validTrip;
  // A disputed category remains pending independently of the other one.
  // Keep confirmed facts internally; only the consumer projection is blocked.
  let pendingAdults=false,pendingChildren=false,pendingTotal=false,pendingScope=false;
  let proposedAdults:number|null=null,proposedChildren:number|null=null,proposedTotal:number|null=null;
  for (const input of planningUserTurns(message,history)) {
    for (const span of newTripRequested.actionSpans(normalizePlatformQuery(input))) {
      const uncertain=newTripRequested.deferredMarker(span)||/[?؟]/u.test(span);
      for (const clause of span.split(/[,،](?!\s*(?:or\b|او(?:\s|$)|and\s+(?:above|up|more|over)\b|و\s*(?:اكثر|اقل|فوق)(?![\p{L}])|at\s+(?:(?:a|the)\s+)?(?:least|most|minimum|maximum)\b|(?:minimum|maximum)\b|علي\s+(?:الاقل|الاكثر)|كحد\s+(?:ادني|اقصي|اعلي)))|[;؛]/u)) {
        const q=driveQuantities(clause);
        if(q.children.mentioned)childrenEverMentioned=true;
        if (!q.total.mentioned && !q.adults.mentioned && !q.children.mentioned) continue;
        mentioned=true;
        // A count scoped to another service cannot silently replace this car
        // party; a mixed or unclear service association needs clarification.
        const families=platformFamilies(clause);
        if (uncertain || families.some(family=>family!=='drive')) {
          if (families.some(family=>family!=='drive')) pendingScope=true;
          if (q.total.mentioned) {pendingTotal=true;proposedTotal=q.total.value??null;}
          if (q.adults.mentioned) {pendingAdults=true;proposedAdults=q.adults.value??null;}
          if (q.children.mentioned) {pendingChildren=true;proposedChildren=q.children.value??null;}
          continue;
        }
        if (q.total.mentioned) {
          const value=q.total.value;
          if (value===undefined || q.party.value===undefined) {if (!pendingTotal) proposedTotal=value??null;pendingTotal=true;continue;}
          adults=q.adults.mentioned ? q.adults.value ?? null : null;
          children=q.children.mentioned ? q.children.value ?? null : null;
          total=value;pendingAdults=false;pendingChildren=false;pendingTotal=false;pendingScope=false;
          proposedAdults=null;proposedChildren=null;proposedTotal=null;continue;
        }
        if (q.adults.mentioned) {
          if (q.adults.value===undefined) {if (!pendingAdults) proposedAdults=null;pendingAdults=true;}
          else {adults=q.adults.value;pendingAdults=false;proposedAdults=null;}
        }
        if (q.children.mentioned) {
          if (q.children.value===undefined) {if (!pendingChildren) proposedChildren=null;pendingChildren=true;}
          else {children=q.children.value;pendingChildren=false;proposedChildren=null;}
        }
        if (q.adults.mentioned && q.children.mentioned && q.adults.value!==undefined && q.children.value!==undefined) {
          pendingTotal=false;pendingScope=false;proposedTotal=null;
        }
        total=adults!==null && children!==null && adults+children>0 && adults+children<=20 ? adults+children
          : !childrenEverMentioned && adults!==null && adults>0 ? adults : null;
      }
    }
  }
  const pending=pendingAdults||pendingChildren||pendingTotal||pendingScope;
  return {mentioned,total:pending?null:total,confirmed:{adults,children,total},pending:{adults:pendingAdults,children:pendingChildren,total:pendingTotal,scope:pendingScope},proposals:{adults:proposedAdults,children:proposedChildren,total:proposedTotal}};
}
function tripPreferences(text: string, trip?: SavedTrip | null) {
  const roles = driveCityRoles(text);
  const unknownDestination=roles.unknownDestination||/\bdestination is unknown\b/.test(text);
  const city = roles.ambiguous || unknownDestination ? undefined : trip ? routingPlace(trip.destination) : roles.city;
  const iso = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2})?\b/g)];
  const range = [...text.matchAll(new RegExp(`(?:^|\\s)(\\d{1,2})\\s*(?:to|through|until|الي|حتي|[-–])\\s*(\\d{1,2})\\s+(${months.join('|')})\\s+(\\d{4})(?=\\s|[.,،]|$)`, 'g'))].at(-1);
  const month = range ? months.findIndex(names => names.split('|').includes(range[3])) + 1 : 0;
  const dates = range && (range.index ?? 0) > (iso.at(-1)?.index ?? -1)
    ? [range[1], range[2]].map(day => `${range[4]}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`)
    : iso.slice(-2).map(match => match[0]);
  const dateWithdrawn = dateWithdrawalIndex(text) > Math.max(iso.at(-1)?.index ?? -1, range?.index ?? -1);
  const safeDates = dates.filter(date => validSearchDate(date.slice(0, 10)) && (!date.includes('t') || /t(?:[01]\d|2[0-3]):[0-5]\d$/.test(date)));
  const quantities = driveQuantities(text);
  const party = quantities.party.value ? String(quantities.party.value) : undefined;
  const luggage = quantities.luggage.value;
  const rooms=platformRooms(text);
  return { city, ambiguous: roles.ambiguous || unknownDestination, dates: !dateWithdrawn && safeDates.length === dates.length ? safeDates : [], hasDates: iso.length > 0 || Boolean(range) || dateWithdrawn, dateWithdrawn, party, rooms,
    partyMentioned: quantities.party.mentioned, luggage, luggageMentioned: quantities.luggage.mentioned, durationDays: quantities.days.value, durationMentioned: quantities.days.mentioned };
}
type UserDriveRoute={origin:string;destination:string};
type UserDriveRouteEvidence={route:UserDriveRoute|null;status:'none'|'accepted'|'rejected'|'contested'|'unknown';withholdPickup:boolean;withholdDropoff:boolean};
/** A route objection is attached to its departure/pickup action and source,
 * not to any unrelated negation (such as a driver or hotel preference). */
function rejectedDriveRoute(text:string) {
  const negative=String.raw`(?:do not|does not|did not|can not|will not|never|no longer|not|refuse to|decline to)`;
  const governing=String.raw`(?:(?:want|wish|intend|plan|need)(?:\s+(?:you|me|us))?\s+to\s+)?`;
  const routeAction=String.raw`(?:pick(?:\s+(?:me|us|you|them))?\s+up|(?:be\s+)?picked\s+up|pickup|collect(?:\s+(?:me|us|you|them))?|take|depart|leave|start|travel|go|drive)`;
  // Bounded modifiers such as 'tomorrow' or 'at the airport' belong to
  // the departure action; a contrast or sentence boundary ends its scope.
  const gap=String.raw`(?:\s+(?!(?:but|however|instead|and|from)\b)[\p{L}\p{N}'-]+){0,6}`;
  const english=new RegExp(String.raw`\b${negative}\s+${governing}${routeAction}${gap}\s+from\s+|\b${negative}\s+(?:(?:want|need|use)\s+)?(?:(?:my|our|the|this|saved|current)\s+)?(?:trip|journey)\s+from\s+|\b(?:not|never|no|without|avoid|can not)\s+(?:(?:depart(?:ing)?|leave|pickup|pick\s+up|travel)\s+)?from\s+`,'u');
  const arabic=/(?<![\p{L}])(?:لا|لن|لم)\s*(?:(?:اريد|ابي|احتاج|نريد)\s*(?:ان\s*)?)?(?:الانطلاق|انطلق|تنطلق|ننطلق|الذهاب|اذهب|المغادره|اغادر|تغادر|استلامي|استقبلني|تقلني|تلتقطني|رحلتي|الرحله)(?:\s+(?!(?:لكن|بل)(?![\p{L}]))[\p{L}\p{N}]+){0,5}\s+من\s+|(?<![\p{L}])(?:لا|ليس|ليست|بدون|غير)\s+من\s+/u;
  return english.test(text) || arabic.test(text);
}
/** Route-object refusal is separate from a service or saved-trip refusal. A
 * demonstrative without a user-stated route remains unresolved. */
function rejectedRouteObject(text:string) {
  const english=/\b(?:do not|does not|did not|can not|will not|never|no longer|not|refuse|reject|decline)\s+(?:(?:want|need|use|take|choose|follow|prefer|like)\s+)?(?:(?:the|a|an|my|our|this|that|same|current|previous|saved)\s+){0,3}(?:route|path|itinerary)\b/u;
  const arabic=/(?<![\p{L}])(?:لا|لن|لم|ارفض|نرفض)\s*(?:(?:اريد|ابي|احتاج|نريد|استخدم|تستخدم|نتبع|اعتمد|تعتمد)\s*)?(?:(?:هذا|هذه|ذلك|تلك|نفس)\s*)?(?:المسار|مسار|الطريق|طريق)(?![\p{L}])/u;
  return english.test(text) || arabic.test(text);
}
/** A bare negative pronoun can refer to a route, a vehicle or something
 * else. Do not resolve it from generated context or the saved anchor. */
function ambiguousRouteRefusal(text:string) {
  const negative=String.raw`\b(?:do not|does not|did not|can not|will not|never|not)\s+(?:(?:want|need|use|take|choose|follow|prefer|like)\s+)?`;
  // 'it' and 'them' are independent pronouns even when followed by an
  // adjunct. 'this/that' can instead introduce a named different object.
  const pronoun=new RegExp(negative+String.raw`(?:it|them)\b`,'u');
  const demonstrative=new RegExp(negative+String.raw`(?:this|that)\b(?=\s*[,،;؛.!?؟]|\s*$|\s+(?:now|anymore|currently)\b)`,'u');
  return pronoun.test(text)||demonstrative.test(text)
    || /(?<![\p{L}])(?:لا|لن|لم)\s*(?:اريدها|اريده|استخدمها|استخدمه|تستخدمها|تستخدمه)(?![\p{L}])/u.test(text);
}
/** Reduce route intent only from the scoped USER turns. No saved origin or
 * generated summary is evidence of a pickup. A conditional objection remains
 * contested; a clear later route can resolve it within the same user scope. */
function userDriveRoute(message:string,history:Turn[]):UserDriveRouteEvidence {
  // Preserve the user-stated referent separately from its active projection;
  // a contested route must not be sent but can later be rejected explicitly.
  let route:UserDriveRoute|null=null,reference:UserDriveRoute|null=null,status:UserDriveRouteEvidence['status']='none';
  const turns=[...history.filter(turn=>turn.role==='user').slice(-64).map(turn=>turn.content),message];
  for (const turn of turns) for (const span of newTripRequested.actionSpans(turn)) {
    const whole=newTripRequested.normalizeNegation(normalizePlatformQuery(span));
    const directPolite=/\b(?:can|could|would)\s+you\b|هل\s*يمكنك/u.test(whole);
    const uncertain=newTripRequested.deferredMarker(span) || /[?؟]/u.test(span) && !directPolite;
    // A clear contrast or semicolon delimits the acted-on route, while any
    // condition over the connected span remains in force for both parts.
    for (const part of whole.split(/\s*[,،]?\s*\b(?:but|however|instead)\b\s*|\s*[;؛]\s*|\s*(?<![\p{L}])(?:لكن|بل)(?![\p{L}])\s*/u)) {
      const roles=driveCityRoles(part),rejected=rejectedDriveRoute(part),objectRefusal=rejectedRouteObject(part);
      if (roles.ambiguousOrigin||roles.ambiguousDestination||roles.multiSegment||roles.unassignedLocation) {
        route=null;reference=null;status='contested';continue;
      }
      const refusedCar=scopedFamilyState(part,[]).denied.includes('drive');
      const explicitPlace=Boolean(roles.origin||roles.destination||roles.unknownOrigin||roles.unknownDestination);
      const routeAntecedent:boolean=Boolean(reference)||status==='rejected';
      const sources=[...part.matchAll(/(?:\bfrom\s+|(?<![\p{L}])من\s+)(?=[\p{L}])/gu)].length;
      const competing=sources>1 && (/\b(?:or|and)\s+from\b/u.test(part)||/(?<![\p{L}])(?:او|و)\s*من\s+/u.test(part));
      if (competing) {route=null;reference=null;status='contested';continue;}
      if (rejected || objectRefusal || roles.origin && refusedCar) {
        if (roles.origin && roles.destination && !roles.unknownOrigin && !roles.unknownDestination)
          reference={origin:roles.origin,destination:roles.destination};
        route=null;status=uncertain || objectRefusal && !explicitPlace && !routeAntecedent ? 'contested' : 'rejected';continue;
      }
      if (ambiguousRouteRefusal(part)) {route=null;status='contested';continue;}
      if (roles.unknownOrigin || roles.unknownDestination || roles.origin && !roles.destination) {
        route=null;reference=null;status=uncertain?'contested':'unknown';continue;
      }
      if (roles.origin && roles.destination) {
        reference={origin:roles.origin,destination:roles.destination};
        if (uncertain) {route=null;status='contested';}
        else {route=reference;status='accepted';}
      } else if (route && roles.destination && route.destination!==roles.destination) {
        route=null;reference=null;status='unknown';
      }
    }
  }
  return {route,status,withholdPickup:status==='rejected'||status==='contested'||status==='unknown',withholdDropoff:status==='rejected'||status==='contested'};
}
type CustomerTripBudget={amount:string;currency:DisplayCurrency;basis:'trip'};
/** Customer requirements only, from the current sole-service USER scope. */
function customerTripBudget(scope:ConsumerProjection):CustomerTripBudget|null {
  const snapshot=matchingScopes.get(scope);
  if (!snapshot || snapshot.source!=='user' || snapshot.blocked || !currentMatchingScope(scope)) return null;
  const families=scopedFamilyState(snapshot.message,snapshot.history);
  if (families.active.join(',')!=='drive' || families.denied.includes('drive') || families.contested.includes('drive') || driveServiceDecision(snapshot.message,snapshot.history)!=='open') return null;
  const context=platformContextText(platformContext(snapshot.message,snapshot.history,snapshot.trip));
  const plan=platformDriveDialogue({message:snapshot.message,history:snapshot.history,trip:snapshot.trip,context});
  const budget=plan?.budget;
  if (!plan || plan.pendingBudgets.length || budget?.kind!=='amount' || budget.basis!=='trip') return null;
  const currency=parseDisplayCurrency(budget.currency);
  if (!currency || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(budget.amount) || Number(budget.amount)<=0) return null;
  return {amount:budget.amount,currency,basis:'trip'};
}
function platformEntryFromText(family: PlatformFamily, message: string, locale: Locale, displayCurrency?: DisplayCurrency, trip?: SavedTrip | null, excludedCurrencies: readonly DisplayCurrency[] = [], ignoreEarlierCurrency=false, routeEvidence?:UserDriveRouteEvidence, customerBudget?:CustomerTripBudget|null,handoff?:DriveHandoff) {
  const text = normalizePlatformQuery(message);
  const params = new URLSearchParams({ language: locale });
  const { city, dates, party, luggage, rooms } = tripPreferences(text, trip);
  if (city) params.set('destination', city);
  if (family === 'drive') {
    const roles = driveCityRoles(message);
    // The marketplace defaults destination to pickup. Withhold that fallback
    // for an unresolved source; use only the scoped user route for a pickup.
    if (routeEvidence?.withholdPickup || !routeEvidence && roles.unknownOrigin) {
      params.delete('destination');
      if (!routeEvidence?.withholdDropoff && roles.destination) params.set('dropoff', roles.destination);
    } else if (routeEvidence?.route) {
      params.set('pickup', routeEvidence.route.origin);
      params.set('dropoff', routeEvidence.route.destination);
    }
  }
  const choice=ignoreEarlierCurrency ? {requested:null,excluded:[] as DisplayCurrency[],contested:[] as DisplayCurrency[]} : platformCurrencySelection(message);
  const currency = displayCurrency ?? choice.requested;
  if (currency && !excludedCurrencies.includes(currency) && !choice.excluded.includes(currency) && !choice.contested.includes(currency)) params.set('currency', currency);
  if (family === 'drive') {
    if (dates[0]) params.set(dates[0].includes('t') ? 'pickupAt' : 'pickupDate', dates[0].replace('t', 'T'));
    if (dates[1]) params.set(dates[1].includes('t') ? 'returnAt' : 'returnDate', dates[1].replace('t', 'T'));
    if (handoff) applyDriveHandoff(params,handoff,Boolean(routeEvidence?.withholdPickup),Boolean(routeEvidence?.withholdDropoff));
    else if (airportDriveService(text)) params.set('mode', 'airport');
    if (luggage !== undefined) params.set('luggage', String(luggage));
  } else if (family === 'stay') {
    if (dates[0]) params.set('checkIn', dates[0].slice(0, 10));
    if (dates[1]) params.set('checkOut', dates[1].slice(0, 10));
    if (rooms) params.set('rooms', rooms);
  }
  if (party) params.set(family === 'stay' ? 'adults' : 'passengers', party);
  if (family==='drive' && customerBudget) {
    params.set('budgetAmount',customerBudget.amount);params.set('budgetCurrency',customerBudget.currency);params.set('budgetBasis',customerBudget.basis);
  }
  return serviceEntryHref(family, params);
}
/** Unproven legacy text cannot supply trip-derived link parameters. */
export function platformEntry(family:PlatformFamily,_message:string,locale:Locale,_displayCurrency?:DisplayCurrency,_trip?:SavedTrip|null,_excludedCurrencies:readonly DisplayCurrency[]=[]) {
  return platformEntryFromText(family,'',locale);
}
function scopedDisplayExclusions(history:Turn[],message:string,external:readonly DisplayCurrency[]=[]) {
  const userExclusions=new Set<DisplayCurrency>(),contestedCurrencies=new Set<DisplayCurrency>();
  for (const turn of [...history.filter(turn=>turn.role==='user').slice(-64).map(turn=>turn.content),message]) {
    const choice=platformCurrencySelection(turn);
    for (const currency of choice.excluded) { userExclusions.add(currency); contestedCurrencies.delete(currency); }
    for (const currency of choice.contested) contestedCurrencies.add(currency);
    if (choice.explicitRequested) { userExclusions.delete(choice.explicitRequested); contestedCurrencies.delete(choice.explicitRequested); }
  }
  return [...new Set([...external,...userExclusions,...contestedCurrencies])];
}
/** A link stays behind the same local lifecycle gate as its user request. */
export function preparePlatformEntryForUserRequest(family:PlatformFamily,request:PlatformUserRequest,locale:Locale,displayCurrency?:DisplayCurrency,excludedCurrencies:readonly DisplayCurrency[]=[],localPolicy?:PlatformLocalCurrencyPolicy) {
  const generic=()=>platformEntry(family,'',locale);
  return Object.freeze({deliver:()=>{
    const scope=platformUserRequestScope(request), snapshot=scope ? matchingScopes.get(scope) : undefined;
    const local=localPolicy ? platformLocalCurrencyPolicy(request,localPolicy) : null;
    if (!scope || !snapshot || localPolicy && !local) return generic();
    // A contested request has not authorized any family discovery link;
    // its source turn may itself contain a refusal that is not projected.
    if (snapshot.blocked) return '';
    const familyState=scopedFamilyState(snapshot.message,snapshot.history);
    if (familyState.denied.includes(family) || familyState.contested.includes(family)) return '';
    const decision=newTripRequested.decision(snapshot.message);
    if (snapshot.trip && decision.mentioned && decision.kind==='uncertain') return generic();
    const context=platformContextText(platformContext(snapshot.message,snapshot.history,snapshot.trip));
    const excluded=local?.supersede ? [...local.excludedCurrencies] : scopedDisplayExclusions(snapshot.history,snapshot.message,excludedCurrencies);
    const selected=local ? local.currency ?? undefined : displayCurrency;
    const href=platformEntryFromText(family,context,locale,selected,snapshot.trip,excluded,Boolean(local?.supersede),userDriveRoute(snapshot.message,snapshot.history),customerTripBudget(scope),driveHandoffForUsers([...snapshot.history.filter(turn=>turn.role==='user').map(turn=>turn.content),snapshot.message]));
    return currentMatchingScope(scope) && (!localPolicy || platformLocalCurrencyPolicy(request,localPolicy)) ? href : generic();
  }});
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

function driveCatalogueDestinationEligible(text: string, trip?: SavedTrip | null) {
  // Reuse the catalogue's existing destination boundary before planning.
  // An unavailable destination must not be treated as a supported car service.
  if (!trip && (driveCityRoles(text).unknownDestination || /\bdestination is unknown\b/.test(text))) return false;
  const destination = trip ? routingPlace(trip.destination) : tripPreferences(text).city;
  return trip ? ['cairo', 'giza', 'alexandria'].includes(destination ?? '') : !['riyadh', 'jeddah', 'dubai'].includes(destination ?? '');
}


/** Share the existing USER-only plan between clarification and classifier eligibility. */
function platformDriveDialogue({ message, history, context, trip }: {
  message: string; history: Turn[]; context: string; trip?: SavedTrip | null;
}) {
  const text = normalizePlatformQuery(context);
  const preferences=tripPreferences(text,trip),party=platformPartyState(message,history,trip);
  if (party.mentioned) preferences.party=party.total===null?undefined:String(party.total);
  return driveCatalogueDestinationEligible(text, trip) ? driveDialogue([...history.filter(t => t.role === 'user').slice(-12).map(t => normalizePlatformQuery(t.content.slice(0, 500))), normalizePlatformQuery(message)], preferences) : null;
}

/** A single active Drive dialogue can consume its own follow-up without inference. */
export function hasActivePlatformDriveDialogue(input:PlatformUserRequest|Parameters<typeof platformDriveDialogue>[0]) {
  const scope=input && typeof input==='object' ? scopedUserRequests.get(input) : undefined;
  const snapshot=scope ? matchingScopes.get(scope) : undefined;
  if (!scope || !snapshot || snapshot.source!=='user' || snapshot.blocked || !currentMatchingScope(scope)) return false;
  const context=platformContextText(platformContext(snapshot.message,snapshot.history,snapshot.trip));
  const active=scopedFamilyState(snapshot.message,snapshot.history).active.join(',') === 'drive'
    && platformDriveDialogue({message:snapshot.message,history:snapshot.history,trip:snapshot.trip,context}) !== null;
  return currentMatchingScope(scope) && active;
}
/** Reduce USER service actions in order. A conditional proposal can withhold
 * matching but cannot undo a refusal; an explicit later positive action can.
 * A named driver or hotel is a different object from the car service. */
function driveServiceDecision(message:string,history:Turn[]):'open'|'refused'|'contested' {
  const arabicSelection=new RegExp(String.raw`(?<![\p{L}])${newTripRequested.arabicServiceIntent}(?:\s+(?:لي|علي|لنا|علينا))?\s*(?:${newTripRequested.arabicAnyDeterminer}(?:\s+من)?\s*)?(?:${serviceNames.drive.source})`,'gu');
  const englishSelection=new RegExp(String.raw`\b(?:(?:want|need)\s+(?:(?:you|me|us|them)\s+)?to\s+)?${englishServiceVerb}\s+(?:(?:me|us|a|an|the|my|any|some)\s+){0,3}(?:${serviceNames.drive.source})`,'gu');
  let state:'open'|'refused'|'contested'='open';
  for (const input of planningUserTurns(message,history)) {
    for (const span of newTripRequested.actionSpans(newTripRequested.normalizeNegation(withoutDriveEndpointPlaces(normalizePlatformQuery(input))))) {
      const clauses=span.match(/[^;؛.!?؟\n]+[?؟]?/gu) ?? [];
      let danglingCondition=false;
      for (const clause of clauses) {
        const marker=newTripRequested.deferredMarker(clause);
        const conditional=marker || danglingCondition;
        const polite=/\b(?:can|could|would)\s+you\b|هل\s*يمكنك/u.test(clause);
        const uncertain=conditional || /[?؟]/u.test(clause) && !polite;
        const action=/(?:\b(?:do not|don't|dont|never|no longer)\s+(?:(?:want|intend)\s+to\s+)?(?:want|need|use|request|show)\s+(?:(?:a|an|the|my|any)\s+)?(?:car|cars|vehicle|vehicles|transfer)\b|\bno\s+(?:car|cars|vehicle|vehicles)\b|\bwithout\s+(?:using|use)\s+(?:(?:a|an|the|my|any)\s+)?(?:car|cars|vehicle|vehicles)\b|(?<![\p{L}])لا\s*(?:(?:اريد|احتاج)\s+(?:ان\s+)?)?(?:استخدام|استخدم|تستخدم|اريد|احتاج)\s*(?:ال)?(?:سياره|سيارات|توصيل)(?![\p{L}])|(?<![\p{L}])بدون\s+(?:استخدام|استعمال)\s*(?:ال)?(?:سياره|سيارات)(?![\p{L}])|\b(?:want|need|show|find|search for|arrange|use)\s+(?:to\s+use\s+)?(?:(?:me|a|an|the|my|some)\s+){0,2}(?:car|cars|vehicle|vehicles|transfer)\b|(?<![\p{L}])(?:اريد|احتاج|اعرض|ابحث عن)\s*(?:ال)?(?:سياره|سيارات|توصيل)(?![\p{L}]))/gu;
        const actions=[...clause.matchAll(action),...clause.matchAll(arabicSelection),...clause.matchAll(englishSelection)].sort((a,b)=>a.index-b.index);
        for (const match of actions) {
          const prefix=clause.slice(Math.max(0,match.index-24),match.index);
          const suffix=clause.slice((match.index ?? 0)+match[0].length);
          // Refusing the car's budget is not a refusal of the car itself. Let
          // the budget reducer evaluate that independently scoped object.
          if (serviceFinancialObject(suffix)) continue;
          if (/\b(?:do not|don't|dont|never|no longer)\s*$|(?<![\p{L}])لا\s*$/u.test(prefix)) continue;
          state=uncertain ? 'contested' : /^(?:do not|don't|dont|never|no longer|no\s|without|لا|بدون)/u.test(match[0]) ? 'refused' : 'open';
        }
        // A condition can govern later actions in this connected span; an
        // unrelated side action or punctuation alone does not discharge it.
        if (marker) danglingCondition=true;
      }
    }
  }
  return state;
}
function driveLuggageUnverified(turns:readonly string[]) {
  // Interpret each USER turn independently so a generated carry-forward
  // summary cannot merge two sentence scopes or reclassify a polite request.
  let luggage:{mentioned:boolean;value:number|undefined}={mentioned:false,value:undefined};
  for (const turn of turns) {
    const next=driveQuantities(normalizePlatformQuery(turn)).luggage;
    if (next.mentioned) luggage=next;
  }
  return luggage.mentioned && (luggage.value===undefined || luggage.value>0);
}

/** Approved rate catalogue, never live supplier availability. No network or transaction side effects. */
function evaluatePlatformDriveOffers(_message: string, pricing?: PlatformPricing, trip?: SavedTrip | null, plan?: ReturnType<typeof driveDialogue>, input?:PlatformUserRequest|ReturnType<typeof platformConversationScope>): {status:'blocked'|'evaluated';offers:DriveOffer[];capacityInsufficient?:boolean} {
  const blocked=()=>({status:'blocked' as const,offers:[] as DriveOffer[]});
  const evaluated=(offers:DriveOffer[],capacityInsufficient=false)=>({status:'evaluated' as const,offers,capacityInsufficient});
  // All consumers may share the same opaque request. Existing issued scopes
  // remain accepted for compatibility; neither form proves external identity.
  const scope=input ? scopedUserRequests.get(input) ?? (matchingScopes.has(input) ? input as ConsumerProjection : undefined) : undefined;
  const snapshot=scope ? matchingScopes.get(scope) : undefined;
  // Without the issued structured scope, text cannot prove that a prior
  // protected constraint or objection was not dropped.
  if (!snapshot || snapshot.source!=='user' || !currentMatchingScope(scope) || (trip ?? null)!==snapshot.trip
      || !sameMatchingTrip(trip ?? null,snapshot.tripValue)) return blocked();
  // A supplied pending plan is a veto only. Check it after authenticating the
  // local capability and before a contested-scope veto, never as authority to
  // open matching or to bypass either guard.
  if (plan && (plan.kind !== 'ready' || plan.pendingBudgets.length)) return blocked();
  const familyState=scopedFamilyState(snapshot.message,snapshot.history);
  if (snapshot.blocked || familyState.denied.includes('drive') || familyState.contested.includes('drive') || driveServiceDecision(snapshot.message,snapshot.history)!=='open') return blocked();
  if (userDriveRoute(snapshot.message,snapshot.history).withholdPickup) return blocked();
  trip=snapshot.tripValue;
  const message=platformContextText(platformContext(snapshot.message,snapshot.history,trip));
  const text = normalizePlatformQuery(message);
  const tripDecision=newTripRequested.decision(message);
  const independentNew=tripDecision.kind==='new' && snapshot.tripValue===null && snapshot.history.length===0;
  if ((tripDecision.mentioned && (tripDecision.kind==='uncertain' || tripDecision.kind==='new' && !plan && !independentNew))) return blocked();
  if (!driveCatalogueDestinationEligible(text, trip)) return evaluated([]);
  if (/\b(bmw|tesla|audi|honda)\b|بي ام|تسلا|اودي|هوندا/.test(text)) return evaluated([]);
  const makes = [...new Set(DRIVE_OFFERS.map(o => vehicleFor(o).make))];
  const matchingMakes = makes.filter(make => DRIVE_OFFERS.some(o => {
    const v = vehicleFor(o);
    return v.make === make && (text.includes(normalizePlatformQuery(make)) || text.includes(normalizePlatformQuery(v.ar.split(' ')[0])));
  }));
  const modelTokens = [...new Set(DRIVE_OFFERS.map(o => normalizePlatformQuery(vehicleFor(o).model)))];
  const models = modelTokens.filter(model => new RegExp(`(?:^|[^a-z0-9])${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')}(?:$|[^a-z0-9])`).test(text));
  const requestedCodes = text.match(/\b(?:[a-z]{1,3}\d{1,3}|[tesvghx]\s+\d{1,3})\b/g) ?? [];
  if (requestedCodes.some(code => !modelTokens.some(model => model.replace(/\s/g,'').includes(code.replace(/\s/g,''))))) return evaluated([]);
  const longestModels = models.filter(model => !models.some(other => other !== model && other.includes(model)));
  const airport = airportDriveService(text);
  // Derive budget from the issued scope, never the mutable text argument or
  // a potentially stale caller-supplied plan.
  const userTurns=planningUserTurns(snapshot.message,snapshot.history);
  const budgetState = driveBudgetState(userTurns.map(normalizePlatformQuery));
  if (budgetState.pending.length) return blocked();
  // A direct matcher and the response use the same dialogue's driver state.
  // Mentioning a driver without resolving the preference is not evidence
  // that the chauffeured catalogue satisfies the request.
  const mentionedDriver=userTurns.some(turn=>/\b(?:driver|chauffeur)\b|سائق|سواق/u.test(normalizePlatformQuery(turn)));
  const driverPlan=mentionedDriver ? platformDriveDialogue({message:snapshot.message,history:snapshot.history,context:message,trip}) : plan ?? null;
  if (mentionedDriver && !driverPlan || driverPlan && (driverPlan.driver==='without' || driverPlan.driver===null && mentionedDriver)) return blocked();
  // Match against the issued USER preferences, not a caller's stale plan or
  // generated context alone. An explicit unknown count and undocumented bag
  // capacity cannot be presented as verified matches by any consumer.
  // A bare number may be a passenger answer or some other preference. It is
  // not evidence for replacing a known party size; withhold matches until a
  // later explicit passenger count resolves that ambiguity.
  const ambiguousPartyAt=userTurns.findLastIndex(turn=>{
    const value=normalizePlatformQuery(turn);
    return bareDriveParty(value)!==null || bareDrivePartyWithLuggage(value)!==null;
  });
  const explicitPartyAt=userTurns.findLastIndex(turn=>driveQuantities(normalizePlatformQuery(turn)).party.mentioned);
  if (ambiguousPartyAt>=0 && ambiguousPartyAt>explicitPartyAt) return blocked();
  if (driveLuggageUnverified(userTurns)) return blocked();
  const partyState=platformPartyState(snapshot.message,snapshot.history,trip);
  if (partyState.mentioned && partyState.total===null) return blocked();
  const party=partyState.total;
  const budget = budgetState.confirmed;
  // A saved budget has no duration basis in this contract; it cannot silently
  // become an unbounded catalogue match.
  if (!budget && snapshot.tripValue?.budget != null) return blocked();
  if ((!budget && /\bbudget\b|ميزاني/u.test(text))
      || (budget?.kind === 'amount' && (!budget.currency || budget.basis !== 'day'))) return blocked();
  const budgetCurrency = budget?.kind === 'amount' ? budget.currency! : platformCurrency(message) ?? pricing?.currency ?? 'USD';
  const maxBudget = budget?.kind === 'amount' ? Number(budget.amount) : undefined;
  let missingBudgetFx=false;
  const eligible=DRIVE_OFFERS.filter(o => {
    const vehicle = vehicleFor(o), price = airport ? o.airport : o.chauffeur;
    return price !== null && (!matchingMakes.length || matchingMakes.includes(vehicle.make))
      && (!longestModels.length || longestModels.includes(normalizePlatformQuery(vehicle.model)))
      && (maxBudget === undefined || (() => { const converted = displayPrice(price, o.currency, budgetCurrency, pricing?.snapshot); if (converted.unavailable) missingBudgetFx=true; return !converted.unavailable && converted.amount <= maxBudget; })());
  });
  const selected=eligible.filter(offer=>{
    if (party===null) return true;
    const capacity=vehicleFor(offer).passengers;
    return typeof capacity==='number' && Number.isInteger(capacity) && capacity>0 && capacity>=party;
  }).sort((a, b) => {
    const direction = /expensive|highest|اغلي|الاعلي/.test(text) ? -1 : 1;
    const target = pricing?.currency ?? budgetCurrency;
    const left = displayPrice(airport ? a.airport! : a.chauffeur, a.currency, target, pricing?.snapshot);
    const right = displayPrice(airport ? b.airport! : b.chauffeur, b.currency, target, pricing?.snapshot);
    return (left.currency === right.currency ? direction * (left.amount - right.amount) : left.currency.localeCompare(right.currency)) || a.id.localeCompare(b.id);
  });
  return currentMatchingScope(scope) && !missingBudgetFx ? evaluated(selected,party!==null && eligible.length>0 && selected.length===0) : blocked();
}

export function findPlatformDriveOffers(message: string, pricing?: PlatformPricing, trip?: SavedTrip | null, plan?: ReturnType<typeof driveDialogue>, input?:PlatformUserRequest|ReturnType<typeof platformConversationScope>): DriveOffer[] {
  return evaluatePlatformDriveOffers(message,pricing,trip,plan,input).offers;
}

/** Summaries use parsed USER facts only, never assistant claims or account records. */
function previousDriveSummary(history: Turn[], locale: Locale, trip?: SavedTrip | null, excludedCurrencies: readonly DisplayCurrency[] = []) {
  const index = history.findLastIndex(turn => turn.role === 'user' && !conversationIntent(turn.content));
  if (index < 0) return null;
  const message = history[index].content, before = history.slice(0, index);
  const context = platformContextText(platformContext(message, before, trip));
  if (scopedFamilyState(message,before).active.join(',') !== 'drive') return null;
  const users = [...before.filter(turn => turn.role === 'user').slice(-12).map(turn => normalizePlatformQuery(turn.content)), normalizePlatformQuery(message)];
  const state = driveDialogue(users, tripPreferences(normalizePlatformQuery(context), trip));
  return state ? driveDialogueCopy(state, locale, excludedCurrencies) : null;
}
// Keep the established response capability opaque: the market adapter can
// retrieve its matching cards through a private association, while callers of
// the response continue to receive only the guarded delivery operation.
const preparedOfferDeliveries=new WeakMap<object,()=>DriveOffer[]>();
function preparedPlatformResponse<T extends object>(deliver:()=>T,deliverOffers:()=>DriveOffer[]) {
  const response=Object.freeze({deliver});
  preparedOfferDeliveries.set(response,deliverOffers);
  return response;
}
/** Public DABRA uses platform capabilities only. Environment flags cannot enable a web fallback. */
export function preparePlatformAssistantResponse(input: string|PlatformUserRequest, legacyHistory: Turn[] = [], locale: Locale = 'ar', now = Date.now(), familyOverride?: PlatformFamily, pricing?: PlatformPricing, legacyTrip?: SavedTrip | null, legacyOwner?:PlatformScopeOwner, localPolicy?:PlatformLocalCurrencyPolicy) {
  const ar = locale === 'ar';
  // Legacy text may already contain generated trip facts. It has no source
  // proof, so do not reparse, echo, link, or treat it as a USER message.
  const clarification=ar?'يرجى توضيح الخدمة والوجهة والميزانية المطلوبة من جديد.':'Please clarify the service, destination and budget you want.';
  const changed=ar?'تغير سياق الطلب؛ يرجى إعادة المحاولة.':'The request context changed; please try again.';
  const safe=(answer:string)=>preparedPlatformResponse(()=>({[CORE_REQUIRED_DIALOGUE_UNITS]:Object.freeze([answer]),answer,sources:[],language:locale,groundingStatus:'grounded' as const,provider:'local' as const,retrievalMode:'internal-catalog' as const}),()=>[]);
  if (typeof input==='string' || !input || typeof input!=='object' || legacyHistory.length || legacyTrip != null || legacyOwner != null) {
    // A new unproven turn still supersedes any earlier result in its local
    // lifecycle; withholding it must not leave a stale delivery usable.
    const priorScope=input && typeof input==='object' ? scopedUserRequests.get(input) : undefined;
    const priorOwner=priorScope ? matchingScopes.get(priorScope)?.owner : null;
    priorOwner?.invalidate();
    if (legacyOwner?.[scopeOwnerBrand] && legacyOwner!==priorOwner) legacyOwner.invalidate();
    return safe(clarification);
  }
  const scoped=scopedUserRequests.get(input);
  const snapshot=scoped ? matchingScopes.get(scoped) : undefined;
  if (!scoped || !snapshot || snapshot.source!=='user' || !currentMatchingScope(scoped)) return safe(changed);
  const local=localPolicy ? platformLocalCurrencyPolicy(input,localPolicy) : null;
  if (localPolicy && !local) return safe(changed);
  if (local) pricing={currency:local.currency,snapshot:pricing?.snapshot ?? null,excludedCurrencies:local.excludedCurrencies};
  const matchingScope=scoped;
  const message=snapshot.message, history=snapshot.history.map(turn=>({...turn})), trip=snapshot.trip;
  const projected=Boolean(familyOverride && trip && !history.length);
  const blockedTrip=snapshot.blocked;
  const context = blockedTrip ? TRIP_SCOPE_GUARD : projected ? message : platformContextText(platformContext(message, history, trip)), text = normalizePlatformQuery(context), current = withoutNegativeActions(normalizePlatformQuery(message));
  const familyState=scopedFamilyState(message,history),userFamilies=familyState.active;
  if (familyOverride && familyState.denied.includes(familyOverride)) return safe(ar?'سبق أن رفضت هذه الخدمة؛ ما الخدمة التي تريدها؟':'You declined this service; which service would you like?');
  if (familyOverride && familyState.contested.includes(familyOverride)) return safe(ar?'يرجى توضيح ما إذا كنت تريد هذه الخدمة.':'Please clarify whether you want this service.');
  const relevantFamilies=userFamilies.filter(family=>platformFamilies(context).includes(family)&&!familyState.contested.includes(family));
  const families = familyOverride ? [familyOverride] : relevantFamilies.length ? relevantFamilies : platformFamilies(context).filter(family=>!familyState.denied.includes(family)&&!familyState.contested.includes(family));
  const drivePlan = platformDriveDialogue({ message, history, context, trip });
  // Reconstruct user-authored currency events in order. Generated context or
  // an empty external field cannot erase a current explicit refusal.
  const excludedCurrencies=local?.supersede ? [...local.excludedCurrencies] : scopedDisplayExclusions(history,message,pricing?.excludedCurrencies ?? []);
  const link = serverReplyLink;
  const lines = serverReplySegments();
  const requiredUnits: string[] = [];
  let cardOffers:DriveOffer[]=[];
  const tooSoonRequest=platformFamilies(message).includes('drive') && /(?:after|in)\s*[1-5]\s*hours?|بعد\s*(?:ساعه|ساعتين|[1-5]\s*ساعات)/u.test(current);
  if (tooSoonRequest) return safe(ar?'الموعد أقرب من 6 ساعات؛ اختر موعدًا بعد 6 ساعات على الأقل حتى تقبل المنصة إنشاء الطلب.':'Pickup is less than 6 hours away. Choose a pickup at least 6 hours ahead to submit a request.');
  const conversational = familyOverride ? null : conversationIntent(message);
  const smallTalk = familyOverride ? null : conversationReply(message, history, locale);
  const tripDecision=newTripRequested.decision(message);
  if (blockedTrip || tripDecision.mentioned && tripDecision.kind==='uncertain') {
    const question=scoped.scopeReason==='trip-refused'
      ? (ar?'لن أستخدم الرحلة المرفوضة. ما الخدمة التي تريد طلبها؟':'I will not use the rejected trip. What service would you like to request?')
      : scoped.scopeReason==='service-budget'
      ? (ar?'هل ميزانيات الخدمات لنفس الطلب أم تريد طلباً منفصلاً؟':'Do the service budgets belong to the same request, or do you want a separate request?')
      : scoped.tripStatus==='revalidation'
      ? (ar?'قبل متابعة الرحلة المحفوظة، أحتاج إلى التحقق من صلاحية استخدامها.':'Before continuing the saved trip, I need to verify that it is still available for use.')
      : (ar?'هل نتابع الرحلة الحالية أم نبدأ رحلة جديدة؟':'Should we continue the current trip or start a new trip?');
    requiredUnits.push(question); lines.push(question);
  } else if (conversational === 'summary' || conversational === 'repair' || conversational === 'price_objection') {
    const prior = previousDriveSummary(history, locale, trip, excludedCurrencies);
    if (conversational === 'repair' || conversational === 'summary') lines.push(ar ? 'معك حق، سأركز على ما ذكرتَه.' : 'I understand; I will focus on what you told me.');
    if (prior) lines.push(prior.summary);
    if (conversational === 'price_objection') lines.push(ar ? 'أقدر أساعدك بمراجعة الخيارات ضمن ميزانيتك، لكن تأكيد السعر الإجمالي والتوفر يرجع للعمليات.' : 'I can help review options within your budget; Operations must confirm the total price and availability.');
    else if (conversational === 'repair' && prior?.question) { requiredUnits.push(prior.question); lines.push(prior.question); }
    else if (!prior) lines.push(ar ? 'ما زلت أحتاج تفاصيل الطلب المؤكدة حتى ألخصه بدقة.' : 'I still need the confirmed request details to summarize them accurately.');
  } else if (smallTalk) lines.push(smallTalk);
  else if (/\b(?:cancel|refund|my requests|my bookings)\b|(?<![\p{L}])(?:الغاء|الغي|استرد|حجوزاتي|طلباتي|حاله\s+طلبي|حاله\s+الطلب)(?![\p{L}])/u.test(current)) {
    lines.push(ar ? 'تابع حالة طلبك أو عرض العمليات من حسابك. افتح الطلب المحدد للمراجعة؛ لا أعدّل أو ألغي طلبًا من المحادثة.' : 'Review your request and the Operations offer in your account. Open the specific request; chat does not change or cancel it.');
    lines.push(link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
  } else if (/pay|payment|ادفع|دفع|تحويل|كاش/.test(current) && !families.length) {
    lines.push(ar ? 'راجع المبلغ وطريقة التحصيل مع العمليات من طلبك. لا أسجّل دفعًا أو تأكيدًا من المحادثة.' : 'Review the amount and collection method with Operations in your request. Chat does not record payment or confirmation.', link(ar ? 'متابعة الطلب' : 'View requests', '/my-requests'));
  } else {
    if (!families.length && /trip|itinerary|رحله|برنامج سفر|خطه سفر|(?:^|[^\p{L}\p{N}_])رحل(?:تي|تنا)(?=$|[^\p{L}\p{N}_])/u.test(current)) families.push(...(['drive','stay'] as PlatformFamily[]).filter(family=>!familyState.denied.includes(family)));
    for (const family of families) {
      const href = platformEntryFromText(family, context, locale, pricing?.currency ?? undefined, trip, excludedCurrencies, Boolean(local?.supersede),userDriveRoute(message,history),customerTripBudget(matchingScope),driveHandoffForUsers([...history.filter(turn=>turn.role==='user').map(turn=>turn.content),message]));
      if (family === 'drive') {
        const serviceDecision=driveServiceDecision(message,history);
        if (serviceDecision!=='open') {
          lines.push(serviceDecision==='refused'
            ? (ar?'لن أقترح سيارة بعد رفضك لها. ما الخدمة التي تريدها؟':'I will not suggest a car after you declined it. What service would you like?')
            : (ar?'طلب السيارة معلق؛ يرجى تأكيده قبل عرض المطابقات.':'The car request is pending; please confirm it before showing matches.'));
          continue;
        }
        if (userDriveRoute(message,history).withholdPickup) {
          const question = ar ? 'يرجى توضيح مسار السيارة، وتحديد مدينة الانطلاق والوجهة حتى لا أستخدم مساراً سابقاً.' : 'Which city is the car route for? Please clarify one departure and one destination so I do not reuse an earlier route.';
          requiredUnits.push(question); lines.push(question);
          continue;
        }
        if (!driveCatalogueDestinationEligible(text, trip)) {
          lines.push(ar ? 'لم أجد سيارة للوجهة المطلوبة في الكتالوج. كتالوج السيارات الحالي يعرض خدمات مصر؛ أستطيع مساعدتك في تحديد احتياجك دون تخمين سعر أو توفر هناك.' : 'No car matches the requested destination in the current catalogue. The car catalogue covers Egypt; I can help clarify your needs without guessing local prices or availability.');
          lines.push(link(ar ? 'مراجعة متطلبات السيارة' : 'Review car requirements', href));
          continue;
        }
        let evaluatedOffers:ReturnType<typeof evaluatePlatformDriveOffers>|null=null;
        if (drivePlan) {
          const copy = driveDialogueCopy(drivePlan, locale, excludedCurrencies);
          lines.push(copy.summary);
          if (copy.question) { requiredUnits.push(copy.summary, copy.question); lines.push(copy.question); continue; }
          if (drivePlan.driver === 'without' || drivePlan.budget?.kind === 'amount' && drivePlan.budget.basis === 'trip') {
            lines.push(driveOwnerAvailabilityCopy(locale));
            lines.push(ar ? 'الكتالوج هنا لخدمات بسائق وأسعار يومية، وليس تأكيدًا لخدمة بدون سائق أو إجمالي الرحلة. تؤكد عمليات مصر التفاصيل حسب متطلباتك.' : 'This catalogue lists chauffeured daily rates. It does not confirm a self-drive service or a trip total. Egypt Operations must verify those requirements.', link(ar ? 'مراجعة متطلبات السيارة' : 'Review car requirements', href));
            continue;
          }
          if (driveLuggageUnverified([...history.filter(turn=>turn.role==='user').map(turn=>turn.content),message])) {
            lines.push(link(ar?'مراجعة متطلبات السيارة':'Review car requirements',href));
            lines.push(ar?'لا أجد سعة ركاب موثقة مع هذه الأمتعة؛ سعة الأمتعة غير موثقة لهذه الخيارات وتحتاج تأكيد العمليات قبل المطابقة.':'Luggage capacity is not documented for these options; Operations must confirm it before matching.');
            continue;
          }
          evaluatedOffers=evaluatePlatformDriveOffers(context, pricing, trip, drivePlan, input);
          if (evaluatedOffers.status==='blocked') {
            const question=ar?'لا أستطيع التحقق من المطابقة بعد؛ يرجى توضيح الميزانية والعملة ومدتها.':'I cannot verify matches yet; please clarify the budget, currency and duration.';
            requiredUnits.push(question); lines.push(question); continue;
          }
          if (evaluatedOffers.capacityInsufficient) {
            lines.push(driveOwnerAvailabilityCopy(locale));
            lines.push(ar ? 'لا أجد ضمن هذه الخيارات سعة ركاب موثقة تكفي هذا العدد، لذلك لا أقدر أرشّح سيارة تناسبه بثقة. تؤكد عمليات مصر السعة والسائق والتوفر والسعر حسب متطلباتك.' : 'No listed option has documented capacity for this party, so I cannot recommend one as fitting. Egypt Operations must confirm capacity, driver, availability and the quote for your requirements.', link(ar ? 'إكمال متطلبات السيارة للمراجعة' : 'Continue with the car requirements for review', href));
            continue;
          }
        }
        if (driveLuggageUnverified([...history.filter(turn=>turn.role==='user').map(turn=>turn.content),message])) {
          lines.push(link(ar?'مراجعة متطلبات السيارة':'Review car requirements',href));
          lines.push(ar?'لا أجد سعة ركاب موثقة مع هذه الأمتعة؛ سعة الأمتعة غير موثقة لهذه الخيارات وتحتاج تأكيد العمليات قبل المطابقة.':'Luggage capacity is not documented for these options; Operations must confirm it before matching.');
          continue;
        }
        const outcome=evaluatedOffers ?? evaluatePlatformDriveOffers(context, pricing, trip, drivePlan, input);
        if (outcome.status==='blocked') {
          const budget=driveBudgetState(planningUserTurns(message,history).map(normalizePlatformQuery));
          const party=platformPartyState(message,history,trip);
          const partyScopeOnly=party.pending.scope && !newTripRequested.deferredMarker(message) && !/[?؟]/u.test(message)
            && !budget.confirmed && !budget.pending.length;
          const question=partyScopeOnly
            ? (ar?'هل عدد المسافرين المذكور ينطبق على السيارة؟ تؤكد العمليات السعة قبل المطابقة.':'Does the stated party size apply to the car? Operations must confirm capacity before matching.')
            : (ar?'لا أستطيع التحقق من المطابقة بعد؛ يرجى توضيح الميزانية والعملة ومدتها.':'I cannot verify matches yet; please clarify the budget, currency and duration.');
          requiredUnits.push(question); lines.push(question);
          if (partyScopeOnly) lines.push(link(ar?'مراجعة متطلبات السيارة':'Review car requirements',href));
          continue;
        }
        const party=drivePlan?.preferences.party ?? tripPreferences(text,trip).party;
        const offers = outcome.offers.filter(offer => !party || (vehicleFor(offer).passengers ?? 0) >= Number(party)), airport = airportDriveService(text);
        cardOffers=offers;
        const pickup = new URL(href, 'https://dir3com.com').searchParams.get('pickupAt');
        const instant = pickup ? cairoInstant(pickup) : null;
        const tooSoon = (instant !== null && instant < now + 6 * 3600000) || /(?:after|in)\s*[1-5]\s*hours?|بعد\s*(?:ساعه|ساعتين|[1-5]\s*ساعات)/.test(current);
        if (tooSoon) lines.push(ar ? 'الموعد أقرب من 6 ساعات؛ اختر موعدًا بعد 6 ساعات على الأقل حتى تقبل المنصة إنشاء الطلب.' : 'Pickup is less than 6 hours away. Choose a pickup at least 6 hours ahead to submit a request.');
        if (offers.length) {
          lines.push(driveOwnerAvailabilityCopy(locale));
          const referenceId = /nissan sunny|نيسان صني/.test(text) ? 'nissan-sunny' : /kia carnival|كيا كرنفال/.test(text) ? 'kia-carval' : null;
          const reference = referenceId ? driveModelReferenceCopy(referenceId, locale) : null;
          if (reference) lines.push(reference);
          lines.push(ar ? `هذه خيارات كتالوج dir3com في مصر، وستؤكد العمليات توفر الموعد المطلوب (${offers.length} خيارًا مطابقًا):` : `These are dir3com catalogue options in Egypt; Operations will confirm availability for the requested dates (${offers.length} matching options):`);
          let hiddenPrice = false, visiblePrice = false, sourceFallback = false, convertedPrice = false;
          for (const offer of offers.slice(0, 3)) {
            const price = displayPrice(airport ? offer.airport! : offer.chauffeur, offer.currency, pricing?.currency ?? platformCurrency(context) ?? offer.currency, pricing?.snapshot);
            const blocked = excludedCurrencies.includes(parseDisplayCurrency(price.currency) as DisplayCurrency);
            hiddenPrice ||= blocked; visiblePrice ||= !blocked; sourceFallback ||= !blocked && price.unavailable; convertedPrice ||= !blocked && price.converted;
            const label = blocked ? vehicleTitle(vehicleFor(offer), locale) : `${vehicleTitle(vehicleFor(offer), locale)}: ${price.amount.toFixed(2)} ${price.currency} / ${airport ? (ar ? 'استقبال مطار' : 'airport transfer') : (ar ? 'يوم' : 'day')}`;
            lines.push(link(label, `${href}&offer=${encodeURIComponent(offer.id)}`));
          }
          if (hiddenPrice) lines.push(ar ? 'تعذر عرض بعض الأسعار بعملة مقبولة حالياً؛ تؤكد العمليات السعر دون تخمين سعر الصرف.' : 'Some prices cannot currently be shown in an accepted currency; Operations will confirm the price without guessing an exchange rate.');
          if (convertedPrice && pricing?.snapshot) lines.push(ar ? `تحويل للعرض بتاريخ ${pricing.snapshot.asOf}؛ سعر الطلب النهائي تؤكده العمليات.` : `Display conversion as of ${pricing.snapshot.asOf}; Operations confirms the final quote.`);
          if (sourceFallback) lines.push(ar ? 'تعذر جلب سعر الصرف لبعض الخيارات؛ المعروض منها بعملة المصدر.' : 'Exchange rates are unavailable for some options; those shown use their source currency.');
          lines.push(visiblePrice ? (ar ? 'السعر المعروض للسيارة، وليس إجمالي الرحلة. اليوم يشمل السائق والبنزين و120 كم؛ تؤكد العمليات الإجمالي والمواصفات.' : 'Shown rates are per vehicle, not a trip total. A day includes driver, fuel and 120 km; Operations confirms the total and vehicle details.') : (ar ? 'اليوم يشمل السائق والبنزين و120 كم؛ تؤكد العمليات الإجمالي والمواصفات.' : 'A day includes driver, fuel and 120 km; Operations confirms the total and vehicle details.'));
        } else lines.push(ar ? 'لم أجد سيارة مطابقة ضمن الكتالوج الحالي. غيّر الطراز أو الميزانية، أو راجع خيارات مصر.' : 'No car matches the current catalogue. Adjust the model or budget, or review Egypt options.');
        lines.push(link(ar ? 'اختيار السيارة وإكمال مواعيد الطلب' : 'Choose a car and complete request dates', href));
        lines.push(ar ? 'إنشاء الطلب قبل الموعد بـ6 ساعات على الأقل. الدخول عند إرسال الطلب، ثم تؤكد عمليات مصر السيارة والسعر. لم يُنشأ طلب أو حجز من هذه المحادثة.' : 'Submit at least 6 hours before pickup. Sign in when submitting; Egypt Operations confirms the vehicle and price. This chat has not created a request or booking.');
      } else if (family === 'stay') {
        if (trip ? driveCityRoles(message).ambiguous || driveCityRoles(message).unknownDestination : tripPreferences(text, trip).ambiguous) {
          const question = ar ? 'أي مدينة تقصد للإقامة؟ حدّد الوجهة ومدينة المغادرة بشكل منفصل.' : 'Which city is your Stay destination? Specify the destination and departure city separately.';
          requiredUnits.push(question); lines.push(question);
          continue;
        }
        lines.push(ar ? 'ابحث عن الفنادق داخل Stay وحدد المدينة والتواريخ والنزلاء. نتائج LiteAPI موسومة Sandbox؛ الأسعار تأتي من البحث نفسه، والحجز والدفع غير مفعّلين لهذا المسار.' : 'Search hotels inside Stay with a city, dates and guests. LiteAPI results are labelled Sandbox; rates come from the search response. Booking and payment are disabled for this flow.', link(ar ? 'البحث عن الفنادق داخل dir3com' : 'Search hotels inside dir3com', href));
      } else if (family === 'fly' || family === 'concierge') {
        lines.push(ar ? `${family === 'fly' ? 'الطيران' : 'الكونسيرج'} قيد التجهيز داخل dir3com. أستطيع الآن ترتيب التنقل في مصر واستكشاف الإقامة من المنصة.` : `${family === 'fly' ? 'Fly' : 'Concierge'} is coming soon inside dir3com. I can help with Egypt transport and Stay discovery now.`, link(ar ? 'الخدمات داخل المنصة' : 'Services inside dir3com', '/services'));
      } else lines.push(ar ? 'راجع عروض VIP المنشورة داخل المنصة. تفاصيل الخدمة والسعر والتوفر تتحدد في العرض ومراجعة العمليات.' : 'Review published VIP options inside dir3com. The listing and Operations review determine details, price and availability.', link(ar ? 'استكشاف VIP' : 'Explore VIP', href));
    }
    const copy = AI2_DABRA_CONVERSATION_COPY[locale];
    if (!lines.length && history.some(turn=>turn.role==='assistant')) {
      lines.push(conversationClarification(history,locale));
    } else if (!lines.length) {
      if (!history.slice(-24).some(turn => turn.role === 'assistant')) lines.push(copy.identity);
      lines.push(copy.serviceQuestion);
      // Generic discovery links must obey the same refusal/uncertainty as
      // a selected family and its cards; they cannot re-advertise a denial.
      if (!familyState.denied.includes('drive') && !familyState.contested.includes('drive'))
        lines.push(link(ar ? 'السيارات والأسعار' : 'Cars and rates', platformEntryFromText('drive', context, locale, pricing?.currency ?? undefined, undefined, excludedCurrencies, Boolean(local?.supersede),userDriveRoute(message,history),customerTripBudget(matchingScope),driveHandoffForUsers([...history.filter(turn=>turn.role==='user').map(turn=>turn.content),message]))));
      if (!familyState.denied.includes('stay') && !familyState.contested.includes('stay'))
        lines.push(link(ar ? 'بحث الإقامة' : 'Stay search', platformEntryFromText('stay', context, locale, pricing?.currency ?? undefined, undefined, excludedCurrencies, Boolean(local?.supersede))));
      lines.push(link(ar ? 'طلباتي' : 'My requests', '/my-requests'));
    } else if (!smallTalk && families.length === 1 && (families[0] === 'drive' || families[0] === 'stay') && !(families[0] === 'drive' && drivePlan)) {
      const preferences = tripPreferences(text, trip);
      // Ask for only the next missing preference, using bounded user context.
      if (!preferences.ambiguous) {
        const question = !preferences.city ? copy.cityQuestion
          : preferences.dates.length < 2 ? copy.datesQuestion
          : families[0] === 'stay' && !preferences.party ? copy.guestsQuestion : null;
        if (question) { requiredUnits.push(question); lines.push(question); }
      }
    }
  }
  const answer=renderServerReply(lines.segments, locale, message);
  const candidate={ [CORE_REQUIRED_DIALOGUE_UNITS]: Object.freeze(requiredUnits), answer, sources: [{ sourceId: 'dir3com-platform', sourceName: 'dir3com catalogue and service journeys', sourceType: 'internal' as const }], language: locale, groundingStatus: 'grounded' as const, provider: 'local' as const, retrievalMode: 'internal-catalog' as const };
  const withheld={ [CORE_REQUIRED_DIALOGUE_UNITS]: Object.freeze([changed]), answer:changed, sources:[], language:locale, groundingStatus:'grounded' as const, provider:'local' as const, retrievalMode:'internal-catalog' as const };
  // Keep the candidate private until the caller invokes the local delivery
  // gate; an asynchronous server still has to call it after its final await.
  const stillCurrent=()=>currentMatchingScope(matchingScope) && (!localPolicy || Boolean(platformLocalCurrencyPolicy(input,localPolicy)));
  return preparedPlatformResponse(()=>stillCurrent() ? candidate : withheld,
    ()=>stillCurrent() ? cardOffers : []);
}
export function buildPlatformAssistantResponse(message: string|PlatformUserRequest, history: Turn[] = [], locale: Locale = 'ar', now = Date.now(), familyOverride?: PlatformFamily, pricing?: PlatformPricing, trip?: SavedTrip | null, owner?:PlatformScopeOwner) {
  return preparePlatformAssistantResponse(message,history,locale,now,familyOverride,pricing,trip,owner).deliver();
}

/** The view consumes one issued request for matching, links and the fallback
 * response. The final delivery gate is local to this view lifecycle only. */
export function preparePlatformMarketDisplay(request:PlatformUserRequest,family:PlatformFamily,locale:Locale,pricing?:PlatformPricing,localPolicy?:PlatformLocalCurrencyPolicy) {
  const local=localPolicy ? platformLocalCurrencyPolicy(request,localPolicy) : null;
  const effectivePricing=local ? {currency:local.currency,snapshot:pricing?.snapshot ?? null,excludedCurrencies:local.excludedCurrencies} : pricing;
  const entry=preparePlatformEntryForUserRequest(family,request,locale,effectivePricing?.currency ?? undefined,effectivePricing?.excludedCurrencies ?? [],localPolicy);
  // Reply and cards share one prepared decision, including service, plan,
  // budget, driver, capacity, luggage and the same local delivery gate.
  const response=preparePlatformAssistantResponse(request,[],locale,Date.now(),family,effectivePricing,undefined,undefined,localPolicy);
  const stale=()=>({status:'stale' as const,offers:[] as DriveOffer[],entry:'',answer:locale==='ar'?'تغير سياق الطلب؛ يرجى إعادة المحاولة.':'The request context changed; please try again.',facts:null});
  return Object.freeze({deliver:()=>{
    const activeFacts=platformUserRequestFacts(request);
    if (!activeFacts || localPolicy && !platformLocalCurrencyPolicy(request,localPolicy)) return stale();
    const href=entry.deliver(), answer=response.deliver().answer;
    const offers=family==='drive' ? preparedOfferDeliveries.get(response)?.() ?? [] : [];
    if (!platformUserRequestFacts(request) || localPolicy && !platformLocalCurrencyPolicy(request,localPolicy)) return stale();
    return {status:'ready' as const,offers,entry:href,answer,facts:activeFacts};
  }});
}
