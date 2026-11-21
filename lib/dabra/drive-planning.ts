import { tripTurnDecision, turnHasDeferredIntent, turnHasDeferredMarker, conditionalActionSpans, withoutIndependentConditionalActions, normalizeNegativeContractions } from './trip-turn-decision.mjs';

/** Public, request-local planning facts. No identity, persistence or provider execution. */
type Locale = 'ar' | 'en';
const numbers: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
  صفر:0, واحد:1, واحده:1, اثنان:2, اثنين:2, اثنتان:2, اثنتين:2, ثلاثه:3, ثلاث:3, اربعه:4, اربع:4,
  خمسه:5, خمس:5, سته:6, ست:6, سبعه:7, سبع:7, ثمانيه:8, ثماني:8, ثمان:8, تسعه:9, تسع:9, عشره:10, عشر:10,
  'احد عشر':11, 'اثنا عشر':12, 'اثني عشر':12, 'ثلاثه عشر':13, 'اربعه عشر':14, 'خمسه عشر':15,
  'سته عشر':16, 'سبعه عشر':17, 'ثمانيه عشر':18, 'تسعه عشر':19, عشرون:20, عشرين:20, ثلاثون:30, ثلاثين:30, اربعون:40, اربعين:40, خمسون:50, خمسين:50, ستون:60, ستين:60, سبعون:70, سبعين:70, ثمانون:80, ثمانين:80, تسعون:90, تسعين:90,
};
const arabicTens = 'عشرون|عشرين|ثلاثون|ثلاثين|اربعون|اربعين|خمسون|خمسين|ستون|ستين|سبعون|سبعين|ثمانون|ثمانين|تسعون|تسعين';
const arabicUnits = 'واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست|سبعه|سبع|ثمانيه|ثماني|ثمان|تسعه|تسع';
// Consume unsupported word-number compounds whole, but keep independent numeric
// literals separate (ISO dates can immediately precede a passenger quantity).
const numberWords = Object.keys(numbers).sort((a,b)=>b.length-a.length).join('|').replace(/ /g,'\\s+') + '|hundred|thousand|million|مئه|مائه|ميه|مئتان|مائتان|الف|الاف|مليون';
const numeral = '(?:[+-]\\s*)?(?:\\d[\\d.,٫٬]*|[.,٫٬]\\d+)';
const numberJoin = '(?:[ -]+(?:and\\s+)?|\\s*و\\s*)';
const token = '(?:' + numeral + '|(?:' + numberWords + ')(?:' + numberJoin + '(?:' + numberWords + '|' + numeral + ')){0,8})';
// A bounded span must not restart at a valid suffix of another number phrase.
const partialNumberPrefix = new RegExp('(?:^|[^\\p{L}\\p{N}.,٫٬+−-])(?:' + numeral + '|' + numberWords + ')' + numberJoin + '$','u');
function numberValue(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (numbers[normalized] !== undefined) return numbers[normalized];
  const english = normalized.replace(/-/g, ' ').split(' ');
  if (english.length === 2 && numbers[english[0]] >= 20 && numbers[english[0]] % 10 === 0 && numbers[english[1]] > 0 && numbers[english[1]] < 10) return numbers[english[0]] + numbers[english[1]];
  const arabic = normalized.match(new RegExp('^(' + arabicUnits + ')\\s*و\\s*(' + arabicTens + ')$'));
  return arabic ? numbers[arabic[1]] + numbers[arabic[2]] : undefined;
}
export function dateWithdrawalIndex(text: string) {
  const expression = /dates? (?:are |is )?(?:undecided|unknown|not decided)|forget (?:the )?(?:previous |old )?dates|لم احدد (?:المواعيد|التواريخ)|(?:المواعيد|التواريخ) غير محدده|انس (?:المواعيد|التواريخ)(?: السابقه)?|(?:الغ|الغي|امسح) (?:المواعيد|التواريخ)/g;
  return [...text.matchAll(expression)].filter(m => !/\b(?:do not|don't|never)\s*$/.test(text.slice(0, m.index))).at(-1)?.index ?? -1;
}
function lastIndex(text: string, expression: RegExp) { return [...text.matchAll(expression)].at(-1)?.index ?? -1; }
/** Locate the nearest independent action before a dependent "with/without"
 * phrase; an unrelated earlier service refusal is not its governor. */
function governingActionPrefix(text:string) {
  return text.split(/\b(?:but|however)\b|\band\s+(?=(?:(?:i|we|they|he|she|you)\s+)?(?:will|shall|can|could|may|might|want|need|plan|choose|decide)\b|(?:i|we|they|he|she|you)\s+[a-z]+\b)|(?<![\p{L}])(?:لكن|بل)(?![\p{L}])|(?<![\p{L}])و(?=(?:يمكنني|يمكننا|استطيع|نستطيع|اقدر|نقدر|س?اسافر|س?نسافر|سوف)(?![\p{L}]))/u).at(-1) ?? '';
}
function negativeGoverningAction(text:string) {
  return /\b(?:cannot|can't|cant|can\s+not|couldn't|could\s+not|will\s+not|won't|do\s+not|don't|dont|does\s+not|never|unable\s+to|not\s+able\s+to|impossible|not\s+possible|not|refuse(?:s|d|ing)?|decline(?:s|d|ing)?|reject(?:s|ed|ing)?|no\s+(?:one|person|traveller|traveler)\s+(?:can|could))\b/u.test(text)
    || /(?<![\p{L}])(?:لا|لن|لم|ما|مش|مو)\s*[\p{L}]+|(?<![\p{L}])(?:غير\s+قادر|ارفض|نرفض|رفض|نتجنب)(?![\p{L}])/u.test(text);
}
/** Classify the whole count candidate before it can update an exact fact.
 * Alternatives and ranges stay unknown even when their final number is next
 * to the unit. The bounded context is not a general language parser. */
function quantityAlternative(before:string,after:string) {
  const connector='(?:\\b(?:or|to|through)\\b|(?<![\\p{L}])(?:او|الي|الى)(?![\\p{L}])|/|[-–])';
  const modifier='(?:(?:just|only|exactly|about|roughly|approximately|فقط|حوالي|بالضبط)\\s+)*';
  const count='(?:'+token+'|طفلان|طفلين|بالغان|شخصين|شنطتين|حقيبتين)';
  const left=new RegExp('(?<![\\p{L}\\p{N}])'+count+'(?:\\s+[\\p{L}]+)?\\s*[,،]?\\s*'+connector+'\\s*'+modifier+'$','u');
  const right=new RegExp('^\\s*[,،]?\\s*'+connector+'\\s*'+modifier+count+'(?![\\p{L}\\p{N}])','u');
  return left.test(before)||right.test(after);
}
function quantity(text: string, units: string, max: number, dual: RegExp, reset: RegExp, prefix?: string, min = 1) {
  const expressions=[new RegExp('(?<![\\p{L}\\p{N}.,٫٬+−-])(?:و\\s*)?(?:ل{1,2})?('+token+')\\s*(?:'+units+')(?!\\p{L})','gu')];
  if(prefix) expressions.push(new RegExp('(?:'+prefix+')\\s+('+token+')(?![\\p{L}\\p{N}])','gu'));
  const match=expressions.flatMap(p=>[...text.matchAll(p)]).sort((a,b)=>a.index-b.index).at(-1);
  const resetAt=lastIndex(text,reset);
  const explicitEnd = match ? match.index + match[0].length : -1;
  const dualMatch=[...text.matchAll(dual)].filter(m => !match || m.index < match.index || m.index >= explicitEnd).at(-1);
  const dualAt=dualMatch?.index ?? -1;
  const index=Math.max(match?.index??-1,dualAt);
  if(resetAt>=0&&resetAt>index)return {mentioned:true,value:undefined};
  if(index<0)return {mentioned:false,value:undefined};
  // Bounds and alternatives apply to the actual selected candidate span,
  // including a lexical Arabic dual rather than only a digit-plus-unit match.
  const selectedDual=Boolean(dualMatch && dualAt >= (match?.index??-1));
  const selectedEnd=selectedDual ? dualAt+dualMatch![0].length : explicitEnd;
  const before=text.slice(Math.max(0,index-72),index),after=text.slice(selectedEnd);
  // A bound or a negated exact count is not the count itself. Associate the
  // qualifier with the numeric mention, not an unrelated negated service.
  const bound=/(?:\b(?:more|less|fewer|greater|larger|smaller)\s+than|\bat\s+(?:(?:a|the)\s+)?(?:least|most|minimum|maximum)|\b(?:(?:a|the)\s+)?(?:minimum|maximum)(?:\s+of)?|\b(?:up\s+to|no\s+more\s+than|no\s+less\s+than|over|under|above|below|exceeding)|(?<!\p{L})(?:اكثر|اقل|ازيد|اعلي|ادني)\s+من|(?<!\p{L})علي\s+(?:الاقل|الاكثر)|(?<!\p{L})(?:ب|ك)?حد\s+(?:ادني|اقصي|اعلي)(?:\s+من)?)\s*[:：]?\s*$/u.test(before)
    || /^\s*(?:[,،]\s*)?(?:or\s+(?:more|less)|and\s+(?:above|up|more|over)|at\s+(?:(?:a|the)\s+)?(?:least|most|minimum|maximum)|minimum|maximum|(?:او|و)\s*(?:اكثر|اقل|فوق)|علي\s+(?:الاقل|الاكثر)|كحد\s+(?:ادني|اقصي|اعلي)|فاكثر|فاقل)(?!\p{L})/u.test(after);
  const negated=/(?:\b(?:not|never)\s+(?:(?:only|just|exactly)\s+)?|\b(?:do not|don't|dont|does not|doesn't|is not|isn't|are not|aren't)\s+(?:(?:have|need|are|only|just|exactly)\s+){0,3}|(?<!\p{L})(?:ليست|ليس|لسنا|لا|لم|ما|مش|مو)\s*(?:(?:يوجد|توجد|في|لدينا|عندنا|معنا|نحن|عددنا|عدد|فقط)\s*){0,3})$/u.test(before);
  // Keep the conjunction in the prefix when rejecting suffixes of unsupported compound numbers.
  const leadingAnd = match?.[0].match(/^و\s*/)?.[0] ?? '';
  const partial = match && partialNumberPrefix.test(text.slice(0,match.index) + leadingAnd);
  const dependentWith=/(?:\bwith|(?<![\p{L}])مع)\s*$/u.exec(before);
  const governedNegative=Boolean(dependentWith && negativeGoverningAction(governingActionPrefix(before.slice(0,dependentWith.index))));
  const nonexact=negated||governedNegative||bound||partial||quantityAlternative(before,after);
  const n=nonexact?undefined:selectedDual?2:match?numberValue(match[1]):undefined;
  return {mentioned:true,value:n!==undefined&&Number.isInteger(n)&&n>=min&&n<=max?n:undefined};
}
export function bareDriveParty(text: string) {
  const n = numberValue(text);
  return n !== undefined && Number.isInteger(n) && n > 0 && n <= 20 ? n : null;
}
/** A compound count is meaningful only when the caller has verified the active party question. */
export function bareDrivePartyWithLuggage(text: string) {
  const match = text.match(/^(.+?)\s+(?:و|and\s+)\s*(.+?)\s*(?:شنط(?:ه|ات)?|حقائب|حقيبه|bags?|suitcases?)$/u);
  if (!match) return null;
  const party = bareDriveParty(match[1]), luggage = numberValue(match[2]);
  return party !== null && luggage !== undefined && Number.isInteger(luggage) && luggage >= 0 && luggage <= 20
    ? { party, luggage } : null;
}
/** Split separate category or baggage statements without breaking a
 * compound number such as "twenty and two" into an unsafe suffix. */
function quantityClauses(text:string) {
  const units=/(\b(?:adults?|children|child|kids?|luggage|baggage|bags?|suitcases?)\b|(?<![\p{L}])(?:بالغان|بالغين|بالغ|كبار|اطفال|طفلان|طفلين|طفل|اولاد|صغار|امتعه|حقائب|حقيبه|شنط(?:ه|ات)?)(?![\p{L}]))\s+(?:and\s+(?!(?:above|up|more|over)\b)|و(?!\s*(?:اكثر|اقل|فوق)(?![\p{L}]))\s*)/gu;
  return text.replace(units,'$1;').replace(/\s+(?:but|however|rather|instead|لكن|بل)\s+/gu,';').split(/[,،](?!\s*(?:or\b|او(?:\s|$)|and\s+(?:above|up|more|over)\b|و\s*(?:اكثر|اقل|فوق)(?![\p{L}])|at\s+(?:(?:a|the)\s+)?(?:least|most|minimum|maximum)\b|(?:minimum|maximum)\b|علي\s+(?:الاقل|الاكثر)|كحد\s+(?:ادني|اقصي|اعلي)))|[;؛.!?؟\n]/u);
}
/** Last explicit baggage statement, retaining an unquantified requirement.
 * A clear no-baggage statement is zero; uncertainty is never zero. */
function luggageQuantity(text:string) {
  let state:{mentioned:boolean;value:number|undefined}={mentioned:false,value:undefined};
  for (const span of conditionalActionSpans(text)) {
    // A direct polite request is not an uncertain claim. A separate modal or
    // condition still wins, even when the sentence starts as a request.
    const politeRequest=/^\s*(?:(?:please|kindly)\s+)?(?:may\s+(?:i|we)|(?:can|could|would)\s+you)\s+(?:(?:please|possibly|perhaps|kindly)\s+)*(?:request|show|find|display|search|provide|give|see)\b/u.test(span);
    const spanUncertain=turnHasDeferredMarker(span)||(/[?؟]/u.test(span)&&!politeRequest);
    for (const piece of quantityClauses(span)) {
      if (!/\b(?:luggage|baggage|bags?|suitcases?)\b|امتعه|حقائب|حقيبه|حقيبتين|شنط/u.test(piece)) continue;
      const counted=quantity(piece,'bags?|suitcases?|شنط(?:ه|ات)?|حقائب|حقيبه',20,/شنطتين|حقيبتين/g,/الامتعه غير محدده|عدد الحقائب غير محدد|luggage count (?:is )?unknown/g,undefined,0);
      const uncertain=spanUncertain||turnHasDeferredMarker(piece)||(/[?؟]/u.test(piece)&&!politeRequest);
      const none=/\b(?:no|without)\s+(?:any\s+)?(?:luggage|baggage|bags?|suitcases?)\b|\b(?:do not|don't|dont)\s+(?:have|need|want)\s+(?:any\s+)?(?:luggage|baggage|bags?|suitcases?)\b|(?:بدون|بلا|لا\s*(?:توجد|يوجد|اريد|احتاج|احمل)?)\s*(?:امتعه|حقائب|حقيبه|شنط)/u.test(piece);
      // A negative governing action changes the polarity of a dependent
      // "without bags" phrase: inability to travel without baggage is not
      // evidence of zero bags. A later independent assertion is separate.
      const dependent=/\b(?:without|with\s+no)\b|(?<![\p{L}])(?:بدون|بلا)(?![\p{L}])/u.exec(piece);
      const preceding=dependent ? governingActionPrefix(piece.slice(0,dependent.index)) : '';
      const negativeGovernor=Boolean(dependent && negativeGoverningAction(preceding));
      const disputedAbsence=negativeGovernor || /\b(?:do not|don't|dont|never|not)\s+(?:(?:assume|say|claim|infer|confirm)\s+)?no\b|(?:لا\s*(?:تفترض|تقل|تعتبر|تؤكد))\s*[^,،;؛]{0,30}(?:بدون|بلا|لا)/u.test(piece)
        || /\bno\s+(?:luggage|baggage|bags?|suitcases?)\s+(?:(?:is|are)\s+)?(?:not|unacceptable|wrong)\b/u.test(piece);
      state=uncertain || disputedAbsence ? {mentioned:true,value:undefined} : counted.mentioned ? counted : {mentioned:true,value:none?0:undefined};
    }
  }
  return state;
}
/** Keep category mentions distinct from their counts; an unnamed quantity
 * is unknown, while an explicit absence is zero. */
function passengerCategory(text:string,units:string,noun:RegExp,dual:RegExp,none:RegExp) {
  let state:{mentioned:boolean;value:number|undefined}={mentioned:false,value:undefined};
  for (const piece of quantityClauses(text)) {
    if (!noun.test(piece)) continue;
    const counted=quantity(piece,units,20,dual,/$^/g,undefined,0);
    state=counted.mentioned ? counted : {mentioned:true,value:none.test(piece)?0:undefined};
  }
  return state;
}
/** Called after shared normalization, including Arabic digit/letter normalization. */
export function driveQuantities(text: string) {
  text=normalizeNegativeContractions(text);
  const total=quantity(text,'people|persons?|passengers?|اشخاص|شخصا|شخص|ركاب|راكب(?:ا|ين|ان)?|مسافر(?:ين|ان)?',20,/شخصين|لشخصين/g,/العدد غير محدد|عدد الاشخاص غير محدد|لم نحدد العدد|passenger count (?:is )?unknown|number of people (?:is )?undecided/g,'(?:family|party|group) of');
  const adults=passengerCategory(text,'adults?|بالغ(?:ين|ان)?|كبار',/\badults?\b|بالغ|كبار/u,/بالغان/g,/\b(?:no|without)\s+adults?\b|(?:بدون|بلا|لا)\s*(?:بالغ|كبار)/u);
  const children=passengerCategory(text,'children|child|kids?|اطفال|طفل(?:ين|ان|ه)?|اولاد|صغار',/\b(?:children|child|kids?)\b|اطفال|طفل|اولاد|صغار/u,/طفلان|طفلين/g,/\b(?:no|without)\s+(?:any\s+)?(?:children|child|kids?)\b|(?:بدون|بلا|لا)\s*(?:اطفال|طفل|اولاد|صغار)/u);
  let party=total;
  if (!total.mentioned && (adults.mentioned || children.mentioned)) {
    const unknown=adults.mentioned && adults.value===undefined || children.mentioned && children.value===undefined;
    const sum=(adults.value??0)+(children.value??0);
    party={mentioned:true,value:!unknown && sum>0 && sum<=20 ? sum : undefined};
  } else if (total.mentioned && total.value!==undefined) {
    const known=(adults.value??0)+(children.value??0);
    if ((adults.mentioned && adults.value===undefined) || (children.mentioned && children.value===undefined)
        || known>total.value || adults.mentioned && children.mentioned && known!==total.value)
      party={mentioned:true,value:undefined};
  }
  return {
    party,total,adults,children,
    days:quantity(text,'days?|ايام|يوما|يوم',365,/يومين/g,/المده غير محدده|لم نحدد المده|duration (?:is )?unknown|duration (?:is )?undecided/g),
    luggage:luggageQuantity(text),
  };
}
type Budget={kind:'flexible'}|{kind:'amount';amount:string;currency:string|null;basis:'day'|'trip'|null};
type PendingBudget={value:Budget;scope:'drive'|'other'|'unknown';reason:'conditional'|'other-service'|'unbound';sourceTurn:number;serviceKey?:string};
export type DrivePlanningPreferences={city?:string;ambiguous:boolean;dates:string[];party?:string;luggage?:number;durationDays?:number};
type Planning={preferences:DrivePlanningPreferences;driver:'with'|'without'|null;budget:Budget|null;pendingBudgets:readonly PendingBudget[]};
export type DriveDialogue=Planning&({kind:'clarify';question:'trip'|'city'|'dates'|'party'|'driver'|'budget'}|{kind:'ready'});
const currencies:Record<string,string>={دولار:'USD',ريال:'SAR',جنيه:'EGP',يورو:'EUR',درهم:'AED','$':'USD'};
// One daily-basis grammar is shared by the budget fact and the allocation
// following a choice. A time qualifier never selects one of two amounts.
const budgetDayBasisSource=String.raw`(?:\b(?:per\s+day|daily|a\s+day)\b|(?<![\p{L}])(?:يومي(?:ا)?|لليوم|في\s+اليوم|كل\s+يوم)(?![\p{L}\p{N}]))`;
const budgetTripBasisSource=String.raw`(?:total|whole\s+trip|للرحله|اجمالي|لكامل)`;
const budgetDayBasis=new RegExp(budgetDayBasisSource,'u');
const budgetAlternativePeriodSource=String.raw`(?:${budgetDayBasisSource}|(?:per[\s-]+|\/\s*)(?:day|night|week|month|trip)|nightly|weekly|monthly|اسبوعيا|شهريا)`;
// Numeric tokens are consumed whole. An ASCII comma has no locale in this
// contract and can mean grouping or decimal, so it is left unresolved.
function normalizeBudgetDigits(value:string) {
  return value.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
function parseBudgetNumber(raw:string):string|null {
  const value=normalizeBudgetDigits(raw);
  if (value.length>40) return null;
  const canonical=/^\d+(?:\.\d{1,2})?$/u.test(value) ? value
    : /^\d+٫\d{1,2}$/u.test(value) ? value.replace('٫','.')
    : /^\d{1,3}(?:٬\d{3})+(?:٫\d{1,2})?$/u.test(value) ? value.replace(/٬/g,'').replace('٫','.') : null;
  if (!canonical) return null;
  // Only values whose minor units survive the existing Number-based pricing
  // path can be compared without silently rounding the requested cap.
  const [whole,fraction='']=canonical.split('.');
  const cents=BigInt(whole)*BigInt(100)+BigInt((fraction+'00').slice(0,2));
  if (cents<=BigInt(0) || cents>BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const numeric=Number(canonical);
  // The rounded cap alone can look exact while the next minor unit maps to
  // the very same Number.  Only compare when both adjacent cents remain
  // distinct; this is a representability test, not a commercial limit.
  const asNumber=(units:bigint)=>Number((units/BigInt(100)).toString()+'.'+(units%BigInt(100)).toString().padStart(2,'0'));
  return Number.isFinite(numeric) && Math.round(numeric*100)===Number(cents)
    && numeric!==asNumber(cents-BigInt(1)) && numeric!==asNumber(cents+BigInt(1)) ? canonical : null;
}
function sameBudgetAmount(left:string,right:string) {
  const a=parseBudgetNumber(left),b=parseBudgetNumber(right);
  return a!==null && b!==null && Number(a)===Number(b);
}
type BudgetCandidate={index:number;amount:string;currency:string|null;valid:boolean};
function budgetCandidates(input:string):BudgetCandidate[] {
  const text=normalizeBudgetDigits(input);
  const candidate=(index:number,raw:string,currency:string|null,end?:number):BudgetCandidate=>{
    // Consume a trailing run of separated numeric marks before deciding that
    // punctuation is merely a sentence boundary. Do not parse its prefix.
    const tail=end!==undefined
      ? text.slice(end).match(/^\s+[+−.,،٫٬/\-]+(?:\s+[+−.,،٫٬/\-]+)*/u)?.[0] ?? '' : '';
    const whole=raw+tail;
    const ordinary=/^\d+(?:\.\d{1,2})?\s*[.,،]$/u.test(whole) ? whole.replace(/\s*[.,،]$/u,'') : whole;
    const amount=parseBudgetNumber(ordinary);return {index,amount:amount ?? whole,currency,valid:amount!==null};
  };
  // Maximal spans include all separators; the lookbehind prevents restarting
  // at a valid-looking suffix of a malformed or ambiguous number.
  const labelled=[...text.matchAll(/(?:budget|under|below|max(?:imum)?|ميزانيه|الميزانيه|اقل من|حد اقصي)(?:\s+(?:for\s+(?:the\s+)?car|(?:ال)?سياره))?\s*(?:(?:is|to|of)\s*)?(\$)?\s*((?:[+−-]\s*)?(?:[0-9][0-9.,،٫٬/+−-]*|[.,،٫٬/][0-9][0-9.,،٫٬/+−-]*)(?:\s+(?:[+−.,،٫٬/-]\s*)*[0-9][0-9.,،٫٬/+−-]*)*)/gu)]
    .map(m=>candidate(m.index,m[2],m[1]??null,m.index+m[0].length));
  const denominated=[...text.matchAll(/(?<![\p{L}\p{N}.,،٫٬/+−-])((?:[+−-]\s*)?(?:[0-9][0-9.,،٫٬/+−-]*|[.,،٫٬/][0-9][0-9.,،٫٬/+−-]*)(?:\s+(?:[+−.,،٫٬/-]\s*)*[0-9][0-9.,،٫٬/+−-]*)*)\s*(usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)(?![\p{L}])/gu)]
    .map(m=>candidate(m.index,m[1],m[2]));
  const currencyFirst=[...text.matchAll(/(?<![\p{L}\p{N}])(usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)\s+((?:[+−-]\s*)?(?:[0-9][0-9.,،٫٬/+−-]*|[.,،٫٬/][0-9][0-9.,،٫٬/+−-]*)(?:\s+(?:[+−.,،٫٬/-]\s*)*[0-9][0-9.,،٫٬/+−-]*)*)/gu)]
    .map(m=>candidate(m.index,m[2],m[1],m.index+m[0].length));
  return [...labelled,...denominated,...currencyFirst];
}
/** Match one stated amount and its explicit currency as a single fact. */
function candidatesMatchBudget(candidates:readonly BudgetCandidate[],value:Extract<Budget,{kind:'amount'}>) {
  const same=candidates.filter(candidate=>candidate.valid && sameBudgetAmount(candidate.amount,value.amount));
  if (!same.length) return false;
  const explicit=same.filter(candidate=>candidate.currency!==null);
  return !explicit.length || explicit.some(candidate=>candidate.currency!==null
    && (currencies[candidate.currency]??candidate.currency.toUpperCase())===value.currency);
}
/** Identify the target of a negated budget action before treating amounts
 * or their currencies as affirmative choices. Input is normalized USER text. */
function budgetNegativeAction(text:string) {
  const negative=/\b(?:not|no|never|don't|do not|avoid|stop)\b|(?<![\p{L}])(?:لا|ليس|ليست|مو|مش|تجنب)(?![\p{L}])/u.test(text);
  const namesBudget=/\bbudget\b|ميزاني/u.test(text);
  const changesBudget=/\b(?:change|changed|changing|set|make|alter|adjust|replace|convert|modify)\b|تغير|تغيير|تعدل|تعديل|تجعل|اجعل|تحويل|تحول/u.test(text);
  const usesBudget=/\b(?:use|used|using|apply|spend)\b|استخدم|تستخدم|استخدام|يستخدم|استعمل/u.test(text);
  const references=/\b(?:it|this|that)\b|ها(?=$|[^\p{L}])/u.test(text);
  return {negative,namesBudget,changesBudget,usesBudget,references};
}
// Display currency and budget-target interpretation use the same lexical
// normalization before indexing the text. The predicate remains callable.
export const isRejectedBudgetChangeCurrency=Object.assign((text:string,index:number) => {
  const before=text.slice(0,index);
  const boundaries=[...before.matchAll(/[,،;؛\n]|\b(?:but|however)\b|(?<![\p{L}])(?:لكن|بل)(?![\p{L}])|\band\s+(?=(?:show|display|use)\b)/gu)];
  const last=boundaries.at(-1);
  const clause=before.slice(last ? (last.index ?? 0)+last[0].length : 0);
  const action=budgetNegativeAction(clause);
  return action.negative && (action.namesBudget || action.references) && action.changesBudget;
}, {normalizeText:normalizeNegativeContractions});
function budgetIn(text:string, previous:Budget|null, explicitSameBudget=false):Budget|null|undefined {
  if(/ميزانيه غير محدده بعد|الميزانيه غير محدده بعد|لم احدد الميزانيه|budget (?:is )?undecided|have not decided.*budget/.test(text))return null;
  if(/no (?:fixed |set )?budget|no (?:maximum|limit)|flexible budget|budget is flexible|ميزانيه مفتوحه|الميزانيه مفتوحه|لا يوجد سقف|ما عندي سقف|بدون سقف/.test(text))return {kind:'flexible'};
  const isNegated = (index:number) => /(?:\bnot|\bno|(?<!\p{L})(?:ليست|ليس|لا|مش|مو)(?:\s+(?:اريد|ابغي|احتاج))?)\s*(?:(?:budget|ميزانيه|الميزانيه)\s*)?$/u.test(text.slice(Math.max(0,index-48),index));
  const candidates=budgetCandidates(text);
  const selected = candidates.filter(m=>!isNegated(m.index)).sort((a,b)=>a.index-b.index).at(-1);
  if (!selected && candidates.some(m=>isNegated(m.index))) return null;
  if (selected && !selected.valid) return undefined;
  const amount=selected?.amount;
  const currencyToken=selected?.currency ?? (!selected
    ? [...text.matchAll(/\b(?:usd|sar|egp|eur|aed)\b|دولار|ريال|جنيه|يورو|درهم|\$/g)].filter(m=>!isNegated(m.index)).at(-1)?.[0]
    : undefined);
  const currency=currencyToken?(currencies[currencyToken]??currencyToken.toUpperCase()):null;
  const duration = new RegExp('(?<![\\p{L}\\p{N}])(?:لل|لمده\\s+)'+token+'\\s*(?:ايام|يوما|يوم)\\s*(?:كامله|كاملها|كلها)(?!\\p{L})','u').exec(text);
  const wholeDuration = duration && !/(?:not|ليس|مش|مو|لا)\s*$/.test(text.slice(0,duration.index));
  const bases=[...text.matchAll(new RegExp(`${budgetDayBasisSource}|${budgetTripBasisSource}`,'gu'))];
  const basisMatch=bases.filter(m=>!isNegated(m.index)).at(-1)?.[0];
  const basis=basisMatch ? (budgetDayBasis.test(basisMatch)?'day':'trip') : wholeDuration?'trip':null;
  const rejectedPreviousBasis=previous?.kind==='amount'&&bases.some(m=>isNegated(m.index)
    && (budgetDayBasis.test(m[0])?'day':'trip')===previous.basis);
  if(amount&&Number.isFinite(Number(amount))&&Number(amount)>0) {
    // A different amount is a new fact. Missing units are not borrowed from
    // the old amount; matching remains blocked until they are provided.
    const changed=previous?.kind==='amount' && !sameBudgetAmount(previous.amount,amount) && !explicitSameBudget;
    return {kind:'amount',amount,
      currency:currency??(!changed&&previous?.kind==='amount'?previous.currency:null),
      basis:basis??(rejectedPreviousBasis||changed?null:previous?.kind==='amount'?previous.basis:null)};
  }
  // A standalone display-currency mention is not a budget reassignment.
  // A currency-only change applies only when the user identifies the budget.
  const budgetCurrency=/\bbudget\b|ميزاني/u.test(text)?currency:null;
  if(previous?.kind==='amount'&&(budgetCurrency||basis||rejectedPreviousBasis))
    return {...previous,currency:budgetCurrency??previous.currency,basis:basis??(rejectedPreviousBasis?null:previous.basis)};
  return undefined;
}
/** A labelled budget names a service independently of the numeric value.
 * The projection has one car cap; other and overall scopes stay pending. */
function budgetSubjectScope(text:string):'drive'|'other'|'general'|'mixed'|'unspecified' {
  // A possessive names the owner of the budget, including an unfamiliar
  // service. Ownership binds the nearby budget, not another equal amount.
  const possessors=[
    ...[...text.matchAll(/\b([a-z][a-z0-9-]*)['’]s\s+(?:(?:daily|total)\s+)?budget\b/gu)].map(match=>match[1]),
    ...[...text.matchAll(/(?<![\p{L}])([\p{L}]{3,})\s+ميزاني(?:ته|تها)(?![\p{L}])/gu)].map(match=>match[1].replace(/^ال/u,'')),
  ];
  const isDriveOwner=(value:string)=>/^(?:car|vehicle|driver|chauffeur|سياره|سيارات|سائق|سواق)$/u.test(value);
  const drive=possessors.some(isDriveOwner)
    || /\b(?:car|vehicle|driver|chauffeur)\s+budget\b|\bbudget\s+(?:for|of)\s+(?:(?:the|my|a)\s+)?(?:car|vehicle|driver|chauffeur)\b|ميزاني(?:ه|تي)?\s*(?:لل|ل|ال)?(?:سياره|سيارات|سائق|سواق)/u.test(text);
  const other=possessors.some(value=>!isDriveOwner(value))
    || /\b(?:hotel|lodging|accommodation|stay|apartment|villa|flight)\s+budget\b|\bbudget\s+(?:for|of)\s+(?:(?:the|my|a)\s+)?(?:hotel|lodging|accommodation|stay|apartment|villa|flight)\b|ميزاني(?:ه|تي)?\s*(?:لل|ل|ال)?(?:فندق|فنادق|اقامه|شقه|فيلا|طيران)/u.test(text);
  const general=/\b(?:overall|general|total)\s+(?:trip\s+)?budget\b|\bbudget\s+(?:for|of)\s+(?:(?:the|my)\s+)?(?:whole|entire)\s+trip\b|ميزاني(?:ه|تي)?\s*(?:ال)?رحله\s*(?:ال)?عامه/u.test(text);
  if (Number(drive)+Number(other)+Number(general)>1) return 'mixed';
  return drive?'drive':other?'other':general?'general':'unspecified';
}


/** A service-owned budget needs a stable, unambiguous subject before an
 * other-service proposal can be resolved. Unknown or mixed subjects stay open. */
function budgetServiceKey(text:string):string|null {
  const patterns=[
    /\b([a-z][a-z0-9-]*)['’]s\s+(?:(?:daily|total)\s+)?budget\b/gu,
    /\b([a-z][a-z0-9-]*)\s+(?:(?:daily|total)\s+)?budget\b/gu,
    /\bbudget\s+(?:for|of)\s+(?:(?:the|my|a|an)\s+)?([a-z][a-z0-9-]*)\b/gu,
    /(?<![\p{L}])([\p{L}]{3,})\s+ميزاني(?:ته|تها)(?![\p{L}])/gu,
    /(?<![\p{L}])(?:ال)?ميزاني(?:ه|تي)?\s+(?:ل(?:ل)?)?(?:ال)?([\p{L}]+)/gu,
  ];
  const ignored=new Set(['my','the','a','an','this','that','current','previous','old','new','saved','original','overall','general','daily','total','حاليه','سابقه','قديمه','جديده','محفوظه','عامه']);
  const keys=[...new Set(patterns.flatMap(pattern=>[...text.matchAll(pattern)].map(match=>match[1].replace(/^ال/u,'')))
    .filter(key=>key.length>1 && !ignored.has(key)))];
  return keys.length===1?keys[0]:null;
}

/**
 * Reduce USER budget events in order. A proposed value is kept separate from
 * the last confirmed cap whenever its condition or service is unresolved.
 * This bounded reducer is not proof that a user approved an external action.
 */
export function driveBudgetState(userTurns:readonly string[]) {
  const reset=userTurns.findLastIndex(turn=>{const decision=tripTurnDecision(turn);return decision.kind==='new'||decision.refused;});
  const scopedTurns=userTurns.slice(Math.max(0,reset));
  let confirmed:Budget|null=null;
  let pending:PendingBudget[]=[];
  let driveEvidence=false;
  for (const [sourceTurn,originalText] of scopedTurns.entries()) {
    const text=normalizeBudgetDigits(withoutIndependentConditionalActions(normalizeNegativeContractions(originalText)));
    // A bare value needs a current service request from USER text. A
    // preference for no driver, a conditional request or a cancellation is
    // not evidence that a car service is active.
    const serviceCondition=turnHasDeferredIntent(text);
    const cancelled=/\b(?:cancel|stop|forget)\s+(?:it|that|my request|the request|my car|the car)\b|\b(?:do not|don't|no longer)\s+(?:need|want|use)\s+(?:a\s+|the\s+|my\s+)?(?:car|vehicle|transfer)\b|(?:الغ|الغي|اوقف)\s*(?:طلبي|الطلب|السياره)|لا اريد\s+(?:السياره|سياره)/u.test(text);
    const requested=/\b(?:need|want|show|find|search for|looking for|arrange)\s+(?:(?:me|a|an|the|my|some)\s+){0,2}(?:car|cars|vehicle|vehicles|driver|chauffeur|transfer)\b|(?:اريد|ابي|ابغي|احتاج|اعرض|ابحث عن|احجز)\s+(?:ال)?(?:سياره|سيارات|سائق|سواق|توصيل)/u.test(text);
    if (cancelled) driveEvidence=false;
    else if (requested && (!serviceCondition || conditionalActionSpans(text).some(span=>/\b(?:need|want|show|find|arrange)\s+(?:(?:me|a|an|the|my)\s+){0,2}(?:cars?|vehicles?|driver|chauffeur|transfer)\b|(?:اريد|ابي|ابغي|احتاج|اعرض|احجز)\s+(?:ال)?(?:سياره|سيارات|سائق|توصيل)/u.test(span) && !turnHasDeferredMarker(span)))) driveEvidence=true;
    // The shared turn parser has removed only a clearly independent weather
    // directive. Every remaining condition can still qualify a budget.
    const pieces=conditionalActionSpans(originalText).flatMap((span,spanIndex)=>normalizeBudgetDigits(span).split(/[;؛\n]|(?<!\d)[,،](?=\s)|(?<=\d)[,،](?=\s+(?![0-9+−.,،٫٬/-])\S)|\s+(?:but|however|لكن|بل)\s+|\s+and\s+(?=(?:(?:about|around|approximately)\s+\d|(?:the\s+)?[\p{L}]+(?:\s+[\p{L}]+){0,3}\s+(?:is|costs?|has|was)\b|(?:show|find|search|display|set|change|adjust|use)\b))|\s+و(?=(?:اعرض|ابحث|اظهر|اجعل|عدل|استخدم)(?![\p{L}]))/u)
      .map(value=>value.trim()).filter(Boolean).map(piece=>({piece,spanIndex})));
    let changedThisTurn=false;
    let latest:{before:Budget|null;value:Budget;explicit:Budget}|null=null;
    let unresolvedCondition=false,previousSpan=-1;
    for (const {piece,spanIndex} of pieces) {
      if (spanIndex!==previousSpan) {unresolvedCondition=false;latest=null;previousSpan=spanIndex;}
      const condition=turnHasDeferredMarker(piece)
        || /[?؟]/u.test(piece) || /^(?:is|can i|could i|should i|هل)(?:\s|$)/u.test(piece)
        || /\b(?:do not|don't|dont)\s+(?:think|believe|expect|know)\b/u.test(piece);
      const independentCondition=/^(?:and\s+if\b|و\s*اذا(?=$|[^\p{L}\p{N}_]))/u.test(piece);
      const budgetWords=/\b(?:budget|spend|afford|under|below|maximum|max)\b|ميزاني|انفاق|اصرف|انفق|اقل من|حد اقصي/u.test(piece);
      const priceOnly=/\b(?:costs?|priced|quote)\b|سعر|يكلف|تكلف/u.test(piece) && !budgetWords;
      // A trailing condition can qualify the preceding proposal, unless it is
      // clearly introduced as a separate statement about another price.
      if (condition && latest && !independentCondition && (!budgetWords || priceOnly)) {
        confirmed=latest.before;
        pending.push({value:latest.explicit,scope:'drive',reason:'conditional',sourceTurn});
        latest=null;
        unresolvedCondition=true;
        continue;
      }
      if (condition && !independentCondition) unresolvedCondition=true;
      if (priceOnly) continue;
      // A rejection of a pending amount is not a positive assignment and
      // cannot erase a different confirmed cap. Until scope and time are
      // unambiguous the proposal stays pending and matching stays blocked.
      const {negative,namesBudget,changesBudget,usesBudget,references}=budgetNegativeAction(piece);
      const refersPending=pending.some(item=>item.value.kind==='amount'
        && new RegExp('(?<![\\d.])'+item.value.amount.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\d.])').test(piece));
      const namesDrive=/\b(?:car|cars|vehicle|driver|chauffeur)\b|سيار|سائق|سواق/u.test(piece);
      const namesOther=/\b(?:hotel|lodging|accommodation|apartment|villa|flight)\b|فندق|فنادق|اقامه|شقه|فيلا|طيران/u.test(piece);
      const temporary=condition || unresolvedCondition
        || /\b(?:yet|currently|today|tomorrow|during|until|before|after|this\s+\w+|next\s+\w+|for\s+(?:a|an|one|two|three|four|five|six|seven|\d+)\s+(?:hours?|days?|weeks?|months?|years?))\b|حاليا|موقتا|بعد|خلال|حتي|لمده|هذا الاسبوع|هذا الشهر/u.test(piece);
      const token=piece.match(/\b(?:usd|sar|egp|eur|aed)\b|دولار|ريال|جنيه|يورو|درهم/u)?.[0];
      const currency=token?(currencies[token]??token.toUpperCase()):null;
      const basis=budgetDayBasis.test(piece)?'day'
        :/\b(?:total|whole trip)\b|للرحله|اجمالي|لكامل/u.test(piece)?'trip':null;
      const candidates=budgetCandidates(piece);
      // Two explicitly offered budget amounts are proposals, not authority
      // to replace the confirmed cap with whichever appears last. Keep the
      // units actually stated on each amount and resolve only on a later
      // explicit budget correction. Other-service proposals stay separate.
      const choice=/(?<![\p{L}\p{N}.,،٫٬/+−-])([0-9][0-9.,،٫٬]*)\s*(usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)?\s+(?:or|او)\s+(?:(usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)\s+)?([0-9][0-9.,،٫٬]*)\s*(usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)?(?![\p{L}\p{N}])/u.exec(piece);
      const choiceHead=choice ? piece.slice(0,choice.index) : '';
      const choiceTail=choice ? piece.slice(choice.index+choice[0].length) : '';
      // A budget subject may precede OR follow the amounts. Permit a
      // bounded duration and a single allocation preposition before the
      // subject, but do not cross another amount or an independent clause.
      const choiceRemainder=choiceTail.replace(new RegExp(String.raw`^\s*(?:${budgetAlternativePeriodSource}\s*)?`,'u'),'');
      const namesChoiceBudget=/(?:\b(?:budget|spend|afford|under|below|max(?:imum)?)\b|ميزاني|انفاق|اصرف|انفق|اقل من|حد اقصي)[^0-9;؛.!?؟]{0,48}$/u.test(choiceHead)
        || /^(?:(?:is|as|for|towards?)\s+)?(?:(?:my|the|car(?:['’]s)?|vehicle(?:['’]s)?|hotel(?:['’]s)?|lodging|overall|trip)\s+){0,4}budget\b/u.test(choiceRemainder)
        || /^(?:to\s+)?(?:spend|allocate)\b/u.test(choiceRemainder)
        || /^(?:ل|لل|ضمن\s+)?(?:ال)?ميزاني/u.test(choiceRemainder);
      // An allocation can name the service without the word budget, e.g.
      // two monetary alternatives followed by 'for my car'. The target is
      // evidence for the scope, never a choice between the two amounts.
      const trailingAllocation=choice && /^(?:(?:for|on|towards?)\s+(?:(?:my|the|a|an)\s+)?|(?:علي|على|لل|ل)\s*)(?:ال)?([\p{L}][\p{L}'-]*)/u.exec(choiceRemainder);
      const allocatedChoice=Boolean(choice && (choice[2]||choice[3]||choice[5]) && trailingAllocation);
      // A negated wish about two amounts is not a choice of the last amount.
      // Keep it unresolved when it has no named-budget rejection target;
      // named budget/use rejections retain their dedicated handling below.
      const negatedUnboundChoice=negative && allocatedChoice && !namesBudget && !usesBudget;
      if (choice && ((!negative && (budgetWords && namesChoiceBudget || allocatedChoice)) || negatedUnboundChoice)) {
        const subject=budgetSubjectScope(piece);
        const pendingScope:PendingBudget['scope']=subject==='mixed'||subject==='general'||namesDrive&&namesOther?'unknown'
          :subject==='other'||namesOther&&!namesDrive?'other'
          :subject==='drive'||namesDrive?'drive':allocatedChoice?'unknown':driveEvidence?'drive':'unknown';
        const serviceKey=pendingScope==='other'?(budgetServiceKey(piece)??trailingAllocation?.[1]??null):null;
        for (const [raw,unit] of [[choice[1],choice[2]],[choice[4],choice[3]??choice[5]]]) {
          const amount=parseBudgetNumber(raw)??raw;
          const denomination=unit ? currencies[unit]??unit.toUpperCase() : null;
          const value:Budget={kind:'amount',amount,currency:denomination,basis};
          pending.push({value,scope:pendingScope,reason:condition||unresolvedCondition?'conditional':'unbound',sourceTurn,...(serviceKey?{serviceKey}:{})});
        }
        continue;
      }
      const unresolvedNumber=candidates.filter(candidate=>!candidate.valid).sort((a,b)=>a.index-b.index).at(-1);
      if (unresolvedNumber) {
        const subject=budgetSubjectScope(piece);
        const pendingScope:PendingBudget['scope']=subject==='other'?'other':subject==='drive'||namesDrive||driveEvidence?'drive':'unknown';
        const denomination=unresolvedNumber.currency ? currencies[unresolvedNumber.currency]??unresolvedNumber.currency.toUpperCase() : null;
        const value:Budget={kind:'amount',amount:unresolvedNumber.amount,currency:denomination,basis};
        pending.push({value,scope:pendingScope,reason:'unbound',sourceTurn,...(pendingScope==='other'?{serviceKey:budgetServiceKey(piece) ?? undefined}:{})});
        continue;
      }
      const amounts=[...new Set(candidates.filter(candidate=>candidate.valid).map(candidate=>candidate.amount))];
      const matching=pending.filter(item=>{
        const value=item.value;
        return item.scope==='drive' && value.kind==='amount' && amounts.length===1
          && candidatesMatchBudget(candidates,value) && (!basis || value.basis===basis);
      });
      // A negative change of an unnamed referent cannot authorize a new
      // budget. Keep its scope unresolved unless the user names the budget.
      if (negative && changesBudget && references && !namesBudget && candidates.length) {
        const proposal=budgetIn(piece,null);
        if (proposal) pending.push({value:proposal,scope:'unknown',reason:'unbound',sourceTurn});
        continue;
      }
      // Resolve negative budget actions before parsing any positive amount.
      // Negating a change rejects its target; negating use may withdraw the
      // currently confirmed fact, but never a differently scoped pending one.
      const affirmativeFlexible=budgetIn(piece,null)?.kind==='flexible'
        && !/\b(?:do not|don't|never|reject|refuse)\b|(?:لا اريد|لا ابي|ليست|ليس|ارفض)/u.test(piece);
      if (negative && !affirmativeFlexible && (namesBudget || (usesBudget && candidates.length))) {
        const serviceKey=budgetServiceKey(piece);
        const refersKnownOther=Boolean(serviceKey && pending.some(item=>item.scope==='other' && item.serviceKey===serviceKey));
        const otherOnly=!namesDrive && (namesOther || budgetSubjectScope(piece)==='other' || refersKnownOther);
        if (otherOnly) {
          // Equal amounts across services are not the same fact. Resolve only
          // one explicitly identified other-service proposal, and only when
          // the stated currency and time basis match its known units.
          if (!temporary && !changesBudget && serviceKey && amounts.length===1) {
            const matches=pending.filter(item=>item.scope==='other' && item.serviceKey===serviceKey && item.value.kind==='amount'
              && candidatesMatchBudget(candidates,item.value)
              && (!currency || currency===item.value.currency) && (!item.value.currency || currency===item.value.currency)
              && (!basis || basis===item.value.basis) && (!item.value.basis || basis===item.value.basis));
            if (matches.length===1) pending=pending.filter(item=>item!==matches[0]);
          }
          continue;
        }
        if (namesBudget && changesBudget) continue;
        if (temporary) {
          const proposal=confirmed ?? budgetIn(piece,null);
          if (proposal && !pending.some(item=>item.scope==='drive' && item.value.kind==='amount'
              && proposal.kind==='amount' && sameBudgetAmount(item.value.amount,proposal.amount)))
            pending.push({value:proposal,scope:namesDrive||driveEvidence?'drive':'unknown',reason:'conditional',sourceTurn});
          continue;
        }
        if (!namesBudget) {
          if (!refersPending && confirmed) pending.push({value:confirmed,scope:'unknown',reason:'unbound',sourceTurn});
          continue;
        }
        const current=confirmed;
        const refersConfirmed=current?.kind==='amount' && (amounts.length===0
          ? !currency || currency===current.currency
          : amounts.length===1 && candidatesMatchBudget(candidates,current));
        if (refersConfirmed && (!basis || current?.kind==='amount' && current.basis===basis) && matching.length===0) {
          confirmed=null;
        } else if (namesDrive && matching.length===1 && !refersConfirmed) {
          pending=pending.filter(item=>item!==matching[0]);
        } else if (refersConfirmed && matching.length>0 && confirmed) {
          pending.push({value:confirmed,scope:'drive',reason:'unbound',sourceTurn});
        }
        continue;
      }
      // A labelled correction of the current, fully confirmed cap retains its
      // known units. Another amount/service or an unresolved proposal does not.
      const sameCap=pending.length===0 && /^(?:(?:(?:the|my|our)\s+)?budget(?:\s+is)?|(?:ال)?ميزاني(?:ه|تي))\s*[:=]?\s*[0-9][0-9.,٫٬]*$/u.test(piece);
      const change=budgetIn(piece,confirmed,sameCap);
      if (change===undefined) continue;
      // Parse evidence without a previous budget so a proposed amount cannot
      // inherit a currency or duration which the user did not specify.
      const explicit=budgetIn(piece,null) ?? change;
      const relation=piece.match(/\b(?:on|for)\s+(?:(?:a|an|the|my)\s+)?([a-z][a-z-]*)/u)
        ?? piece.match(/(?:على|لل)\s*([\p{L}]+)/u);
      const related=relation?.[1] ?? '';
      const isDrive=/^(?:car|cars|vehicle|vehicles|driver|chauffeur|سياره|سيارات|سيارتي|سائق|سواق)$/u.test(related);
      const isDuration=numbers[related] !== undefined || /^(?:day|days|week|weeks|month|months|trip|journey|whole|entire|يوم|ايام|اسبوع|شهر|رحله)$/u.test(related);
      const subject=budgetSubjectScope(piece);
      const otherService=subject==='other' || subject==='unspecified' && Boolean(related && !isDrive && !isDuration);
      const explicitlyDrive=subject==='drive' || subject==='unspecified' && /\b(?:car|cars|vehicle|driver|chauffeur)\b|سيار|سائق|سواق/u.test(piece);
      const ambiguousSubject=subject==='general'||subject==='mixed';
      const unbound=Boolean(ambiguousSubject || changedThisTurn && /\d/.test(piece) && change?.kind==='amount' && !budgetWords && !explicitlyDrive);
      const scope:PendingBudget['scope']=otherService?'other':unbound?'unknown':explicitlyDrive||driveEvidence?'drive':'unknown';
      const pendingReason=condition||unresolvedCondition?'conditional':otherService?'other-service':unbound||scope==='unknown'||cancelled?'unbound':null;
      if (pendingReason && change) {
        const resolvedScope=unbound?'unknown':scope;
        const serviceKey=resolvedScope==='other'?budgetServiceKey(piece):null;
        pending.push({value:explicit ?? change,scope:resolvedScope,reason:pendingReason,sourceTurn,...(serviceKey?{serviceKey}:{})});
        if (condition) unresolvedCondition=true;
        continue;
      }
      const before:Budget|null=confirmed;
      confirmed=change;
      if (budgetWords && explicitlyDrive) pending=pending.filter(item=>item.scope!=='drive');
      changedThisTurn=change !== null;
      latest=change?{before,value:change,explicit:explicit ?? change}:null;
    }
  }
  return {confirmed,pending};
}
/** Bounded USER facts only. Assistant assertions are never interpreted as preferences. */
export function driveDialogue(userTurns:readonly string[],preferences:DrivePlanningPreferences):DriveDialogue|null {
  const reset=userTurns.findLastIndex(t=>{const decision=tripTurnDecision(t);return decision.kind==='new'||decision.refused;});
  const turns=userTurns.slice(Math.max(0,reset));
  const decisions=turns.map(tripTurnDecision);
  const lastTripDecision=decisions.filter(decision=>decision.mentioned).at(-1);
  // User text may clarify intent, but cannot prove that a retained anchor
  // was revalidated. Until the authenticated caller resolves the boundary,
  // the protected budget stays known while matching remains blocked.
  // A clear later continuation can advance this local dialogue to its next
  // question; the separately protected trip scope still requires revalidation
  // before any saved anchor is projected or a match is delivered.
  let contestedTrip=false,contestedUseObjection=false;
  for (const [index,decision] of decisions.entries()) {
    if (decision.contested) {
      contestedTrip=true;
      // An objection to use, even conditional, cannot be discharged by a
      // textual continuation before the protected anchor is revalidated.
      if (/\b(?:do not|don't|dont|never|without|not|reject|refuse|discard|ignore)\b|(?<![\p{L}])(?:لا|لن|بدون|ممنوع|محظور|ارفض|نرفض|تجاهل|تجنب)(?![\p{L}])/u.test(turns[index])) contestedUseObjection=true;
    }
    else if (contestedTrip && !contestedUseObjection && decision.mentioned && decision.kind==='continue' && !decision.refused
      && (/^(?:please\s+)?(?:continue(?:\s+with)?|keep|stay\s+(?:on|with)|resume)\s+(?:(?:the|my|our)\s+)?(?:same|current|this|saved|existing)\s+(?:trip|journey)[.!?؟]*$/u.test(turns[index].trim())
        || /^(?:استمر|ابق|واصل|استانف)\s*(?:في\s+|علي\s+)?(?:نفس|هذه|الرحله\s+الحاليه|الرحله\s+المحفوظه)\s*(?:الرحله)?[.!?؟]*$/u.test(turns[index].trim()))) contestedTrip=false;
  }
  const tripUncertain=contestedTrip || lastTripDecision?.kind==='uncertain';
  if(!turns.some(t=>/\b(?:need|want|looking for|family|people|passengers|recommend|suggest|clarify|driver|chauffeur)\b|سائق|سواق|\b(?:without (?:a )?driver|no driver|self[- ]drive)\b|ask me|for\s+\w+\s+days|عائله|اسره|اشخاص|ركاب|ابغي|اريد|احتاج|بدون سائق|بدون سواق|لمده|اسالني|استوضح|المعلومات الناقصه/.test(t)))return null;
  let driver:Planning['driver']=null;
  const {confirmed:budget,pending:pendingBudgets}=driveBudgetState(turns);
  for(const originalText of turns){
    let driverContestedThisTurn=false;
    for(const text of conditionalActionSpans(originalText)) {
      let danglingCondition=false;
      for(const clause of text.split(/(?<=[;؛\n])|(?<=[.!?؟])\s+/u)) {
        const driverMatches=[...clause.matchAll(/without (?:using\s+)?(?:a )?driver|self[- ]drive|no driver|(?:do not|don't|dont|never|no longer)\s+(?:want(?:\s+to\s+use)?|need(?:\s+to\s+use)?|use)\s+(?:a\s+|the\s+)?(?:driver|chauffeur)|لا\s*(?:(?:اريد|احتاج)\s+)?(?:استخدام|استعمال|اريد|احتاج|استخدم|تستخدم)\s*(?:ال)?(?:سائق|سواق)|بدون سائق|بدون سواق|with (?:a )?driver|مع سائق|بسائق|مع سواق/g)];
        const match=driverMatches.at(-1);
        const unknown=lastIndex(clause,/لم احدد السائق|لم احسم السائق|driver preference (?:is )?undecided|undecided about (?:a )?driver/g);
        const negated=match && /(?:\bnot|\bno longer|ليس|مش|مو|لا اريد)\s*$/.test(clause.slice(0,match.index));
        const budgetObject=match && /^\s*(?:budget|allowance|limit|cap)\b/u.test(clause.slice((match.index ?? 0)+match[0].length));
        const marker=turnHasDeferredMarker(clause);
        const conditional=marker||danglingCondition;
        const isWithout=(value:string)=>/without|self|no driver|do not|don't|dont|never|no longer|لا\s*(?:اريد|احتاج|استخدم|تستخدم)|بدون/u.test(value);
        // Shared nouns and local Arabic pronouns still offer two opposed
        // driver choices; neither is a preference until explicitly selected.
        const abbreviatedAlternative=/\bwith\s+(?:or|\/)\s+without\s+(?:a\s+)?(?:driver|chauffeur)\b|\bwith\s+(?:a\s+)?(?:driver|chauffeur)\s*(?:or|\/)\s+without\s+(?:one|him|her)\b|(?:بسائق|بسواق|مع\s+(?:سائق|سواق))\s*(?:او|\/)\s*بدون(?:ه|ها)(?![\p{L}])/u.test(clause);
        const alternatives=abbreviatedAlternative || driverMatches.some((first,index)=>driverMatches.slice(index+1).some(second=>
          isWithout(first[0])!==isWithout(second[0])
          && /\bor\b|(?<![\p{L}])او(?![\p{L}])|\//u.test(clause.slice((first.index??0)+first[0].length,second.index))));
        if (alternatives && !budgetObject) {
          driver=null;
          if (conditional) driverContestedThisTurn=true;
          if (marker) danglingCondition=true;
          continue;
        }
        // A second clause in the same turn cannot silently settle a
        // conditional driver preference. A later user turn may clarify it.
        if(match && !budgetObject && conditional)driverContestedThisTurn=true;
        if(unknown>=0&&unknown>(match?.index??-1)||!budgetObject&&(negated||match&&driverContestedThisTurn))driver=null;
        else if(match&&!budgetObject)driver=isWithout(match[0])?'without':'with';
        if(marker)danglingCondition=true;
      }
    }
  }
  const state={preferences,driver,budget,pendingBudgets};
  const question=tripUncertain?'trip':preferences.ambiguous||!preferences.city?'city'
    :preferences.dates.length!==2||preferences.dates[0]>preferences.dates[1]?'dates'
    :!preferences.party?'party':!driver?'driver'
    :pendingBudgets.length||!budget||budget.kind==='amount'&&(!budget.currency||!budget.basis)?'budget':null;
  return question?{...state,kind:'clarify',question}:{...state,kind:'ready'};
}
export function driveDialogueCopy(state:DriveDialogue,locale:Locale,excludedCurrencies:readonly string[]=[]){
  const ar=locale==='ar',p=state.preferences;
  const cities:Record<string,string>={cairo:'القاهرة',giza:'الجيزة',alexandria:'الإسكندرية',riyadh:'الرياض',jeddah:'جدة',dubai:'دبي'};
  const facts:string[]=[];
  if(p.city)facts.push(ar?cities[p.city]??p.city:p.city);
  if(p.party)facts.push(ar?p.party+' أشخاص':p.party+' passengers');
  if(p.luggage !== undefined)facts.push(ar?p.luggage+' قطع أمتعة':p.luggage+' bags');
  if(p.durationDays)facts.push(ar?p.durationDays+' أيام':p.durationDays+' days');
  if(p.dates.length)facts.push(p.dates.join(ar?' إلى ':' to '));
  if(state.driver)facts.push(ar?state.driver==='with'?'مع سائق':'بدون سائق':state.driver==='with'?'with a driver':'without a driver');
  if(state.budget?.kind==='flexible')facts.push(ar?'ميزانية مفتوحة':'a flexible budget');
  else if(state.budget?.kind==='amount' && (!state.budget.currency || !excludedCurrencies.includes(state.budget.currency)))facts.push(state.budget.amount+(state.budget.currency?' '+state.budget.currency:''));
  const summary=facts.length?(ar?'فهمت طلبك: ':'Your trip so far: ')+facts.join(ar?'، ':', ')+'.'
    :ar?'نرتّب احتياجك أولًا حتى أقدر أوجّهك لخيار مناسب.':'Let’s establish what you need before looking at options.';
  if(state.kind==='ready')return {summary,question:null};
  const questions={
    trip:ar?'هل نتابع الرحلة الحالية أم نبدأ رحلة جديدة؟':'Should we continue the current trip or start a new trip?',
    city:ar?p.ambiguous?'ما مدينة استخدام السيارة؟ حدّدها بشكل منفصل عن مدينة المغادرة.':'في أي مدينة تحتاج السيارة؟':p.ambiguous?'Which city will you use the car in, separately from your departure city?':'Which city do you need the car in?',
    dates:ar?p.durationDays?'ما تاريخا بدء الاستخدام وانتهائه لهذه المدة؟':'ما تاريخا بدء استخدام السيارة وانتهائه، وكم مدة الاستخدام؟':p.durationDays?'What are the pickup and return dates for those days?':'What are the pickup and return dates, and how long will you need the car?',
    party:ar?'كم عدد الأشخاص الذين سيستخدمون السيارة؟':'How many passengers will use the car?',
    driver:ar?'تفضّل السيارة مع سائق أم بدون سائق؟ الكتالوج الحالي بسائق؛ وأي طلب بدونه يحتاج تأكيد العمليات.':'Would you prefer a driver or no driver? The current catalogue is chauffeured; a self-drive request needs Operations confirmation.',
    budget:state.pendingBudgets.length
      ? (ar?'هل تؤكد الميزانية المقترحة، ولأي خدمة وبأي عملة ومدة؟':'Please confirm the proposed budget, its service, currency and time basis.')
      : state.budget?.kind==='amount'
      ? !state.budget.currency && !state.budget.basis ? (ar?'هذه الميزانية بأي عملة، وهل هي لليوم أم للرحلة كاملة؟':'Which currency is that budget in, and is it per day or for the whole trip?')
        : !state.budget.currency ? (ar?'بأي عملة هذه الميزانية؟':'Which currency is that budget in?')
        : (ar?'هل هذه الميزانية لليوم أم للرحلة كاملة؟':'Is that budget per day or for the whole trip?')
      : (ar?'ما ميزانيتك لليوم وبأي عملة؟ وإذا ما عندك سقف محدد، قل لي.':'What is your daily budget and currency? You can also say there is no fixed budget.'),
  };
  return {summary,question:questions[state.question]};
}
