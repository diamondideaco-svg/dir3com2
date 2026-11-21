import type { SavedTrip } from './continuity-contract';
import { tripTurnDecision, turnHasDeferredIntent, turnHasDeferredMarker, conditionalActionSpans, normalizeNegativeContractions } from './trip-turn-decision.mjs';

const cities = [
  ['cairo', 'القاهرة'], ['giza', 'الجيزة'], ['riyadh', 'الرياض'],
  ['jeddah', 'جدة'], ['dubai', 'دبي'], ['alexandria', 'الإسكندرية'],
] as const;
function normalize(value: string) {
  return normalizeNegativeContractions(value.toLowerCase().normalize('NFKC')).replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}
export function routingPlace(value: string) {
  const normalized = normalize(value);
  return cities.find(names => names.some(name => normalize(name) === normalized))?.[0] ?? normalized;
}
// Shared after Arabic normalization: any, feminine any, and accusative any.
const arabicAnyDeterminer=String.raw`اي(?:ه|ا)?(?![\p{L}])`;
// Shared service-action grammar covers a wish with an optional dependent verb
// or verbal noun. It does not itself decide polarity or authorization.
const arabicServiceVerb=String.raw`(?:استخدم|تستخدم|اعرض|تعرض|اظهر|تظهر|عرض|رؤيه|رويه|اري|تريني|مشاهده|استخدام|استعمال)`;
const arabicServiceIntent=String.raw`(?:(?:اريد|ابي|ابغي|احتاج)(?:\s+(?:ان\s+)?${arabicServiceVerb})?|(?:اعرض|اظهر|استخدم|ابحث\s+عن|اختر|احجز|رتب))`;
/** Backward-compatible boolean plus the shared whole-turn decision. */
export const newTripRequested = Object.assign(
  (message:string) => tripTurnDecision(message).kind === 'new',
  { decision:tripTurnDecision, deferred:turnHasDeferredIntent, deferredMarker:turnHasDeferredMarker, actionSpans:conditionalActionSpans, normalizeNegation:normalizeNegativeContractions, arabicAnyDeterminer, arabicServiceVerb, arabicServiceIntent },
);
export function withoutRoutingCities(message: string) {
  const aliases = cities.flatMap(names => names.map(normalize)).join('|');
  return normalize(message).replace(new RegExp(`(?<![\\p{L}])(?:${aliases})(?![\\p{L}])`, 'gu'), '');
}

