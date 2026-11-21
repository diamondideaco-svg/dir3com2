/** Bounded handling of a complete conditional directive on an unrelated
 * topic. A dangling condition, or one mentioning the request, service,
 * price, currency or a number, remains in scope. */
/** Normalize only whole-word, unambiguous English negative contractions for
 * interpretation. Original USER text and unrelated names are not rewritten. */
export function normalizeNegativeContractions(value) {
  const forms={"aren't":"are not","isn't":"is not","wasn't":"was not","weren't":"were not",
    "don't":"do not","doesn't":"does not","didn't":"did not","haven't":"have not","hasn't":"has not","hadn't":"had not",
    "shouldn't":"should not","mustn't":"must not","couldn't":"could not","wouldn't":"would not","won't":"will not","can't":"can not"};
  return value.replace(/\b(?:aren|isn|wasn|weren|don|doesn|didn|haven|hasn|hadn|shouldn|mustn|couldn|wouldn|won|can)['’]t\b/giu,
    match=>forms[match.toLowerCase().replace('’',"'")] ?? match).replace(/\bcannot\b/giu,'can not');
}
function normalizeTurn(value) {
  return normalizeNegativeContractions(value.toLowerCase().normalize('NFKC')).replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
}
/** A possible proposition or an ongoing decision is not an instruction.
 * Shared by trip, service, budget, party and luggage consumers. Direct
 * polite requests (such as "could you show") do not match modal facts. */
function possibleOrUndecided(text) {
  // An English modal followed by a predicate is a possible proposition,
  // regardless of which action follows. A modal addressed to "you", "I"
  // or "we" is left to the direct-question classifier, not promoted here.
  const modal=/\b(?:may|might|could)\b(?!\s+(?:you|i|we|in|for|from|until|to|during|last|next|the|is|was)\b)(?=\s*[,،]?\s*[a-z])/u.test(text);
  const possible=modal || /\b(?:possibly|potentially|perhaps|maybe)\b|\b(?:it(?:'s| is)|that(?:'s| is))\s+possible\b|\bpossible\s+that\b|(?<![\p{L}])قد\s+(?:لا\s+)?[\p{L}]+/u.test(text);
  const choosing=/\b(?:think(?:ing)?|decid(?:e|ing)|consider(?:ing)?|wonder(?:ing)?|debat(?:e|ing)|deliberat(?:e|ing)|weigh(?:ing)?)\b[^.!?؟;؛]{0,80}\b(?:whether|if)\b|\b(?:do not|don't|dont|does not|doesn't|did not|didn't)\s+know\s+(?:whether|if)\b|\b(?:thinking|considering|contemplating|pondering)\s+(?:(?:of|about)\s+)?(?:using|keeping|continuing|resuming|reopening)\b|(?<![\p{L}])(?:افكر|نفكر|اتساءل|نتساءل|ادرس|ندرس)[^.!?؟;؛]{0,80}(?:هل|اذا|ام)(?![\p{L}])|(?<![\p{L}])(?:افكر|نفكر|ادرس|ندرس)\s+(?:(?:في\s+|ب\s*))?(?:استئناف(?:ها)?|استاناف(?:ها)?|استكمال(?:ها)?|اكمال(?:ها)?|متابع(?:ه|تها)|المتابعه|استخدام|استعمال|الاستمرار|استمرار|المواصله|مواصله|الابقاء|ابقاء)(?![\p{L}])/u.test(text);
  return possible||choosing;
}
function rawDeferredIntent(text) {
  // A hedge inside a directly addressed request is politeness, not a
  // proposition that the requested action or fact may be true.
  const intent=text.replace(/\b((?:can|could|would|may)\s+(?:you|i|we))\s+(?:possibly|perhaps)\s+(?=[a-z])/gu,'$1 ');
  return possibleOrUndecided(intent) || /\b(?:if|unless|when|once|until|before|after|provided|perhaps|maybe|might|unsure|uncertain|undecided|hesitant|hesitate|hesitating|doubt|wonder)\b|\bmay\s+(?:not\s+)?(?:have|be|need|carry|bring|take|use|include|contain)\b|\b(?:(?:still|currently)\s+(?:deciding|considering|debating|deliberating|weighing)|(?:deciding|considering|debating|deliberating)\s+(?:whether|if))\b|(?<![\p{L}])(?:ما\s+زلت|لا\s+ازال|ما\s+زلنا|لا\s+زلنا)\s+(?:(?:ا|ن)?(?:قرر|فكر|حسم))[\p{L}]*|(?<![\p{L}])و?ان\s+(?:وافقت|وافق|قبلت|قبلنا|وافقنا|اذنت|اذنا)(?![\p{L}])|\bnot\s+sure\b|\b(?:(?:haven't|hasn't|havent|hasnt)|(?:have|has)\s+not)\s+(?:yet\s+)?decided\b|\b(?:pending|awaiting|subject\s+to|upon|on)\s+(?:(?:my|our|your|the)\s+)?(?:approval|confirmation|permission|consent|acceptance|authorization|authorisation)\b|\b(?:on|under)\s+(?:the\s+)?condition\b|\b(?:approval|confirmation|permission|consent|acceptance|authorization|authorisation)\s+(?:pending|awaited|unconfirmed)\b|(?<![\p{L}])و?(?:اذا|لو|عندما|حين|حتي|قبل|بعد|بشرط|ربما|لعل|اتساءل|متردد)(?![\p{L}])|(?<![\p{L}])متردد[\p{L}]*|(?<![\p{L}])(?:لم|ما)\s*(?:احسم|حسمت|احسمت|اقرر|قررت)(?![\p{L}])|(?<![\p{L}])(?:لست|غير)\s+متاكد[\p{L}]*|(?<![\p{L}])و?(?:عند|بانتظار|انتظار|رهن|لحين|في\s+حال(?:ه)?)\s*(?:ال)?(?:موافق|اذن|تاكيد|قبول|تصريح)[\p{L}]*/u.test(intent);
}
function refersToRequest(text) {
  return /\d|\b(?:budget|spend|afford|price|cost|rate|cars?|vehicles?|drivers?|chauffeur|hotels?|lodging|trips?|journey|adults?|children|child|passengers?|luggage|baggage|bags?|suitcases?|currency|consent|approv(?:e|es|ed|al)|agree(?:s|d)?|accept(?:s|ed|ance)?|permission|authorization|authorisation|eur|usd|sar|aed|egp)\b|ميزاني|انفاق|سعر|يكلف|تكلف|سيار|سائق|سواق|فندق|رحله|رحلتي|بالغ|اطفال|طفل|ركاب|امتعه|حقائب|حقيبه|شنط|عمله|موافق|اوافق|وافقت|اقبل|قبلت|قبول|اذن|تاكيد/u.test(text);
}
function independentDirective(text) {
  return /\b(?:bring|pack|carry|wear|take|fetch)\s+(?:(?:an?|the|my|your|some)\s+)?[a-z]|(?<![\p{L}])(?:احضر|خذ|ارتد|احمل)\s+[\p{L}]+/u.test(text);
}
function weatherCondition(text) {
  return /\b(?:rain|rains|rained|raining|snow|snows|snowing|storm|storms|weather)\b|(?<![\p{L}])(?:امطرت|تمطر|المطر|ثلج|الثلج|الجو)(?![\p{L}])/u.test(text);
}
export function conditionalActionSpans(value) {
  // A comma, semicolon or coordinated action cannot by itself close a
  // condition. A separate sentence may be removed only if no later action
  // in its connected span could be governed by that condition.
  const sentences=value.split(/(?<=[.!?؟\n])(?=\s+(?!(?:[+−.,،٫٬/-]\s*)*[0-9٠-٩۰-۹])\S|$)/u),groups=[];
  for (const sentence of sentences) {
    const malformedNumberTail=groups.length && /[0-9٠-٩۰-۹][+−.,،٫٬/\-]*(?:\s+[+−.,،٫٬/\-]+)+\s*$/u.test(groups[groups.length-1]);
    const numericMarkContinuation=groups.length && /[0-9٠-٩۰-۹][+−.,،٫٬/\-]*[+−.,،٫٬/\-]\s*$/u.test(groups[groups.length-1]) && /^\s*[+−.,،٫٬/\-]/u.test(sentence);
    if (groups.length && (malformedNumberTail || numericMarkContinuation || /^\s*(?:and\b|و(?=\s|[\p{L}]))/u.test(normalizeTurn(sentence)))) groups[groups.length-1]+=sentence;
    else groups.push(sentence);
  }
  return groups.map(group=>{
    const parts=group.split(/(?<=[;؛])(?=\s|$)/u);
    return parts.filter((part,index)=>{
      const text=normalizeTurn(part);
      const weatherOnly=rawDeferredIntent(text) && weatherCondition(text)
        && independentDirective(text) && !refersToRequest(text);
      const laterRequest=parts.slice(index+1).some(value=>refersToRequest(normalizeTurn(value)));
      return !(weatherOnly && !laterRequest);
    }).join('');
  }).filter(group=>group.trim());
}
export function withoutIndependentConditionalActions(value) {
  return conditionalActionSpans(value).join('');
}
/** A condition or uncertainty is not an executed USER instruction.
 * Used by trip, request-boundary, service and driver decisions. */
export function turnHasDeferredIntent(value) {
  return rawDeferredIntent(normalizeTurn(withoutIndependentConditionalActions(value)));
}
// For clauses obtained by splitting an already scoped turn.  Running the
// independent-sentence filter again on a fragment would lose its condition.
export function turnHasDeferredMarker(value) {
  return rawDeferredIntent(normalizeTurn(value));
}
/** A single action/object classification for uncertain use or continuation.
 * Named trips and pronouns share the same verbs; a named service as direct
 * object is not silently promoted into a trip reference. */
function tripActionTargets(clause) {
  const action=clause.match(/\b(?:use|using|used|keep|keeping|kept|continue|continuing|retain|retaining|resume|resuming|resumed|reopen|reopening|reopened|go back to|going back to|return to|returning to)\s+(?:(?:with|using)\s+)?(?:(?:(?:my|our|the|this|same|saved|current|existing|previous)\s+){0,3}(trip|journey)|(it|that|them))\b/u);
  const passive=clause.match(/\b(trip|journey|it|that)\s+(?:(?:should|can|could|may|might|will)\s+)?(?:be\s+)?(?:used|kept|continued|retained|resumed|reopened)\b/u);
  const arabicTrip=/(?:استخدام|استعمال|استخدم|تستخدم|الاستمرار|استمرار|استمر|الابقاء|ابقاء|ابق|المواصله|مواصله|واصل|اواصل|استانف|استئناف|استاناف|استكمال|اكمال|متابعه|المتابعه)\s*(?:(?:في|علي|مع|ب)\s*)?(?:(?:هذه|نفس|تلك)\s*)?(?:رحلتي|الرحله)(?![\p{L}])/u.test(clause);
  const arabicPronoun=/(?:استخدامها|استعمالها|استخدمها|تستخدمها)(?![\p{L}])|(?:الاستمرار|استمرار|استمر|الابقاء|ابقاء|ابق|المواصله|مواصله|واصل|اواصل)\s*(?:فيها|عليها|معها|بها)(?![\p{L}])|(?:ابقائها|ابقيها|استمرارها|مواصلتها|(?:ا)?واصلها|استانفها|استئنافها|استانافها|استكمالها|اكمالها|متابعتها|بشانها|حولها)(?![\p{L}])/u.test(clause);
  return {explicit:Boolean(action?.[1] || passive && /^(?:trip|journey)$/u.test(passive[1]) || arabicTrip),
    pronoun:Boolean(action?.[2] || passive && /^(?:it|that)$/u.test(passive[1]) || arabicPronoun || /\b(?:undecided|unsure|uncertain|hesitant)\s+(?:about|regarding)\s+(?:it|that|them)\b/u.test(clause))};
}
/** A bounded decision about the trip scope of one USER turn.
 * It does not grant access to a saved trip or prove ownership/consent.
 * @param {string} message
 * @returns {{kind:'continue'|'new'|'uncertain',mentioned:boolean,refused:boolean,contested:boolean}}
 */
export function tripTurnDecision(message) {
  // Interpret each connected span as a whole. A clearly independent
  // sentence starts a new condition scope, but does not erase prior facts
  // or the resolved referent of a pronoun.
  const clauses=conditionalActionSpans(message).flatMap((span,spanIndex)=>{
    const segments=normalizeTurn(span).replace(/\s+(?:but|however|لكن|بل)\s+/gu,';')
      // A new conditional action introduced by a coordinator cannot reach
      // backwards to condition an already complete continuation. An earlier
      // condition in this connected span still carries forward.
      .replace(/\s+and\s+(?=(?:if|unless|when|once|provided)\b)/gu,';')
      .replace(/\s+و(?=(?:اذا|لو|عندما|حين|بشرط)(?:\s|$))/gu,';')
      .replace(/\s+and\s+(?=(?:do not|don't|dont|never|not|no)\b)/gu,';')
      .replace(/\s+و(?=(?:لا|لن|ليس|ليست|لم)(?:\s|$))/gu,';')
      .split(/(?<=[;؛.!?؟\n])/u);
    return segments.flatMap(segment=>(segment.match(/[^,،;؛.!?؟\n]+[?؟]?/gu) ?? []).map(raw=>({raw,segment,spanIndex})));
  });
  let kind='continue', mentioned=false, conditional=false, conditionalProposalComplete=false, refused=false, contested=false;
  let lastReferent='none', previousSpan=-1;
  for (const {raw,segment,spanIndex} of clauses) {
    if (spanIndex!==previousSpan) {conditional=false;conditionalProposalComplete=false;previousSpan=spanIndex;}
    const clause=raw.trim();
    const condition=turnHasDeferredMarker(segment);
    if (condition) conditional=true;
    const newTrip=/\b(?:new|another|different)\s+(?:trip|journey)\b|\bstart\s+(?:over|again)\b|(?<![\p{L}])(?:لل|ال)?رحله\s+(?:ال)?(?:جديده|اخري)|ابدا من جديد/u.test(clause);
    let currentTrip=/\b(?:(?:the|my|our)\s+)?(?:same|this|current|existing|saved|previous)\s+(?:trip|journey)\b|\b(?:the|my|our)\s+(?:trip|journey)\b|(?<![\p{L}])الرحله(?![\p{L}])|(?:نفس|هذه|هذي|الحاليه)\s*ال?رحله|(?:الرحله|رحلتي)\s+(?:الحاليه|نفسها|المحفوظه|السابقه)|(?<![\p{L}])رحلتي(?![\p{L}])/u.test(clause);
    // Keep a bounded same-turn referent across conjunctions: a pronoun can
    // reject the trip, a separately mentioned service, or remain ambiguous.
    const service=/\b(?:hotels?|lodging|accommodation|cars?|drivers?)\b|(?<![\p{L}])(?:الفندق|فندق|الاقامه|اقامه|السياره|سياره|السائق|سائق)(?![\p{L}])/u.test(clause);
    const passiveRefusal=/\b(?:trip|journey|it|that)\s+(?:should|must|can|may|will|is|was)\s+(?:not|never)\s+(?:(?:to\s+)?be\s+)?(?:used|reused|referenced|accessed|kept|retained|continued|resumed|reopened)\b|\b(?:do not|don't|dont|can not|never)\s+want\s+(?:(?:(?:my|our|the)\s+)?(?:trip|journey)|it|that)\s+(?:to\s+be\s+)?(?:used|reused|referenced|accessed|kept|retained|continued|resumed|reopened)\b/u.test(clause);
    const passivePronoun=passiveRefusal && /\b(?:it|that)\b/u.test(clause);
    const negativePronoun=passivePronoun || /\b(?:do not|don't|dont|can not|never)\s+(?:(?:want)\s+to\s+)?(?:use|keep|continue|retain|resume|reopen|go back to|return to)\s+(?:it|that|them)\b|\b(?:do not|don't|dont)\s+want\s+(?:it|that|them)\s+(?:used|retained|resumed|reopened)\b|(?:^|[^\p{L}])لا\s*(?:(?:اريد|ابي)\s*)?(?:استخدمها|تستخدمها|استعمالها|استخدامها|تستعملها|استئنافها|استانافها|استانفها|تستانفها)/u.test(clause);
    const uncertainTargets=tripActionTargets(clause);
    const uncertainPronoun=(condition || conditional) && uncertainTargets.pronoun;
    const referencePronoun=negativePronoun || uncertainPronoun;
    if (!newTrip && !currentTrip && referencePronoun && lastReferent==='trip') currentTrip=true;
    else if (!newTrip && !currentTrip && referencePronoun && lastReferent==='ambiguous') {
      mentioned=true;kind='uncertain';contested=true;continue;
    }
    if (!newTrip && !currentTrip) { if (service) lastReferent='service'; continue; }
    lastReferent=service ? 'ambiguous' : 'trip';
    mentioned=true;
    const directRequest=/\b(?:can|could|would)\s+you\b|هل\s*يمكنك/u.test(clause);
    const advisory=/\b(?:should i|can i|could i|would you recommend|would you advise|do you recommend)\b|هل\s*(?:ابدا|ابدأ|استطيع|يمكنني|تنصح|افضل)/u.test(clause);
    const questioning=advisory || (/[?؟]/u.test(raw) && !directRequest);
    // A rejection verb must govern the trip itself, not an unrelated service.
    const rejectionMatch=/\b(?:reject|refuse|discard|ignore)\s+(?:(?:the|my|our)\s+)?(?:(?:saved|previous|current|same|this)\s+)?(?:trip|journey)\b|(?<![\p{L}])(?:ارفض|نرفض|تجاهل|تجنب)\s+(?:(?:هذه|نفس)\s+)?(?:الرحله|رحلتي)(?![\p{L}])/u.exec(clause);
    const negatedRejection=rejectionMatch && /(?:\b(?:do not|don't|dont|never|not)|(?<![\p{L}])لا)\s*$/u.test(clause.slice(0,rejectionMatch.index));
    const directRejection=Boolean(rejectionMatch && !negatedRejection);
    const prohibitedUse=/(?<![\p{L}])لا\s*(?:تسمح|اسمح|تجيز|تاذن)\s*ب?(?:استخدام|استعمال)\s*(?:رحلتي|الرحله)(?![\p{L}])|(?<![\p{L}])(?:ممنوع|محظور|يحظر)\s+(?:استخدام|استعمال)\s*(?:رحلتي|الرحله)(?![\p{L}])/u.test(clause);
    const negativeAction=directRejection || negativePronoun || passiveRefusal || prohibitedUse || /\bwithout\s+(?:using|use)\b|(?<![\p{L}])بدون\s+(?:استخدام|استعمال)(?![\p{L}])|\b(?:do not|don't|dont|can not|never|not|avoid)\s+(?:(?:want\s+(?:(?:you|them)\s+)?to|let\s+(?:you|them)|allow\s+(?:you|them)\s+to)\s+)?(?:keep|continue|retain|use|resume|reopen|go back to|return to)\b|\b(?:not|no)\s+(?:the\s+)?(?:same|this|current|saved)\s+(?:trip|journey)\b|(?:^|[^\p{L}])لا\s*(?:(?:اريدك|اريد|ابي)\s+(?:ان\s+)?)?(?:استمر|استمرار|استخدام|استعمال|استخدم|تستخدم|ابق|واصل|استئناف|استاناف|استانف|تستانف)|(?:^|[^\p{L}])(?:لا\s*(?:اريد|ابي)|ليست|ليس|مو|مش)\s+(?:نفس|هذه|الرحله|رحلتي)/u.test(clause);
    // Resolve a direct object before treating a negative action as a rejection
    // of the trip. A service "for the same trip" is a separate object;
    // unresolved pronouns remain conservative.
    const object=clause.match(/\b(?:do not|don't|dont|can not|never)\s+(?:(?:want\s+(?:(?:you|them)\s+)?to|let\s+(?:you|them)|allow\s+(?:you|them)\s+to)\s+)?(?:use|keep|continue|retain|resume|reopen|go back to|return to)\s+(?:(?:a|an|the|my|our)\s+)?([a-z][a-z-]*)\b/u)
      ?? clause.match(/(?:^|[^\p{L}])لا\s*(?:(?:اريدك|اريد|ابي)\s+(?:ان\s+)?)?(?:استخدام|استعمال|استخدم|تستخدم|استئناف|استاناف|استانف|تستانف)\s+([\p{L}]+)/u)
      ?? clause.match(/\bwithout\s+(?:using|use)\s+(?:(?:a|an|the|my|our)\s+)?([a-z][a-z-]*)\b/u)
      ?? clause.match(/(?<![\p{L}])بدون\s+(?:استخدام|استعمال)\s+([\p{L}]+)/u);
    const target=object?.[1]?.replace(/^ال/u,'') ?? '';
    const tripOrPronoun=/^(?:same|this|current|existing|saved|previous|trip|journey|it|that|them|رحله|رحلتي|نفس|هذه|هذي|ها)$/u.test(target);
    const tripRelation=/\b(?:for|in|on)\s+(?:(?:(?:the|my|our)\s+)?(?:same|this|current|saved)\s+|(?:my|our|the)\s+)(?:trip|journey)\b|(?:في|ل)\s*(?:نفس|هذه|الرحله|رحلتي)/u.test(clause);
    const serviceNegative=/\b(?:do not|don't|dont|never|no longer)\s+(?:want|need)\s+(?:(?:a|an|the|my)\s+)?(?:car|vehicle|driver|hotel|lodging|accommodation)\b|(?<![\p{L}])لا\s*(?:اريد|احتاج)\s*(?:ال)?(?:سياره|سائق|فندق|اقامه)(?![\p{L}])/u.test(clause);
    const explicitTripUseRejection=passiveRefusal || prohibitedUse || /\bwithout\s+(?:using|use)\s+(?:(?:my|our|the)\s+)?(?:trip|journey)\b|(?<![\p{L}])بدون\s+(?:استخدام|استعمال)\s*(?:رحلتي|الرحله)(?![\p{L}])|\b(?:do not|don't|dont|can not|never)\s+(?:(?:want\s+(?:(?:you|them)\s+)?to|let\s+(?:you|them)|allow\s+(?:you|them)\s+to)\s+)?(?:use|keep|continue|retain|resume|reopen|go back to|return to)\s+(?:(?:my|our|the)\s+)?(?:trip|journey)\b|(?<![\p{L}])لا\s*(?:(?:اريدك|اريد)\s+(?:ان\s+)?)?(?:استخدام|استعمال|استخدم|تستخدم|استئناف|استاناف|استانف|تستانف)\s*(?:رحلتي|الرحله)(?![\p{L}])/u.test(clause);
    const serviceTarget=/^(?:hotel|hotels|lodging|accommodation|car|cars|vehicle|vehicles|driver|drivers|فندق|فنادق|اقامه|سياره|سيارات|سائق)$/u.test(target);
    const separateObject=Boolean(!explicitTripUseRejection && (serviceTarget || tripRelation && (serviceNegative || target && !tripOrPronoun)));
    const negatesKeep=negativeAction && !separateObject;
    // A completed conditional proposal and a later explicit absolute refusal
    // are distinct events. A dangling condition remains in force; punctuation
    // or a discourse marker alone never cancels it.
    const absoluteRefusal=currentTrip && negatesKeep && !condition && !questioning
      && (/\bnever\s+(?:(?:ever)\s+)?use\b/u.test(clause)
          && /\b(?:under (?:any|no) circumstances|in any circumstances)\b/u.test(clause)
        || /لا\s*تستخدم/u.test(clause) && /(?:ابدا|مطلقا)/u.test(clause)
          && /تحت\s+اي\s+ظرف/u.test(clause)
        || directRejection && /\b(?:completely|entirely|permanently|outright)\b|(?:نهائيا|تماما|كليا)/u.test(clause));
    if (conditional && conditionalProposalComplete && absoluteRefusal) {
      kind='uncertain'; refused=true; continue;
    }
    // A later negative action aimed at the same trip can still be within the
    // condition. Block the disputed anchor rather than promote the condition
    // to an instruction or let an uncertain refusal leak its contents.
    if (conditional && currentTrip && negatesKeep) {
      kind='uncertain'; contested=true; continue;
    }
    if (conditional || questioning) {
      // A user expressing doubt about using this anchor contests its use;
      // neither the doubtful turn nor a generic later search authorizes it.
      // A service mentioned for the trip is a different direct object.
      const disputedTripUse=currentTrip && !separateObject && (uncertainPronoun || uncertainTargets.explicit);
      if (disputedTripUse) contested=true;
      if (conditional && (newTrip || currentTrip) && !questioning) conditionalProposalComplete=true;
      kind='uncertain'; continue;
    }
    const negatesNew=/\b(?:do not|don't|dont|can not|never|not|avoid)\s+(?:(?:want|plan)\s+to\s+)?(?:start|begin|create|open|plan)\b|\b(?:do not|don't|dont)\s+want\s+(?:a\s+)?(?:new|another|different)\s+(?:trip|journey)\b|(?:^|[^\p{L}])لا\s*(?:(?:اريد|ابي)\s+(?:ان\s+)?)?(?:تبدا|ابدا|انشا|تبدأ|بدء)|(?:^|[^\p{L}])(?:ليست|ليس|مو|مش)\s+(?:رحله|الرحله)\s+(?:جديده|الجديده)/u.test(clause);
    const newAction=/\b(?:start|begin|create|open|plan|want)\b|ابدا|تبدا|بدء|انشا|انشاء/u.test(clause)
      || /^(?:new trip|another trip|رحله جديده|الرحله الجديده)(?=$|[\s,،;؛.!:])/u.test(clause);
    const keepAction=/\b(?:keep|continue|retain|stay|use|remain|resume|reopen|go back to|return to)\b|ابق|استمر|واصل|استكمل|استانف|استخدم|نفس الرحله/u.test(clause)
      || /^(?:plan my trip|خطط رحلتي)$/u.test(clause);
    if (newTrip && negatesNew) kind='continue';
    else if (newTrip && newAction) kind='new';
    else if (currentTrip && negatesKeep) { kind='uncertain'; refused=true; }
    else if (currentTrip && separateObject) { kind='continue'; refused=false; }
    else if (currentTrip && (keepAction || /^(?:the\s+)?(?:same|this|current)\s+(?:trip|journey)$/u.test(clause))) { kind='continue'; refused=false; }
    else kind='uncertain';
  }
  return {kind,mentioned,refused,contested};
}
