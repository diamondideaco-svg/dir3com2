/** Public, request-local planning facts. No identity, persistence or provider execution. */
type Locale = 'ar' | 'en';
const numbers: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
  صفر:0, واحد:1, واحده:1, اثنان:2, اثنين:2, اثنتان:2, اثنتين:2, ثلاثه:3, ثلاث:3, اربعه:4, اربع:4,
  خمسه:5, خمس:5, سته:6, ست:6, سبعه:7, سبع:7, ثمانيه:8, ثماني:8, ثمان:8, تسعه:9, تسع:9, عشره:10, عشر:10,
  'احد عشر':11, 'اثنا عشر':12, 'اثني عشر':12, 'ثلاثه عشر':13, 'اربعه عشر':14, 'خمسه عشر':15,
  'سته عشر':16, 'سبعه عشر':17, 'ثمانيه عشر':18, 'تسعه عشر':19, عشرون:20, عشرين:20,
};
const token = '(?:\\d{1,3}|' + Object.keys(numbers).sort((a,b)=>b.length-a.length).join('|').replace(/ /g,'\\s+') + ')';
function lastIndex(text: string, expression: RegExp) { return [...text.matchAll(expression)].at(-1)?.index ?? -1; }
function quantity(text: string, units: string, max: number, dual: RegExp, reset: RegExp, prefix?: string) {
  const expressions=[new RegExp('(?<![\\p{L}\\p{N}])('+token+')\\s*(?:'+units+')(?!\\p{L})','gu')];
  if(prefix) expressions.push(new RegExp('(?:'+prefix+')\\s+('+token+')(?!\\p{L})(?!\\s+(?:hundred|thousand))','gu'));
  const match=expressions.flatMap(p=>[...text.matchAll(p)]).sort((a,b)=>a.index-b.index).at(-1);
  const resetAt=lastIndex(text,reset), dualAt=lastIndex(text,dual);
  const index=Math.max(match?.index??-1,dualAt);
  if(resetAt>=0&&resetAt>index)return {mentioned:true,value:undefined};
  if(index<0)return {mentioned:false,value:undefined};
  const n=dualAt>=(match?.index??-1)?2:match?(/^\d+$/.test(match[1])?Number(match[1]):numbers[match[1].replace(/\s+/g,' ')]):undefined;
  return {mentioned:true,value:n!==undefined&&n>0&&n<=max?n:undefined};
}
export function bareDriveParty(text: string) {
  const n = /^\d{1,2}$/.test(text) ? Number(text) : numbers[text];
  return n !== undefined && n > 0 && n <= 20 ? n : null;
}
/** Called after shared normalization, including Arabic digit/letter normalization. */
export function driveQuantities(text: string) {
  return {
    party:quantity(text,'people|persons?|passengers?|adults?|اشخاص|شخصا|شخص|ركاب|مسافر(?:ين|ان)?|بالغ(?:ين|ان)?',20,/شخصين|لشخصين|بالغين/g,/العدد غير محدد|عدد الاشخاص غير محدد|لم نحدد العدد|passenger count (?:is )?unknown|number of people (?:is )?undecided/g,'(?:family|party|group) of'),
    days:quantity(text,'days?|ايام|يوما|يوم',365,/يومين/g,/المده غير محدده|لم نحدد المده|duration (?:is )?unknown|duration (?:is )?undecided/g),
  };
}
type Budget={kind:'flexible'}|{kind:'amount';amount:string;currency:string|null;basis:'day'|'trip'|null};
export type DrivePlanningPreferences={city?:string;ambiguous:boolean;dates:string[];party?:string;durationDays?:number};
type Planning={preferences:DrivePlanningPreferences;driver:'with'|'without'|null;budget:Budget|null};
export type DriveDialogue=Planning&({kind:'clarify';question:'city'|'dates'|'party'|'driver'|'budget'}|{kind:'ready'});
const currencies:Record<string,string>={دولار:'USD',ريال:'SAR',جنيه:'EGP',يورو:'EUR',درهم:'AED','$':'USD'};
function budgetIn(text:string, previous:Budget|null):Budget|null|undefined {
  if(/ميزانيه غير محدده بعد|الميزانيه غير محدده بعد|لم احدد الميزانيه|budget (?:is )?undecided|have not decided.*budget/.test(text))return null;
  if(/no (?:fixed |set )?budget|no (?:maximum|limit)|flexible budget|budget is flexible|ميزانيه مفتوحه|الميزانيه مفتوحه|لا يوجد سقف|ما عندي سقف|بدون سقف/.test(text))return {kind:'flexible'};
  const amount=text.match(/(?:budget|under|below|max(?:imum)?|ميزانيه|الميزانيه|اقل من|حد اقصي)\s*(?:is\s*)?[$]?\s*(\d+(?:\.\d{1,2})?)/)?.[1]
    ??text.match(/(?<![\d.])(\d+(?:\.\d{1,2})?)\s*(?:usd|sar|egp|eur|aed|دولار|ريال|جنيه|يورو|درهم)/)?.[1];
  const currencyToken=text.match(/\b(?:usd|sar|egp|eur|aed)\b|دولار|ريال|جنيه|يورو|درهم|\$/)?.[0];
  const currency=currencyToken?(currencies[currencyToken]??currencyToken.toUpperCase()):null;
  const basis=/per day|daily|a day|يومي|لليوم|في اليوم/.test(text)?'day':/total|whole trip|للرحله|اجمالي|لكامل/.test(text)?'trip':null;
  if(amount&&Number.isFinite(Number(amount))&&Number(amount)>0)return {kind:'amount',amount,currency,basis};
  if(previous?.kind==='amount'&&(currency||basis))return {...previous,currency:currency??previous.currency,basis:basis??previous.basis};
  return undefined;
}
/** Bounded USER facts only. Assistant assertions are never interpreted as preferences. */
export function driveDialogue(userTurns:readonly string[],preferences:DrivePlanningPreferences):DriveDialogue|null {
  const reset=userTurns.findLastIndex(t=>/new trip|start over|رحله جديده|ابدا من جديد/.test(t));
  const turns=userTurns.slice(Math.max(0,reset));
  if(!turns.some(t=>/\b(?:need|want|looking for|family|people|passengers|recommend|suggest|clarify)\b|ask me|for\s+\w+\s+days|عائله|اسره|اشخاص|ركاب|ابغي|اريد|احتاج|لمده|اسالني|استوضح|المعلومات الناقصه/.test(t)))return null;
  let driver:Planning['driver']=null,budget:Budget|null=null;
  for(const text of turns){
    const match=[...text.matchAll(/without (?:a )?driver|self[- ]drive|no driver|بدون سائق|بدون سواق|with (?:a )?driver|مع سائق|بسائق|مع سواق/g)].at(-1);
    const unknown=lastIndex(text,/لم احدد السائق|لم احسم السائق|driver preference (?:is )?undecided|undecided about (?:a )?driver/g);
    if(unknown>=0&&unknown>(match?.index??-1))driver=null;
    else if(match)driver=/without|self|no driver|بدون/.test(match[0])?'without':'with';
    const change=budgetIn(text,budget);if(change!==undefined)budget=change;
  }
  const state={preferences,driver,budget};
  const question=preferences.ambiguous||!preferences.city?'city'
    :preferences.dates.length!==2||preferences.dates[0]>preferences.dates[1]?'dates'
    :!preferences.party?'party':!driver?'driver'
    :!budget||budget.kind==='amount'&&(!budget.currency||!budget.basis)?'budget':null;
  return question?{...state,kind:'clarify',question}:{...state,kind:'ready'};
}
export function driveDialogueCopy(state:DriveDialogue,locale:Locale){
  const ar=locale==='ar',p=state.preferences;
  const cities:Record<string,string>={cairo:'القاهرة',giza:'الجيزة',alexandria:'الإسكندرية',riyadh:'الرياض',jeddah:'جدة',dubai:'دبي'};
  const facts:string[]=[];
  if(p.city)facts.push(ar?cities[p.city]??p.city:p.city);
  if(p.party)facts.push(ar?p.party+' أشخاص':p.party+' passengers');
  if(p.durationDays)facts.push(ar?p.durationDays+' أيام':p.durationDays+' days');
  if(p.dates.length)facts.push(p.dates.join(ar?' إلى ':' to '));
  if(state.driver)facts.push(ar?state.driver==='with'?'مع سائق':'بدون سائق':state.driver==='with'?'with a driver':'without a driver');
  if(state.budget?.kind==='flexible')facts.push(ar?'ميزانية مفتوحة':'a flexible budget');
  else if(state.budget?.kind==='amount')facts.push(state.budget.amount+(state.budget.currency?' '+state.budget.currency:''));
  const summary=facts.length?(ar?'فهمت طلبك: ':'Your trip so far: ')+facts.join(ar?'، ':', ')+'.'
    :ar?'نرتّب احتياجك أولًا حتى أقدر أوجّهك لخيار مناسب.':'Let’s establish what you need before looking at options.';
  if(state.kind==='ready')return {summary,question:null};
  const questions={
    city:ar?p.ambiguous?'ما مدينة استخدام السيارة؟ حدّدها بشكل منفصل عن مدينة المغادرة.':'في أي مدينة تحتاج السيارة؟':p.ambiguous?'Which city will you use the car in, separately from your departure city?':'Which city do you need the car in?',
    dates:ar?p.durationDays?'ما تاريخا بدء الاستخدام وانتهائه لهذه المدة؟':'ما تاريخا بدء استخدام السيارة وانتهائه، وكم مدة الاستخدام؟':p.durationDays?'What are the pickup and return dates for those days?':'What are the pickup and return dates, and how long will you need the car?',
    party:ar?'كم عدد الأشخاص الذين سيستخدمون السيارة؟':'How many passengers will use the car?',
    driver:ar?'تفضّل السيارة مع سائق أم بدون سائق؟ الكتالوج الحالي بسائق؛ وأي طلب بدونه يحتاج تأكيد العمليات.':'Would you prefer a driver or no driver? The current catalogue is chauffeured; a self-drive request needs Operations confirmation.',
    budget:ar?state.budget?.kind==='amount'?'هذه الميزانية بأي عملة، وهل هي لليوم أم للرحلة كاملة؟':'ما ميزانيتك لليوم وبأي عملة؟ وإذا ما عندك سقف محدد، قل لي.':state.budget?.kind==='amount'?'Which currency is that budget in, and is it per day or for the whole trip?':'What is your daily budget and currency? You can also say there is no fixed budget.',
  };
  return {summary,question:questions[state.question]};
}