/** Bounded city-role interpretation, not a general NLU or authorization source. */
export function cityRoles(message: string) {
  const text = normalize(message);
  const tokens = cities.flatMap(([name, ar]) => [name, normalize(ar)].map(alias => ({ name, alias })))
    .flatMap(({ name, alias }) => [...text.matchAll(new RegExp(`(?<![\\p{L}])${alias}(?![\\p{L}])`, 'gu'))]
      .map(match => ({ name, index: match.index!, end: match.index! + alias.length })));
  const ordered = tokens.sort((a, b) => a.index - b.index);
  let origin: string | undefined, destination: string | undefined, destinationIndex=-1;
  const unqualified = new Set<string>();
  for (const token of ordered) {
    const before = text.slice(0, token.index);
    // A waypoint's local 'in/at' does not change the destination role.
    if (/(?:\b(?:stop(?:over)?|layover|waypoint)\s+(?:in|at|near)|(?<![\p{L}])(?:توقف|محطه|استراحه)\s+(?:في|ب))\s*$/u.test(before)) continue;
    if (/(?:\b(?:not|no|without|avoid)|(?<![\p{L}])(?:لا|ليس|ليست|غير|مو|مش))\s+(?:in|to|from|في|الي|من)\s*$/u.test(before)) continue;
    if (/(?:\bfrom|\borigin|من|المغادره من)\s*[:=]?\s*$/.test(before)) origin = token.name;
    else if (/(?:\bto|\bin|\bdestination|\binstead|الي|في|الوجهه|بدلا من ذلك في)\s*[:=]?\s*$/.test(before)) { destination = token.name; destinationIndex=token.index; }
    else unqualified.add(token.name);
  }
  // A named but unrecognised destination must not inherit a prior city.
  // A short explicit destination correction can stand without a service word.
  const servicePattern = /\b(?:car|cars|driver|chauffeur|transfer|hotel|hotels|apartment|apartments|flight|flights|instead|change\s+(?:the\s+)?destination)\b|سيار|سائق|سواق|توصيل|نقل|فندق|فنادق|شقه|شقق|طيران|بدلا|تعديل الوجهه|غير الوجهه/u;
  const service = servicePattern.exec(text);
  const nonPlaces = /^(?:english|arabic|the|a|an|from|with|for|morning|evening|afternoon|summer|winter|spring|autumn|fall|january|february|march|april|may|june|july|august|september|october|november|december|من|مع|الي|الانجليزيه|الانجليزي|العربيه|العربي|اليوم|الصباح|المساء|المطار|الصيف|الشتاء|الربيع|الخريف|صيفا|شتاء)$/u;
  const aliases = new Set(cities.flatMap(names => names.map(normalize)));
  // Reuse the existing exclusions before classifying route-role alternatives.
  const nonSource = /^(?:eur|usd|sar|egp|aed|euro|euros|riyals?|dollars?|now|today|tomorrow|today|يورو|دولار|ريال|جنيه|درهم|اليوم|الان|غدا|فضلك|دون|غير|اجل|قبل|بعد)$/u;
  const displayCurrency = /^(?:usd|sar|egp|eur|aed|euros?|(?:us\s+)?dollars?|saudi\s+riyals?|egyptian\s+pounds?|emirati\s+dirhams?|(?:ال)?(?:يورو|ريال|دولار|جنيه|درهم))(?![\p{L}])/u;
  // Interpret alternatives in the role phrase, not by counting repeated
  // prepositions. A single from/من can govern two competing sources.
  const sourceCues=[...text.matchAll(/(?<![\p{L}])(?:from|من)\s+(?=[\p{L}])/gu)].filter(cue=>!nonSource.test(text.slice((cue.index??0)+cue[0].length).match(/^[\p{L}][\p{L}'-]*/u)?.[0]??''));
  const destinationCues=[...text.matchAll(/(?<![\p{L}])(?:to|in|الي|في)\s+(?=[\p{L}])/gu)];
  const nonPlaceAlternative=/^(?:a|an|with|without|no|driver|chauffeur|show|find|see|view|watch|look|book|use|want|need|reply|answer|respond|speak|say|do|does|did|can|could|would|will|should|must|if|unless|when|once|until|لا|لن|لم|ليس|ليست|please|the|my|your|our|i|we|you|me|us|it|maybe|perhaps|hotel|hotels|car|cars|restaurant|restaurants|budget|budgets|price|prices|cost|costs|rate|rates|about|around|approximately|near|nearby|مع|بدون|سائق|سواق|بسائق|اعرض|ابحث|اريد|احتاج|انا|نحن|ربما|بعد|قبل|فندق|فنادق|سياره|سيارات|مطعم|مطاعم|ميزانيه|الميزانيه|بميزانيه|اسعار|الاسعار|سعر|قرب)$/u;
  const placeCandidate=(value:string)=>{
    const bare=value.replace(/^ال/u,'');
    // An adjunct introduced after a comma can describe a passenger, purpose,
    // time or polite acknowledgement rather than name another place. Keep
    // unknown bare place candidates unresolved; do not treat every comma as
    // a new destination or exclude arbitrary Arabic words beginning with ل.
    const nonLocationAdjunct=/^(?:for|with|without|during|after|before|because|please|kindly|thank|thanks|regards|regarding|including|especially|ل(?:ل)?(?:راكب(?:ين|ان)?|مسافر(?:ين|ان)?|شخص(?:ين|ان)?|عائل[هة]|اسر[هة]|اطفال|طفل(?:ين|ان)?|بالغ(?:ين|ان)?|ركاب)|شكر(?:ا|ًا)?|مشكور|فضلا)$/u;
    const driverAdjunct=/^(?:ب|مع)?(?:سائق|سواق)(?:ه|ها)?$/u;
    return !nonPlaceAlternative.test(value)&&!nonPlaceAlternative.test(bare)
      && !nonLocationAdjunct.test(value)&&!driverAdjunct.test(value)&&!/^(?:then|destination|وجهه|وجهتي|جهه|ثم)$/u.test(bare)
      && !nonSource.test(value)&&!displayCurrency.test(value.replace(/^و(?=ال)/u,''));
  };
  // A coordinate is an alternative only if it directly joins place
  // candidates. A later driver, service or price alternative is not a city.
  const hasPlaceList=(segment:string)=>{
    const first=/^\s*(?:(?:the\s+)?city\s+of\s+|مدينه\s+)?([\p{L}][\p{L}'-]*)/u.exec(segment);
    if (!first || !placeCandidate(first[1])) return false;
    const tail=segment.slice(first[0].length);
    const next=/^(?:\s*[,،]\s*(?:(?:or|and|او)\s+)?|\s*[/&]\s*|\s+(?:or|and|او)\s+|\s+و\s*)(?:(?:from|to|in|من|الي|في)\s+)?([\p{L}][\p{L}'-]*)/u.exec(tail);
    return Boolean(next && placeCandidate(next[1]));
  };
  const clauseEnd=(start:number)=>{
    const boundary=/[;؛.!?؟\n]/u.exec(text.slice(start));
    return boundary ? start+(boundary.index??0) : text.length;
  };
  const ambiguousOrigin=sourceCues.some(source=>{
    const start=(source.index??0)+source[0].length;
    const next=destinationCues.find(cue=>(cue.index??0)>=start);
    const end=Math.min(next?.index ?? text.length,clauseEnd(start));
    return hasPlaceList(text.slice(start,end));
  });
  const destinationTails=destinationCues.map(cue=>text.slice((cue.index??0)+cue[0].length));
  const ambiguousDestination=destinationTails.some(hasPlaceList);
  // 'Including <place>' establishes another location but does not say
  // whether it is an alternative, stop or destination. Keep that role open;
  // passenger and service adjuncts are not themselves locations.
  const unassignedLocation=Boolean(destination && sourceCues.some(source=>{
    const start=source.index??0,clause=text.slice(start,clauseEnd(start));
    const additions=[...clause.matchAll(/\bincluding\s+(?:(?:the\s+)?city\s+of\s+)?([\p{L}][\p{L}'-]*)/gu)];
    return additions.some(match=>{
      const candidate=match[1],place=routingPlace(candidate);
      const otherAdjunct=/^(?:passengers?|people|travell?ers?|children|adults?|luggage|baggage|bags?|tax(?:es)?|tolls?|fuel|insurance|one|two|three|four|five|six|seven|eight|nine|ten|stop(?:over)?|layover|waypoint)$/u;
      return placeCandidate(candidate) && !otherAdjunct.test(candidate) && place!==origin && place!==destination;
    });
  }));
  // The current contract carries one leg. A waypoint or a following leg is
  // unresolved rather than silently reduced to a guessed origin/destination.
  const via=sourceCues.some(source=>{
    const start=source.index??0,clause=text.slice(start,clauseEnd(start));
    return /(?<![\p{L}])(?:to|in|الي|في)\s+[\p{L}]/u.test(clause)
      && /(?:\b(?:via|through)\s+|(?<![\p{L}])(?:عبر|مرورا\s+ب)\s+)[\p{L}]/u.test(clause);
  });
  const subsequentLeg=destinationTails.some(tail=>{
    const match=/^[\p{L}][\p{L}'-]*(?:\s*[,،]\s*|\s+)(?:(?:and|و)\s+)?(?:then|ثم)\s+(?:(?:to|in|الي|في)\s+)?([\p{L}][\p{L}'-]*)/u.exec(tail);
    return Boolean(match && !nonPlaceAlternative.test(match[1]));
  });
  // A named stop is a separate role even when introduced after the final
  // destination. The single-leg contract cannot silently project it away.
  const waypoint=sourceCues.some(source=>{
    const start=source.index??0,clause=text.slice(start,clauseEnd(start));
    const stops=[...clause.matchAll(/(?:\b(?:stop(?:over)?|layover|waypoint)\s+(?:in|at|near)|(?<![\p{L}])(?:توقف|محطه|استراحه)\s+(?:في|ب))\s+[\p{L}]/gu)];
    return stops.some(stop=>!/(?:\b(?:no|without|skip|omit|avoid)\s+(?:(?:a|any|the)\s+)?|(?<![\p{L}])(?:لا|بدون|بلا|تجنب)\s*)$/u.test(clause.slice(0,stop.index)));
  });
  const multiSegment=sourceCues.length>0 && destinationCues.length>0 && (via||subsequentLeg||waypoint);
  if (ambiguousOrigin) origin=undefined;
  if (ambiguousDestination) destination=undefined;
  const ambiguous=ambiguousOrigin||ambiguousDestination||multiSegment||unassignedLocation||!destination && (unqualified.size>1 || origin!==undefined && unqualified.size>0);
  const city=destination ?? (!origin && !ambiguous && unqualified.size===1 ? [...unqualified][0] : undefined);
  const relativeTime = /^(?:one|two|three|four|five|six|seven|eight|nine|ten|few|several|next)\s+(?:hours?|days?|weeks?|months?|years?)\b/u;
  const arabicRelativeTime = /^(?:(?:واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست|سبعه|سبع|ثمانيه|ثمان|تسعه|تسع|عشره|عشر)\s+(?:ايام|يوم|اسابيع|اسبوع|اشهر|شهور|شهر|ساعات|ساعه|سنوات|سنين|سنه)|يومين|اسبوعين|شهرين|ساعتين|سنتين)(?=$|[^\p{L}])/u;
  // A currency or a time expression after a place preposition is not a
  // destination. Examine explicit place phrases on either side of the service.

  const nonDestination = /^(?:use|find|see|show|view|display|present|list|quote|search|travel|book|get|choose|change|me|you|them)$/u;
  const unknownDestination = Boolean(service && [...text.matchAll(/(?:\b(?:in|to)[ \t]+|(?<![\p{L}])(?:في|الي)[ \t]+)([\p{L}][\p{L}'-]*)/gu)].some(match => {
    const index=match.index ?? 0;
    const before=text.slice(Math.max(0,index-32),index);
    const phrase=text.slice(index+match[0].length-match[1].length);
    const rejected=/(?:\b(?:not|no|without|avoid)|(?<![\p{L}])(?:لا|ليس|ليست|غير|مو|مش))\s*$/u.test(before);
    // Residence is not the service destination when the user separately
    // states a known service city. An unknown transfer source stays guarded.
    const residence=/(?:\b(?:i|we)\s+(?:live|reside|work)|(?<![\p{L}])(?:اعيش|اسكن|اقيم))\s*$/u.test(before);
    const separateServiceCity=residence && destinationIndex>(service?.index ?? -1);
    // An approval clause introduced by 'في حال' is not a city.
    // Limit this exception to that grammatical form so unknown places stay guarded.
    const conditionalPhrase=/^حال(?:ه)?(?=$|[^\p{L}])/u.test(phrase) && turnHasDeferredIntent('في '+phrase);
    const tripReference=/^(?:نفس|هذه|هذي)\s+(?:ال)?رحله(?![\p{L}])/u.test(phrase)
      || /^(?:ال)?رحله\s+(?:نفسها|الحاليه|المحفوظه)(?![\p{L}])/u.test(phrase)
      || /^(?:ال)?رحله(?![\p{L}])/u.test(phrase) || /^رحلتي(?![\p{L}])/u.test(phrase);
    return !rejected && !separateServiceCity && !conditionalPhrase && !tripReference && !aliases.has(match[1]) && !nonPlaces.test(match[1]) && !nonDestination.test(match[1])
      && !displayCurrency.test(phrase) && !relativeTime.test(phrase) && !arabicRelativeTime.test(phrase);
  }));
  // An explicit source which is outside the bounded city vocabulary is not
  // permission to reuse a saved origin. Residence and currency/time phrases
  // are not source assertions. The consumer must request clarification.
  const sourceTokens = [...text.matchAll(/(?:\bfrom\s+|(?<![\p{L}])من\s+)(?:(?:the\s+)?city\s+of\s+|مدينه\s+|(?:the|an|a)\s+)?([\p{L}][\p{L}'-]*)/gu)];

  const unknownOrigin = Boolean((service || destination) && sourceTokens.some(match => {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 48), match.index);
    const residenceOrRejection = /(?:\bi\s+(?:am|live|come)|\bi'm|انا|نحن|اسكن|اعيش|\bnot|\bwithout|ليس|لا|غير|بدون)\s*$/u.test(before);
    // A service-selection action can take a partitive object (أي من الفنادق).
    // A bare 'أي من الفندق إلى القاهرة' can instead name an unknown route
    // origin. A following destination without an intervening new action keeps
    // the source unresolved; a later independent service action does not.
    const serviceSelection=new RegExp(String.raw`(?<![\p{L}])(?:لا\s*(?:(?:اريد|ابي|احتاج)\s*(?:ان\s+)?)?(?:${arabicServiceVerb})?|${arabicServiceIntent})(?:\s+(?:لي|علي|لنا|علينا))?\s*${arabicAnyDeterminer}\s*$`,'u').test(before);
    const after=text.slice((match.index ?? 0)+match[0].length).split(/[;؛.!?؟\n]/u,1)[0];
    const destinationAfter=/(?:^|[\s,،])(?:الي|الى|to)\s+/u.exec(after);
    const between=destinationAfter ? after.slice(0,destinationAfter.index) : '';
    const newAction=/\b(?:show|display|find|choose|request)\b|(?<![\p{L}])(?:اعرض|اظهر|ابحث|اختر|اريد|احتاج)(?![\p{L}])/u.test(between);
    // An explicitly introduced destination clause is distinct from the
    // preceding partitive service object, even when joined by a comma or و.
    const separateDestination=/(?:[,،]\s*(?:و\s*)?|(?:^|\s)و)(?:الوجهه|وجهتي|الجهه)\s*$/u.test(between);
    const routeContinuation=Boolean(destinationAfter && !newAction && !separateDestination);
    // A family's stated people count is not a departure city.
    const partyCount=/(?:عائله|اسره)\s*$/u.test(before)
      && /^\s+(?:اشخاص|افراد|ركاب|مسافرين|بالغين|اطفال)(?![\p{L}])/u.test(text.slice((match.index ?? 0)+match[0].length));
    if (partyCount) return false;
    const partitiveService=serviceSelection && servicePattern.test(match[1]) && !routeContinuation;
    return !partitiveService && !residenceOrRejection && !aliases.has(match[1]) && (!nonPlaces.test(match[1]) || match[1] === 'المطار') && !nonSource.test(match[1]);
  }));
  return { origin, destination, city, ambiguous, ambiguousOrigin, ambiguousDestination, multiSegment, unassignedLocation, unknownDestination, unknownOrigin };
}

/** Only explicit roles update a resumed trip; its display summary is never parsed. */
export function refineRoutingTrip(trip: SavedTrip, message: string): SavedTrip {
  const roles = cityRoles(message);
  return { ...trip, origin: roles.unknownOrigin || roles.ambiguousOrigin || roles.multiSegment || roles.unassignedLocation ? null : roles.origin ?? trip.origin, destination: roles.destination ?? trip.destination, families: [...trip.families] };
}
