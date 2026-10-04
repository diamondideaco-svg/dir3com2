'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase/client';
import {CONTINUITY_PREFERENCE_CHOICES,parseSavedTrip,resumeSavedTrip,type ContinuityPreferences,type SavedTrip} from '@/lib/dabra/continuity-contract';
import {parseContinuitySnapshot,type ContinuitySnapshot,type ContinuityMutation,type ContinuityAction} from '@/lib/dabra/continuity-service';
import {ContinuityRequests} from '@/lib/dabra/continuity-requests';
import styles from './DabraContinuity.module.css';
const defaults:ContinuityPreferences={replyLanguage:'ar',displayCurrency:'SAR',travelClass:'economy',lodgingStyle:'hotel',itineraryPace:'balanced'};
const copy={
 ar:{title:'ذاكرتي ورحلتي',intro:'احفظ اختياراتك ورحلة واحدة في حسابك لتعود إليها لاحقًا. لا تُحفظ المحادثة أو المستندات هنا.',consent:'أوافق على حفظ الاختيارات والرحلة التي أؤكدها في حسابي.',save:'تأكيد وحفظ',saved:'تم الحفظ في حسابك.',error:'تعذر تأكيد الحفظ. أعد المحاولة بنفس الطلب أو أعد تحميل الحالة.',conflict:'تغيرت الحالة. أعد تحميلها قبل التأكيد من جديد.',load:'إعادة تحميل',retry:'إعادة المحاولة',busy:'جارٍ الحفظ…',preferences:'اختياراتي',trip:'رحلة واحدة',saveTrip:'حفظ هذه الرحلة',origin:'مدينة المغادرة',destination:'الوجهة',start:'البداية',end:'النهاية',adults:'بالغون',children:'أطفال',rooms:'غرف',budget:'ميزانية اختيارية',family:'خدمات الرحلة',resume:'استئناف الرحلة',apply:'استخدام الاختيارات',clear:'حذف الاختيارات',delete:'حذف الرحلة',revoke:'إيقاف الذاكرة وحذف الكل',expired:'لا توجد رحلة محفوظة سارية.',invalid:'راجع الوجهة والتواريخ وعدد المسافرين.',until:'صالحة حتى',off:'الذاكرة غير مفعّلة في حسابك.',truth:'الاستئناف يعيد الخطة فقط. الأسعار والتوفر وأي موافقة سابقة تحتاج مراجعة جديدة.',replyLanguage:'لغة الرد',displayCurrency:'عملة العرض',travelClass:'درجة السفر',lodgingStyle:'نمط الإقامة',itineraryPace:'وتيرة الرحلة'},
 en:{title:'My memory and trip',intro:'Save your choices and one trip in your account to return later. Conversations and documents are not saved here.',consent:'I agree to save the choices and trip I explicitly confirm in my account.',save:'Confirm and save',saved:'Saved in your account.',error:'Save could not be confirmed. Retry the same request or reload the state.',conflict:'The state changed. Reload before confirming again.',load:'Reload',retry:'Retry',busy:'Saving…',preferences:'My choices',trip:'One trip',saveTrip:'Save this trip',origin:'Departure city',destination:'Destination',start:'Start',end:'End',adults:'Adults',children:'Children',rooms:'Rooms',budget:'Optional budget',family:'Trip services',resume:'Resume trip',apply:'Use choices',clear:'Delete choices',delete:'Delete trip',revoke:'Disable memory and delete all',expired:'No current saved trip.',invalid:'Check destination, dates and traveller counts.',until:'Valid until',off:'Memory is not enabled for your account.',truth:'Resume restores planning intent only. Prices, availability and earlier approvals need a new review.',replyLanguage:'Reply language',displayCurrency:'Display currency',travelClass:'Travel class',lodgingStyle:'Lodging style',itineraryPace:'Itinerary pace'}
};
const labels:Record<string,{ar:string;en:string}>={
 ar:{ar:'العربية',en:'Arabic'},en:{ar:'الإنجليزية',en:'English'},economy:{ar:'اقتصادية',en:'Economy'},premium_economy:{ar:'اقتصادية مميزة',en:'Premium economy'},business:{ar:'أعمال',en:'Business'},first:{ar:'أولى',en:'First'},hotel:{ar:'فندق',en:'Hotel'},apartment:{ar:'شقة',en:'Apartment'},resort:{ar:'منتجع',en:'Resort'},boutique:{ar:'فندق صغير',en:'Boutique'},relaxed:{ar:'هادئة',en:'Relaxed'},balanced:{ar:'متوازنة',en:'Balanced'},active:{ar:'نشطة',en:'Active'},drive:{ar:'سيارة',en:'Drive'},stay:{ar:'إقامة',en:'Stay'},fly:{ar:'طيران',en:'Fly'},concierge:{ar:'كونسيرج',en:'Concierge'},vip:{ar:'VIP',en:'VIP'}
};
type Props={ownerId:string;language:'ar'|'en';onResume:(trip:SavedTrip,preferences:ContinuityPreferences|null)=>void;onApply:(preferences:ContinuityPreferences|null)=>void;onForget:()=>void};
export default function DabraContinuity(props:Props){
 const {ownerId,language,onResume,onApply,onForget}=props;const t=copy[language];
 const [state,setState]=useState<ContinuitySnapshot|null>(null);const [enabled,setEnabled]=useState(false);
 const [preferences,setPreferences]=useState<ContinuityPreferences>({...defaults,replyLanguage:language});
 const [trip,setTrip]=useState<SavedTrip>({id:'',origin:null,destination:'',startDate:null,endDate:null,adults:1,children:0,rooms:1,budget:null,currency:'SAR',families:['stay']});
 const [includeTrip,setIncludeTrip]=useState(false);const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<'idle'|'saved'|'error'|'conflict'|'invalid'>('idle');
 const [requests]=useState(()=>new ContinuityRequests());const pending=useRef<ContinuityMutation|null>(null);
 function hydrate(s:ContinuitySnapshot){
  setState(s);setConsent(false);setPreferences(s.preferences??{...defaults,replyLanguage:language});
  setTrip(s.trip??{id:crypto.randomUUID(),origin:null,destination:'',startDate:null,endDate:null,adults:1,children:0,rooms:1,budget:null,currency:'SAR',families:['stay']});
  setIncludeTrip(Boolean(s.trip));
 }
 async function load(){
  const request=requests.begin();
  setBusy(true);setStatus('idle');pending.current=null;
  try{const response=await fetch('/api/dabra/continuity',{cache:'no-store',credentials:'same-origin',signal:request.signal});
   const result=await response.json();if(!request.isCurrent())return;
   if(result.enabled===false){setEnabled(false);setState(null);return;}
   setEnabled(true);
   if(!response.ok)throw new Error('unavailable');const s=parseContinuitySnapshot(result.state);if(!s)throw new Error('invalid');hydrate(s);
  }catch{if(request.isCurrent()){setState(null);setStatus('error');}}
  finally{if(request.isCurrent())setBusy(false);}
 }
 useEffect(()=>{
  queueMicrotask(()=>void load());
  const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{
   if(event==='INITIAL_SESSION')return;
   requests.invalidate();pending.current=null;setState(null);setEnabled(false);setConsent(false);setBusy(false);setTrip(current=>({...current,destination:'',origin:null}));onForget();
  });
  return()=>{requests.invalidate();pending.current=null;subscription.unsubscribe();};
 // The parent's identity-keyed mount owns this component; callbacks are scoped to that owner.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ownerId]);
 async function submit(action:ContinuityAction,retry=false){
  if(!state||busy)return;
  if(action==='save'&&(!consent||(includeTrip&&!parseSavedTrip({...trip,currency:preferences.displayCurrency})))){setStatus('invalid');return;}
  const attempt=retry?pending.current:{action,revision:state.revision,generation:state.generation,mutationId:crypto.randomUUID(),payload:action==='save'?{consent:true,preferences,trip:includeTrip?{...trip,currency:preferences.displayCurrency}:null}:{}};
  if(!attempt)return;
  pending.current=attempt;const request=requests.begin();setBusy(true);setStatus('idle');
  try{const response=await fetch('/api/dabra/continuity',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt),signal:request.signal});
   if(!request.isCurrent())return;
   if(response.status===409){pending.current=null;setStatus('conflict');return;}
   if(!response.ok)throw new Error('unconfirmed');const result=await response.json();const s=parseContinuitySnapshot(result.state);
   if(!request.isCurrent())return;if(!s)throw new Error('invalid');
   pending.current=null;hydrate(s);setStatus('saved');
   if(action==='revoke'||action==='delete_trip')onForget();else if(action==='clear_preferences')onApply(null);
  }catch{if(request.isCurrent())setStatus('error');}
  finally{if(request.isCurrent())setBusy(false);}
 }
 if(!enabled&&status!=='error')return null;
 const date=(s:string|null)=>s?new Date(s).toLocaleDateString(language==='ar'?'ar-SA':'en-GB',{timeZone:'UTC'}):'';
 const currentPreferences=()=>state?.preferences && Date.parse(state.preferencesExpiresAt??'')>Date.now()?state.preferences:null;
 return <section className={styles.panel} dir={language==='ar'?'rtl':'ltr'} aria-label={t.title}>
 <h2>{t.title}</h2><p>{t.intro}</p>
 {!state?<button type="button" disabled={busy} onClick={()=>void load()}>{t.load}</button>:<>
 <p>{state.consentEnabled?t.truth:t.off}</p>
 <fieldset disabled={busy}><legend>{t.preferences}</legend><div className={styles.grid}>
 {(Object.keys(CONTINUITY_PREFERENCE_CHOICES) as Array<keyof ContinuityPreferences>).map(key=><label key={key}>{t[key]}<select value={preferences[key]} onChange={e=>{setPreferences(current=>({...current,[key]:e.target.value}));setConsent(false);}}>
 {CONTINUITY_PREFERENCE_CHOICES[key].map(value=><option key={value} value={value}>{labels[value]?.[language]??value}</option>)}</select></label>)}
 </div></fieldset>
 {state.preferencesExpiresAt&&<p>{t.until}: {date(state.preferencesExpiresAt)}</p>}
 <fieldset disabled={busy}><legend>{t.trip}</legend><label><input type="checkbox" checked={includeTrip} onChange={e=>{setIncludeTrip(e.target.checked);setConsent(false);}}/>{t.saveTrip}</label>
 {includeTrip&&<div className={styles.grid}>
 {(['origin','destination','startDate','endDate'] as const).map(key=><label key={key}>{key==='startDate'?t.start:key==='endDate'?t.end:t[key]}<input type={key.endsWith('Date')?'date':'text'} maxLength={80} value={trip[key]??''} onChange={e=>{setTrip(current=>({...current,[key]:e.target.value||null}));setConsent(false);}}/></label>)}
 {(['adults','children','rooms','budget'] as const).map(key=><label key={key}>{t[key]}<input type="number" min={key==='children'||key==='budget'?0:1} max={key==='rooms'?8:key==='budget'?1000000000:20} value={trip[key]??''} onChange={e=>{setTrip(current=>({...current,[key]:e.target.value===''?null:Number(e.target.value)} as SavedTrip));setConsent(false);}}/></label>)}
 <div>{t.family}{(['drive','stay','fly','concierge','vip'] as const).map(f=><label key={f}><input type="checkbox" checked={trip.families.includes(f)} onChange={e=>{setTrip(current=>({...current,families:e.target.checked?[...current.families,f]:current.families.filter(v=>v!==f)}));setConsent(false);}}/>{labels[f][language]}</label>)}</div>
 </div>}</fieldset>
 {state.tripExpiresAt&&<p>{t.until}: {date(state.tripExpiresAt)}</p>}
 <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>{t.consent}</label>
 <div className={styles.actions}>
 <button type="button" disabled={busy||!consent||status==='conflict'} onClick={()=>void submit('save')}>{busy?t.busy:t.save}</button>
 <button type="button" disabled={busy||!state.preferences||status==='conflict'} onClick={()=>onApply(currentPreferences())}>{t.apply}</button>
 <button type="button" disabled={busy||!state.trip||status==='conflict'} onClick={()=>{const resumed=resumeSavedTrip(state.trip,Date.parse(state.tripExpiresAt??''));if(resumed)onResume(resumed.intent,currentPreferences());else setStatus('invalid');}}>{t.resume}</button>
 <button type="button" disabled={busy||status==='conflict'} onClick={()=>void submit('clear_preferences')}>{t.clear}</button>
 <button type="button" disabled={busy||status==='conflict'} onClick={()=>void submit('delete_trip')}>{t.delete}</button>
 <button type="button" disabled={busy||status==='conflict'} onClick={()=>void submit('revoke')}>{t.revoke}</button>
 <button type="button" disabled={busy} onClick={()=>void load()}>{t.load}</button>
 {status==='error'&&<button type="button" disabled={busy} onClick={()=>{const attempt=pending.current;if(attempt)void submit(attempt.action,true);}}>{t.retry}</button>}
 </div></>}
 {status!=='idle'&&<p role={status==='saved'?'status':'alert'}>{t[status]}</p>}
 </section>;
}
