import {isMarketplaceRequestReference} from '../marketplace/customer-requests';

/** Explicit request creation only; never quote approval or execution authority. */
export function driveRequestSubmitCommand(text:string):boolean {
 const value=text.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').trim().toLowerCase().replace(/[.!؟?]+$/u,'').trim();
 return /^(?:اؤكد التفاصيل وارسل (?:الطلب|طلبا? واحدا?)|اؤكد تفاصيل الطلب وارسله|confirm (?:the )?details and (?:submit|send) (?:(?:this|the|one) )?request)$/.test(value);
}
export function driveChatContact(text:string):{name:string;phone:string}|null {
 const match=/^(?:الاسم|name)\s*[:：]\s*(.{2,120}?)\s*[,،;؛]\s*(?:الهاتف|phone)\s*[:：]\s*([+\d ()-]{7,30})\s*$/iu.exec(text.trim());
 return match?{name:match[1].trim(),phone:match[2].trim()}:null;
}
export type DriveRequestReservation=
 |{kind:'empty'}
 |{kind:'invalid'}
 |{kind:'reserved';key:string;reference:string|null};
/** Storage supplies an opaque hint, never identity, ownership or current status. */
export function readDriveRequestReservation(raw:string|null):DriveRequestReservation {
 if(raw===null)return {kind:'empty'};
 try {
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return {kind:'invalid'};
  const saved=value as Record<string,unknown>;
  if(Object.keys(saved).some(key=>!['key','reference'].includes(key))||typeof saved.key!=='string'
   ||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(saved.key)
   ||saved.reference!==null&&saved.reference!==undefined&&(typeof saved.reference!=='string'||!isMarketplaceRequestReference(saved.reference)))return {kind:'invalid'};
  return {kind:'reserved',key:saved.key,reference:typeof saved.reference==='string'?saved.reference:null};
 }catch{return {kind:'invalid'};}
}
/** Navigation help only: never approval, status or submission authority. */
export function driveRequestFollowCommand(text:string):boolean {
 const value=text.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').trim().toLowerCase().replace(/[.!؟?]+$/u,'').trim();
 return /^(?:موافق|اوافق(?: على العرض)?|اقبل العرض|(?:اعرض|عرض|افتح) (?:العرض|حالة الطلب)|(?:تابع|تحديث) (?:حالة )?الطلب|i accept(?: the quote)?|accept (?:the )?quote|(?:show|open|refresh|check) (?:the )?(?:quote|offer|request(?: status)?))$/.test(value);
}
const contactMarkers={ar:'تم إدخال بيانات التواصل لهذه المراجعة فقط.',en:'Contact details provided for this review only.'} as const;
/** Raw contact remains only in the managed request's memory, not chat history. */
export function driveChatUserText(text:string,locale:'ar'|'en'):string {
 return driveChatContact(text)?contactMarkers[locale]:text;
}
export function isDriveChatContactTurn(text:string):boolean {
 return Boolean(driveChatContact(text))||Object.values(contactMarkers).some(marker=>marker===text);
}