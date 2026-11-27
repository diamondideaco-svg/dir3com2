import { turnHasDeferredIntent } from './trip-turn-decision.mjs';

const relativeDay = /\b(?:the\s+)?day\s+after\s+tomorrow\b|(?<![\p{L}])بعد\s*(?:بكر[ةه]|بكرا|غد(?:ا|ًا)?)(?![\p{L}])/giu;
const months = [
 ['january','يناير'],['february','فبراير'],['march','مارس'],['april','ابريل','أبريل'],['may','مايو'],['june','يونيو'],
 ['july','يوليو'],['august','اغسطس','أغسطس'],['september','سبتمبر'],['october','اكتوبر','أكتوبر'],['november','نوفمبر'],['december','ديسمبر'],
];
const weekdays = ['sunday|الأحد|الاحد','monday|الاثنين|الإثنين','tuesday|الثلاثاء','wednesday|الأربعاء|الاربعاء','thursday|الخميس','friday|الجمعة|الجمعه','saturday|السبت'];
const digits = value => value.normalize('NFKC').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
/** A preference value only: never identity, confirmation, version or authority. */
export function validDriveCalendarDay(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const instant=Date.parse(value+'T12:00:00Z');
 return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===value;
}
export function cairoCalendarDay(now) {
 if(!Number.isFinite(now))return null;
 try {return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}catch{return null;}
}
function afterTomorrow(now) {
 const local=cairoCalendarDay(now);if(!local||!validDriveCalendarDay(local))return null;
 return new Date(Date.parse(local+'T12:00:00Z')+2*86400000).toISOString().slice(0,10);
}
function explicitDatesAndClock(value) {
 let text=digits(value);
 const named=new RegExp('(?:(?:on|يوم|بتاريخ)\\s+)?(?:('+weekdays.join('|')+')\\s+)?(\\d{1,2})\\s+('+months.flat().join('|')+')\\s+(\\d{4})(?!\\d)','giu');
 text=text.replace(named,(whole,weekday,day,month,year,offset)=>{
  // Do not consume the suffix of an established date-range expression.
  if(/\d\s*(?:to|through|until|الي|إلى|حتي|حتى|[-–])\s*$/iu.test(text.slice(Math.max(0,offset-25),offset)))return whole;
  const index=months.findIndex(names=>names.some(name=>name.toLowerCase()===month.toLowerCase()));
  const date=year+'-'+String(index+1).padStart(2,'0')+'-'+day.padStart(2,'0');
  if(!validDriveCalendarDay(date))return whole;
  const expected=weekdays[new Date(date+'T12:00:00Z').getUTCDay()].split('|');
  if(weekday&&!expected.some(name=>name.toLowerCase()===weekday.toLowerCase()))return whole;
  return /[\u0600-\u06ff]/u.test(whole)?'يوم '+date:'on '+date;
 });
 text=text.replace(/(?:\bat\s+|الساعة\s+|الساعه\s+)(\d{1,2})(?::([0-5]\d))?\s*(pm|am|p\.m\.|a\.m\.|بالليل|مساء[ًا]*|صباح[ًا]*)(?![\p{L}])/giu,(whole,hour,minute,period)=>{
  const h=Number(hour);if(h<1||h>12)return whole;
  const evening=/pm|p\.m\.|بالليل|مساء/iu.test(period),clock=String(h%12+(evening?12:0)).padStart(2,'0')+':'+(minute??'00');
  return /[\u0600-\u06ff]/u.test(whole)?'الساعة '+clock:'at '+clock;
 });
 return text;
}
/** Resolve only the current USER turn using the server's clock. */
export function resolveDriveTemporalText(input, now=Date.now()) {
 const text=explicitDatesAndClock(input);
 if(turnHasDeferredIntent(input))return {text:input,relativeDate:null};
 relativeDay.lastIndex=0;
 if(!relativeDay.test(text))return {text,relativeDate:null};
 const date=afterTomorrow(now);if(!date)return {text,relativeDate:null};
 relativeDay.lastIndex=0;
 return {text:text.replace(relativeDay,whole=>/[\u0600-\u06ff]/u.test(whole)?'يوم '+date:'on '+date),relativeDate:date};
}
/** A date previously returned by Core is editable preference carry, not proof.
 * Unanchored historical relative words are never recomputed using today's clock. */
export function replayDriveTemporalText(input, relativeDate) {
 let text=explicitDatesAndClock(input);
 if(!validDriveCalendarDay(relativeDate)||turnHasDeferredIntent(input))return text;
 relativeDay.lastIndex=0;
 return text.replace(relativeDay,whole=>/[\u0600-\u06ff]/u.test(whole)?'يوم '+relativeDate:'on '+relativeDate);
}
