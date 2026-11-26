import { cityRoles as rawCityRoles } from './trip-routing';
import { validSearchDate } from '../marketplace/search-context';
import { cairoInstant } from '../drive/search';
import { turnHasDeferredMarker } from './trip-turn-decision.mjs';

type Fact = {kind:'absent'} | {kind:'unknown'} | {kind:'value';value:string};
type Endpoint = {location:Fact;date:Fact;time:Fact};
type DateTime = {date:string;time:string};
export type DriveHandoff = {pickup:Endpoint;dropoff:Endpoint;mode?:'chauffeur'|'airport';pendingDateTime?:DateTime};
const empty = ():Endpoint => ({location:{kind:'absent'},date:{kind:'absent'},time:{kind:'absent'}});
const digits = (text:string) => text.normalize('NFKC').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const rolePattern = /\bpick(?:[ -]?up)\b|\bdrop(?:[ -]?off)\b|\breturn(?:\s+the\s+car)?\b|(?<![\p{L}])(?:لل|ال|ل)?(?:استلام|تسليم)(?![\p{L}])/giu;
function endpointClauses(input:string) {
 const text=digits(input);
 return [...text.matchAll(rolePattern)].map(match=>{
  const start=match.index+match[0].length,tail=text.slice(start);
  const stop=tail.search(/[,،;؛.!?؟\n]|\b(?:and|but|however)\s+(?:i|we|you|they|he|she)\b|\b(?:and|but|however)\s+(?:(?:the|my|our)\s+)?(?:car|vehicle|driver|hotel|airport\s+transfer)\s+(?:is|are|was|were)\b|\b(?:and|but|however)\s+(?:(?:i|we)\s+)?(?:need|want|book|reserve|request|do\s+not|don['’]?t|never|no|not|refuse|reject|decline|avoid|without)\b|\b(?:do\s+not|don['’]?t|no\s+longer)\s+(?:want|need|use|take|choose|book|request)\b|(?:و[اأإ]حتاج|و[اأإ]ريد|ولا|ولن|ولم|وليس|وليست|وبدون|وارفض|ونرفض|لكن|بل)(?![\p{L}])|(?<![\p{L}])(?:لا|لن|لم)\s*(?:[أا]ريد|[أا]حتاج|[أا]ستخدم|نريد|نحتاج|تستخدم)(?![\p{L}])/iu);
  const body=tail.slice(0,stop<0?200:Math.min(stop,200));
  const location=/^\s*(?:(?:location|address)\s*)?(?:is\s+)?(?:at|from|to|من|في|الي|إلى)\s+(.+?)(?=\s+(?:on|يوم|بتاريخ)\s+\d{4}-\d{2}-\d{2}|\s+(?:at|الساع[ةه])\s+\d{1,2}:\d{2}|$)/iu.exec(body);
  const place=location?.[1]?.trim();
  // Financial/service clauses are never swallowed as endpoint addresses.
  const safePlace=place && place.length<=200 && !/[\u0000-\u001f\u007f]|\bbudget\b|ميزاني|\b(?:rooms?|nights?|book|reserve)\b|غرف|ليال/iu.test(place) ? place : undefined;
  const at=safePlace ? start+(location!.index+location![0].lastIndexOf(location![1])) : -1;
  const kind=/drop|return|تسليم/iu.test(match[0])?'dropoff' as const:'pickup' as const;
  const prefix=text.slice(Math.max(0,match.index-70),match.index);
  const uncertain=turnHasDeferredMarker(text) || /\b(?:not|never|do not|don't|dont)\s*$|(?:لا|ليس|ليست|بدون)\s*$/iu.test(prefix)
    || /\b(?:or|unknown|undecided)\b|(?:او|أو|غير محدد|غير معروف|لم احدد|لم أحدد)/iu.test(body);
  return {kind,body,place:safePlace,at,uncertain,clauseStart:match.index,clauseEnd:start+body.length};
 });
}
/** Mask only syntactically named USER endpoint addresses for service classification.
 * The original USER text still governs route uncertainty and customer facts. */
export function withoutDriveEndpointPlaces(input:string) {
 let text=digits(input);
 for(const item of endpointClauses(input).filter(item=>item.at>=0&&item.place).sort((a,b)=>b.at-a.at)) {
  // Keep every action/refusal word. Only ambiguous service nouns in the
  // address prefix are masked, even if an unfamiliar clause escaped its boundary.
  const prefix=item.place!.split(/\b(?:and|or|but|however)\b|(?<![\p{L}])(?:لكن|بل)(?![\p{L}])/iu)[0];
  const masked=prefix.replace(/\b(?:hotels?|airports?|resorts?|lodging|accommodation)\b|(?<![\p{L}])(?:ال)?(?:فندق|فنادق|مطار|مطارات|منتجع|منتجعات|اقامه)(?![\p{L}])/giu,word=>' '.repeat(word.length));
  text=text.slice(0,item.at)+masked+text.slice(item.at+prefix.length);
  // An attached Arabic conjunction marks the same independent clause boundary.
  if(/^(?:و[اأإ]حتاج|و[اأإ]ريد|ولا|ولن|ولم|وليس|وليست|وبدون|وارفض|ونرفض)(?![\p{L}])/u.test(text.slice(item.clauseEnd)))
   text=text.slice(0,item.clauseEnd)+';'+text.slice(item.clauseEnd+1);
 }
 return text;
}
/** Airport as an endpoint or rejected transfer is not an airport service request. */
export function airportDriveService(input:string) {
 const text=withoutDriveEndpointPlaces(input).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه')
  .replace(/\b(?:not|no|never|without|do\s+not|does\s+not|did\s+not|will\s+not|can\s+not|cannot|can['’]?t|won['’]?t|don['’]?t|no\s+longer|refuse(?:\s+to)?|reject|decline(?:\s+to)?)\s+(?:(?:want|need|use|take|choose|request|book)\s+)?(?:(?:an?|the|my|our)\s+)?airport\s+(?:transfer|pickup|reception)\b/gu,' ')
  .replace(/(?:لا|لن|لم|ليس|ليست|بدون|ارفض|نرفض)\s*(?:(?:اريد|احتاج|استخدم|نريد|نحتاج)\s*)?(?:توصيله?|انتقال|استقبال)\s*(?:ال)?مطار/gu,' ');
 return !turnHasDeferredMarker(text) && /\bairport\b|(?<![\p{L}])(?:ال)?مطار(?![\p{L}])/u.test(text);
}
function affirmativeChauffeur(input:string) {
 const text=withoutDriveEndpointPlaces(input).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
 if(turnHasDeferredMarker(text))return false;
 for(const match of text.matchAll(/\b(?:car|vehicle)\s+with\s+(?:a\s+)?driver\b|\bchauffeur(?:ed)?\s+(?:car|service)\b|(?<![\p{L}])سياره\s*(?:مع\s+(?:ال)?سائق|بسائق)(?![\p{L}])/gu)) {
  const before=text.slice(0,match.index).split(/[;؛.!?؟\n]/u).at(-1)??'';
  const suffix=text.slice(match.index+match[0].length);
  if(/\b(?:do not|don't|dont|never|no longer|not|no|without)\s+(?:(?:want|need|use|take|choose|request)\s+)?(?:(?:a|the|my|our)\s+)?$|(?:لا|لن|لم|ليس|ليست|بدون)\s*(?:(?:اريد|احتاج|استخدم|نريد)\s*)?(?:ال)?$/u.test(before))continue;
  if(/^\s*(?:budget|allowance|cap|limit)\b|^\s*(?:ميزاني|سقف)/u.test(suffix))continue;
  return true;
 }
 return false;
}
/** A complete bare USER date/time is a proposal until its endpoint is unambiguous. */
function bareDateTime(input:string):DateTime|null {
 if(turnHasDeferredMarker(input))return null;
 const match=/^\s*(?:(?:on|يوم|بتاريخ)\s+)?(\d{4}-\d{2}-\d{2})(?:\s+(?:at|الساع[ةه])\s+|T)(\d{1,2}:\d{2})(?:\s+(?:Cairo\s+time|بتوقيت\s+القاهرة|Africa\/Cairo))?\s*[.!]?\s*$/iu.exec(digits(input));
 if(!match)return null;const date=match[1],time=match[2].padStart(5,'0');
 return validSearchDate(date)&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)&&cairoInstant(date+'T'+time)!==null?{date,time}:null;
}
/** Confirmation comes from the next USER turn, never from assistant prose. */
function dateTimeEndpoint(input:string):'pickup'|'dropoff'|null {
 const text=input.trim().normalize('NFKC').replace(/[.!]$/u,'');
 if(/^(?:(?:I\s+mean|the)\s+)?(?:pick[ -]?up|return|drop[ -]?off)$/iu.test(text))return /return|drop/iu.test(text)?'dropoff':'pickup';
 if(/^(?:(?:أقصد|اقصد|قصدي)\s+)?(?:موعد\s+)?(?:الاستلام|التسليم)$/u.test(text))return /التسليم/u.test(text)?'dropoff':'pickup';
 return null;
}
function setDateTime(endpoint:Endpoint,value:DateTime){endpoint.date={kind:'value',value:value.date};endpoint.time={kind:'value',value:value.time};}
/** Only the caller's scoped USER turns may supply these editable requirements. */
export function driveHandoffForUsers(turns:readonly string[]):DriveHandoff {
 const state:DriveHandoff={pickup:empty(),dropoff:empty()};
 for(const turn of turns) {
  // Candidates survive only to an immediate explicit USER endpoint confirmation.
  const previousCandidate=state.pendingDateTime;delete state.pendingDateTime;
  const confirmedEndpoint=dateTimeEndpoint(turn);
  if(previousCandidate&&confirmedEndpoint)setDateTime(state[confirmedEndpoint],previousCandidate);
  const serviceTurn=digits(turn).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
  if(!turnHasDeferredMarker(serviceTurn)) {
   if(airportDriveService(turn))state.mode='airport';
   else if(affirmativeChauffeur(turn))state.mode='chauffeur';
  }
  const candidate=bareDateTime(turn);
  if(candidate&&state.mode==='chauffeur') {
   const pickupMissing=state.pickup.date.kind!=='value'||state.pickup.time.kind!=='value';
   const returnMissing=state.dropoff.date.kind!=='value'||state.dropoff.time.kind!=='value';
   if(pickupMissing!==returnMissing)setDateTime(pickupMissing?state.pickup:state.dropoff,candidate);
   else state.pendingDateTime=candidate;
  }
  for(const item of endpointClauses(turn)) {
  const target=state[item.kind];
  if(item.place) target.location=item.uncertain?{kind:'unknown'}:{kind:'value',value:item.place};
  const date=item.body.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const time=item.body.match(/(?:\bat\s+|الساع[ةه]\s+|^\s*)(\d{1,2}:\d{2})(?!\d)/iu)?.[1];
  if(date) target.date=!item.uncertain&&validSearchDate(date)?{kind:'value',value:date}:{kind:'unknown'};
  if(time) {
   const value=time.padStart(5,'0');
   target.time=!item.uncertain&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?{kind:'value',value}:{kind:'unknown'};
  }
  if(/\b(?:unknown|undecided)\b|غير محدد|غير معروف|لم احدد|لم أحدد/iu.test(item.body)) {
   if(/\btime\b|وقت|الساع/iu.test(item.body))target.time={kind:'unknown'};
   else target.location={kind:'unknown'};
  }
  }
 }
 return state;
}
/** Only an immediate USER confirmation of its own pending date/time is a contextual reply. */
export function isDriveDateTimeContinuation(turns:readonly string[]) {
 const current=turns.at(-1);return Boolean(current&&dateTimeEndpoint(current)&&driveHandoffForUsers(turns.slice(0,-1)).pendingDateTime);
}
export function applyDriveHandoff(params:URLSearchParams,state:DriveHandoff,withholdPickup=false,withholdDropoff=false) {
 for(const [kind,at,dateKey,withheld] of [['pickup','pickupAt','pickupDate',withholdPickup],['dropoff','returnAt','returnDate',withholdDropoff]] as const) {
  const endpoint=state[kind];
  if(!withheld&&endpoint.location.kind==='value')params.set(kind,endpoint.location.value);
  else if(endpoint.location.kind==='unknown') {
   params.delete(kind);if(kind==='pickup')params.delete('destination');
  }
  if(endpoint.date.kind==='unknown'||endpoint.time.kind==='unknown'){params.delete(at);params.delete(dateKey);continue;}
  const date=endpoint.date.kind==='value'?endpoint.date.value:(params.get(at)??params.get(dateKey)??'').slice(0,10);
  if(endpoint.time.kind==='value'&&date) {
   const value=date+'T'+endpoint.time.value;params.delete(dateKey);
   if(cairoInstant(value)!==null)params.set(at,value);else params.delete(at);
  } else if(endpoint.date.kind==='value') {params.delete(at);params.set(dateKey,date);}
 }
 // An unbound correction must not become an action-ready date through a generic URL.
 if(state.pendingDateTime)for(const key of ['pickupAt','returnAt','pickupDate','returnDate'])params.delete(key);
 // Unspecified browsing keeps the established URL/default contract. Only
 // affirmative USER service evidence supplies an explicit mode query.
 if(state.mode)params.set('mode',state.mode);else params.delete('mode');
}

/** Give the existing city-route guard only cities explicitly written in endpoint addresses.
 * Unknown, conditional and competing endpoints retain the original guarded text. */
export function driveEndpointRouteText(input:string) {
 const parts=endpointClauses(input);
 if(!parts.length || parts.some(part=>part.uncertain||!part.place))return input;
 const pickup=parts.filter(part=>part.kind==='pickup'),dropoff=parts.filter(part=>part.kind==='dropoff');
 if(pickup.length>1||dropoff.length>1)return input;
 const cities=parts.map(part=>rawCityRoles(part.place!));
 if(cities.some(city=>!city.city||city.ambiguous||city.unknownOrigin||city.unknownDestination))return input;
 const from=pickup[0]?rawCityRoles(pickup[0].place!).city:undefined;
 const to=dropoff[0]?rawCityRoles(dropoff[0].place!).city:undefined;
 let text=digits(input);
 const first=parts[0];
 for(const part of [...parts].sort((a,b)=>b.clauseStart-a.clauseStart)) {
  const replacement=part===first ? from&&to ? `from ${from} to ${to}` : `in ${from??to}` : '';
  text=text.slice(0,part.clauseStart)+replacement+text.slice(part.clauseEnd);
 }
 if(dropoff.length===1)text=text.replace(/[,،;؛]?\s*(?:وهو|وهذا|هذا)\s+موقع\s+مختلف(?=\s*[.!?؟]|$)/u,'');
 return text;
}
