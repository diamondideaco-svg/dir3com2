/** Explicit chat commands only. These are UI intent, never server authorization. */
export function driveChatAction(text:string):'accept'|'show'|'submit'|null {
 const value=text.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').trim().toLowerCase().replace(/[.!؟?]+$/u,'').trim();
 if(/^(?:موافق|اوافق|اوافق على العرض|اقبل العرض|موافق على العرض|i accept(?: the quote)?|accept (?:the )?quote|i agree|yes,? i accept)$/.test(value))return 'accept';
 if(/^(?:اعرض العرض|اعرض السعر|اعرض حالة الطلب|تحديث حالة الطلب|show (?:the )?(?:quote|request status)|refresh (?:the )?request)$/.test(value))return 'show';
 if(/^(?:اؤكد التفاصيل وارسل الطلب|اؤكد تفاصيل الطلب وارسله|confirm (?:the )?details and submit (?:this |the )?request)$/.test(value))return 'submit';
 return null;
}
export function driveChatContact(text:string):{name:string;phone:string}|null {
 const m=/^(?:الاسم|name)\s*[:：]\s*(.{2,120}?)\s*[,،;؛]\s*(?:الهاتف|phone)\s*[:：]\s*([+\d ()-]{7,30})\s*$/iu.exec(text.trim());
 return m?{name:m[1].trim(),phone:m[2].trim()}:null;
}
