'use client';

import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import Link from 'next/link';
import type {ManagedDriveChatPlan} from '@/lib/dabra/platform-assistant';
import type {ConversationMessage,ConversationJob,ConversationSession} from '@/lib/dabra/conversation-session';
import {parseDriveTrip} from '@/lib/drive/request';
import {isMarketplaceRequestReference} from '@/lib/marketplace/customer-requests';
import {newTripRequested} from '@/lib/dabra/trip-routing';
import {driveRequestSubmitCommand,driveRequestFollowCommand,driveChatContact,isDriveChatContactTurn,readDriveRequestReservation} from '@/lib/dabra/drive-chat-request';

export type ManagedDriveChatHandle={
 review:()=>Promise<void>;
 handleMessage:(text:string,job:ConversationJob)=>Promise<string|null>;
 reset:()=>void;
 invalidatePlan:()=>void;
};
type Offer={id:string;title:string};
type Props={messages:ConversationMessage[];locale:'ar'|'en';ownerId:string|null;session:ConversationSession;onAssistant:(text:string)=>void;onPrivate:()=>void};
type ErrorCode='login'|'unknown'|'unavailable'|'invalid'|'storage'|null;

export default forwardRef<ManagedDriveChatHandle,Props>(function ManagedDriveChat({messages,locale,ownerId,session,onAssistant,onPrivate},ref){
 const ar=locale==='ar';
 const alive=useRef(true),busyRef=useRef(false),controller=useRef<AbortController|null>(null);
 const delegatedJob=useRef<ConversationJob|null>(null),seenUser=useRef<string|null>(null);
 const reference=useRef<string|null>(null),key=useRef<string|null>(null),serializedBody=useRef<string|null>(null),uncertain=useRef(false);
 const [boundOwner,setBoundOwner]=useState(ownerId);
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<ErrorCode>(null);
 const [plan,setPlan]=useState<ManagedDriveChatPlan|null>(null),[offers,setOffers]=useState<Offer[]>([]),[catalog,setCatalog]=useState('');
 const [selected,setSelected]=useState(''),[contact,setContact]=useState<{name:string;phone:string}|null>(null);
 const [referenceConfirmed,setReferenceConfirmed]=useState(false);
 const storageKey=ownerId?.startsWith('user:')?'dabra.managed-drive:'+ownerId:null;
 const sameOwner=()=>Boolean(storageKey&&session.getSnapshot().persistence?.ownerId===ownerId);
 const errorText={
  login:ar?'سجّل الدخول بحساب العميل لمراجعة الطلب هنا.':'Sign in with your customer account to review the request here.',
  unknown:ar?'نتيجة الإرسال السابق غير محسومة. راجع طلباتك؛ لن أبدأ طلبًا بديلًا أو أغيّر تفاصيل المحاولة السابقة.':'The earlier submission outcome is unknown. Check your requests; no replacement request or changed retry details will be sent.',
  unavailable:ar?'تعذر إتمام المراجعة الآن. حاول لاحقًا.':'The review could not be completed now. Try again later.',
  invalid:ar?'تفاصيل الرحلة ناقصة أو الموعد غير صالح. عدّلها في الشات ثم أعد المراجعة.':'Trip details are incomplete or the time is invalid. Correct them in chat and review again.',
  storage:ar?'تعذر حفظ مسودة الإرسال بأمان. لم يبدأ إرسال جديد؛ راجع طلباتك قبل المحاولة.':'The submission draft could not be saved safely. No new submission started; check your requests before trying again.',
 };

 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{
  controller.current?.abort();busyRef.current=false;
  key.current=null;reference.current=null;serializedBody.current=null;uncertain.current=false;
  setBoundOwner(ownerId);setVisible(false);setBusy(false);setPlan(null);setOffers([]);setCatalog('');setSelected('');setContact(null);setReferenceConfirmed(false);setError(null);
  if(!storageKey)return;
  try{
   const saved=readDriveRequestReservation(sessionStorage.getItem(storageKey));
   if(saved.kind==='reserved'){key.current=saved.key;reference.current=saved.reference;uncertain.current=!saved.reference;setVisible(true);if(!saved.reference)setError('unknown');}
   else if(saved.kind==='invalid'){uncertain.current=true;setVisible(true);setError('unknown');}
  }catch{uncertain.current=true;setVisible(true);setError('storage');}
 },[storageKey,ownerId]);

 const persist=()=>{
  if(!storageKey||!key.current)throw Error('NO_RESERVATION');
  sessionStorage.setItem(storageKey,JSON.stringify({key:key.current,reference:reference.current}));
  const saved=readDriveRequestReservation(sessionStorage.getItem(storageKey));
  if(saved.kind!=='reserved'||saved.key!==key.current||saved.reference!==reference.current)throw Error('RESERVATION_UNCONFIRMED');
 };
 const run=async<T,>(work:(signal:AbortSignal,job:ConversationJob)=>Promise<T>):Promise<T|null>=>{
  if(busyRef.current||!alive.current||!sameOwner())return null;
  const delegated=delegatedJob.current,job=delegated??session.begin();
  if(!job||!session.isCurrent(job))return null;
  busyRef.current=true;setBusy(true);setError(null);controller.current=new AbortController();
  try{
   const signal=AbortSignal.any([controller.current.signal,job.signal,AbortSignal.timeout(20000)]);
   const value=await work(signal,job);
   return alive.current&&!signal.aborted&&session.isCurrent(job)&&sameOwner()?value:null;
  }catch{
   if(alive.current&&session.isCurrent(job)&&sameOwner())setError(key.current&&!reference.current||uncertain.current?'unknown':'unavailable');
   return null;
  }finally{busyRef.current=false;if(alive.current)setBusy(false);if(!delegated)session.finish(job);}
 };
 const followText=()=>ar
  ?'متابعة الحالة والعرض والموافقة تتم من صفحة طلبك الحالية. لم أسجل موافقة عرض داخل هذه المحادثة؛ افتح رابط متابعة الطلب أدناه.'
  :'Status, quote review and acceptance use your existing request page. No quote approval was recorded in this chat; open the request link below.';

 const review=async()=>{
  setVisible(true);onPrivate();
  if(reference.current)return;
  if(key.current||uncertain.current){setError('unknown');return;}
  if(!storageKey){setError('login');return;}
  // Contact and explicit submission text never become planning history or notes.
  const planning=messages.filter(message=>message.role!=='user'||!isDriveChatContactTurn(message.text)&&!driveRequestSubmitCommand(message.text));
  const index=planning.findLastIndex(message=>message.role==='user');if(index<0)return;
  await run(async(signal,job)=>{
   const current=planning[index];
   const response=await fetch('/api/marketplace/drive-chat',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal,
    body:JSON.stringify({message:current.text,relativeDate:current.relativeDate,history:planning.slice(0,index).slice(-24).map(message=>({role:message.role,content:message.text,relativeDate:message.relativeDate})),locale})});
   if(!response.ok)throw Error('PLAN_UNAVAILABLE');
   const result=await response.json() as {plan:ManagedDriveChatPlan;offers:Offer[];catalogVersion:string};
   if(!alive.current||signal.aborted||!session.isCurrent(job)||!sameOwner())return;
   setPlan(result.plan);setOffers(result.offers);setCatalog(result.catalogVersion);setSelected('');
   onAssistant(result.plan.blocked?result.plan.question??(ar?'أكمل التفاصيل الناقصة أولًا.':'Complete the missing details first.'):
    ar?'راجع متطلبات الرحلة واختر سيارة منشورة لطلب التأكيد. اكتب «الاسم: ...، الهاتف: ...». لن يُنشأ طلب حتى تؤكد الإرسال.':
     'Review the trip requirements and select a published vehicle to request confirmation. Enter “Name: ..., Phone: ...”. No request is created until you confirm submission.');
  });
 };

 const submit=async():Promise<string|null>=>{
  if(reference.current)return followText();
  if(uncertain.current&&!serializedBody.current){setError('unknown');return null;}
  if(!key.current&&(!plan||plan.blocked||!contact||!selected||!offers.some(offer=>offer.id===selected))){
   return ar?'راجع التفاصيل واختر السيارة وأضف الاسم والهاتف قبل تأكيد الطلب.':'Review the details, select a vehicle and add your name and phone before confirming.';
  }
  return run(async(signal,job)=>{
   onPrivate();
   if(!storageKey)throw Error('NO_OWNER');
   const saved=readDriveRequestReservation(sessionStorage.getItem(storageKey));
   if(saved.kind==='invalid'){uncertain.current=true;throw Error('INVALID_RESERVATION');}
   if(saved.kind==='reserved'){
    if(saved.reference){key.current=saved.key;reference.current=saved.reference;setReferenceConfirmed(false);setVisible(true);return followText();}
    if(saved.key!==key.current||!serializedBody.current){key.current=saved.key;uncertain.current=true;throw Error('UNKNOWN_PRIOR_SUBMISSION');}
   }
   if(!key.current){
    const parsed=parseDriveTrip({...plan?.requirements,...contact,flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:true});
    if(!parsed.trip){setError('invalid');return ar?'لم يُرسل طلب.':'No request was submitted.';}
    key.current=crypto.randomUUID();
    serializedBody.current=JSON.stringify({drive_offer_id:selected,catalog_version:catalog,trip:parsed.trip});
   }
   if(!serializedBody.current)throw Error('UNKNOWN_PRIOR_SUBMISSION');
   // The shared conversation owns dispatch. Persist and verify its reservation
   // before any network request; every explicit retry sends identical bytes.
   try{persist();}catch{uncertain.current=true;setError('storage');throw Error('RESERVATION_STORAGE_UNAVAILABLE');}
   if(signal.aborted||!session.isCurrent(job)||!sameOwner())throw Error('STALE_OWNER');
   const response=await fetch('/api/marketplace/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},credentials:'same-origin',body:serializedBody.current,signal});
   const payload=await response.json() as {request?:{request_reference?:unknown};replayed?:boolean};
   if(!response.ok||typeof payload.request?.request_reference!=='string'||!isMarketplaceRequestReference(payload.request.request_reference))throw Error('SUBMISSION_UNCONFIRMED');
   if(!alive.current||signal.aborted||!session.isCurrent(job)||!sameOwner())throw Error('STALE_OWNER');
   reference.current=payload.request.request_reference;uncertain.current=false;setReferenceConfirmed(true);
   try{persist();}catch{/* A known response is shown here; an old key still blocks a second-view replacement. */}
   return (ar?'حُفظ طلب المراجعة ':'Review request saved ')+reference.current+
    (ar?'. تابع الحالة والعرض من صفحة طلبك. هذا ليس حجزًا أو تأكيدًا للسعر أو التوفر.':'. Follow its status and quote on your request page. This is not a booking or confirmation of price or availability.');
  });
 };
 const reset=()=>{
  if(busyRef.current||key.current&&!reference.current||uncertain.current){setError('unknown');return;}
  try{if(storageKey)sessionStorage.removeItem(storageKey);}catch{setError('storage');return;}
  setVisible(false);setPlan(null);setOffers([]);setSelected('');setContact(null);setReferenceConfirmed(false);setError(null);
  reference.current=null;key.current=null;serializedBody.current=null;uncertain.current=false;
 };
 const userTurns=messages.filter(message=>message.role==='user'),latest=userTurns.at(-1),preceding=userTurns.at(-2);
 useEffect(()=>{
  if(!latest||seenUser.current===latest.id)return;seenUser.current=latest.id;
  if(newTripRequested(latest.text,preceding?.text))reset();
 // A reset belongs only to a new USER turn, not to assistant rendering.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[latest?.id]);
 useImperativeHandle(ref,()=>({review,reset,
  invalidatePlan:()=>{if(!reference.current&&!key.current&&!uncertain.current){setPlan(null);setOffers([]);setSelected('');}},
  handleMessage:async(text,job)=>{
   delegatedJob.current=job;
   try{
    if(busyRef.current)return ar?'أتحقق من نفس العملية؛ انتظر النتيجة قبل محاولة أخرى.':'The same operation is being checked. Wait for its outcome before another attempt.';
    if(driveRequestFollowCommand(text)&&visible)return reference.current?followText():
     ar?'هذه مراجعة متطلبات وليست عرضًا قابلاً للموافقة. لم أسجل موافقة عرض داخل الشات.':'This is a requirements review, not an approvable quote. No quote approval was recorded in chat.';
    if(driveRequestSubmitCommand(text)&&visible){
     const reply=await submit();
     return reply??(key.current&&!reference.current||uncertain.current?errorText.unknown:errorText.unavailable);
    }
    const parsed=driveChatContact(text);
    if(parsed&&visible){
     onPrivate();
     if(reference.current)return ar?'تعديل التواصل يتم من مسار طلبك الحالي. لم أغيّر الطلب أو أرسل بيانات التواصل إلى الشات العام.':'Contact changes use your existing request flow. The request was not changed and contact details were not sent to general chat.';
     if(key.current||uncertain.current)return errorText.unknown;
     setContact(parsed);return ar?'تم إدخال الاسم والهاتف لهذه المراجعة فقط. راجع التفاصيل ثم أكد إرسال طلب واحد.':'Name and phone are set for this review only. Review the details, then confirm submission of one request.';
    }
    return null;
   }finally{delegatedJob.current=null;}
  },
 }));
 const announce=async()=>{const text=await submit();if(text&&alive.current&&sameOwner())onAssistant(text);};
 if(!visible||boundOwner!==ownerId)return null;
 const pending=Boolean(key.current&&!reference.current||uncertain.current);
 const requirements=!pending?plan?.requirements:null;
 return <section data-managed-drive-chat className="my-3 rounded-2xl border border-teal-200 bg-white p-4 text-sm text-slate-800" dir={ar?'rtl':'ltr'} aria-label={ar?'طلب مراجعة السيارة داخل الشات':'Car review request in chat'}>
  <h3 className="font-bold">{ar?'مراجعة متطلبات السيارة':'Review car requirements'}</h3>
  {error&&<p role="alert" className="my-2 text-red-700">{errorText[error]}</p>}
  {requirements&&<div data-drive-chat-summary className="my-3 space-y-1 break-words">
   <p>{ar?'الاستلام: ':'Pickup: '}{requirements.pickup} · <bdi>{requirements.pickupAt}</bdi></p>
   <p>{ar?'التسليم: ':'Return: '}{requirements.dropoff} · <bdi>{requirements.returnAt}</bdi> (Africa/Cairo)</p>
   <p>{requirements.passengers} {ar?'أشخاص':'people'} · {requirements.luggage} {ar?'قطع أمتعة':'bags'} · {ar?'سيارة مع سائق باليوم، ليست توصيلة مطار':'Daily chauffeured car, not an airport transfer'}</p>
   {requirements.customerBudget&&<p>{ar?'ميزانية العميل للرحلة، وليست سعر العرض: ':'Customer whole-trip budget, not a quote: '}<bdi>{requirements.customerBudget.amount} {requirements.customerBudget.currency}</bdi></p>}
  </div>}
  {plan&&!plan.blocked&&!reference.current&&!pending&&<>
   <p>{ar?'اختر سيارة منشورة لطلب التأكيد. تؤكد العمليات السعة وساعات السائق والتوفر والإجمالي؛ الاختيار ليس ضمانًا.':'Select a published vehicle to request confirmation. Operations must confirm capacity, driver hours, availability and total; selection is not a guarantee.'}</p>
   <div className="my-3 flex flex-wrap gap-2">{offers.map(offer=><button type="button" data-drive-chat-offer={offer.id} key={offer.id} disabled={busy} aria-pressed={selected===offer.id} onClick={()=>setSelected(offer.id)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{offer.title}{selected===offer.id?' ✓':''}</button>)}</div>
   <p>{contact?(ar?'تم إدخال الاسم والهاتف لهذه المراجعة.':'Name and phone entered for this review.'):(ar?'اكتب في الشات: الاسم: ...، الهاتف: ...':'Enter in chat: Name: ..., Phone: ...')}</p>
   <p className="my-2">{ar?'التأكيد يرسل طلب مراجعة واحدًا دون حجز أو دفع أو موافقة على شروط مجهولة.':'Confirmation submits one review request without booking, payment or agreement to unknown terms.'}</p>
   <button type="button" data-drive-chat-submit disabled={busy||!selected||!contact} onClick={announce} className="rounded-lg bg-teal-800 px-4 py-3 font-bold text-white disabled:opacity-40">{ar?'أؤكد التفاصيل وأرسل طلبًا واحدًا':'Confirm details and submit one request'}</button>
  </>}
  {pending&&<div data-drive-chat-unconfirmed>
   <p>{ar?'راجع طلباتك قبل بدء طلب آخر. لن تُستبدل تفاصيل محاولة غير محسومة.':'Check your requests before starting another request. Details of an unresolved submission will not be replaced.'}</p>
   {serializedBody.current&&<button type="button" data-drive-chat-retry disabled={busy} onClick={announce} className="my-2 rounded-lg border px-4 py-2">{ar?'إعادة المحاولة بالتفاصيل نفسها':'Retry with the same details'}</button>}
   <Link prefetch={false} href="/my-requests" data-drive-chat-existing-requests className="block font-semibold underline">{ar?'فتح طلباتي للتحقق':'Open my requests to check'}</Link>
  </div>}
  {reference.current&&<div data-drive-chat-reference>
   <p className="my-2 font-semibold"><bdi>{reference.current}</bdi></p>
   <p>{referenceConfirmed?(ar?'تأكد حفظ هذا المرجع من الخادم.':'The server confirmed this saved reference.'):(ar?'هذا مرجع محفوظ في الجلسة؛ تحقق من ملكيته وحالته في صفحة الطلب.':'This is a session reference; verify its ownership and status on the request page.')}</p>
   <p>{ar?'الحالة والعرض والموافقة متاحة بالطريقة الحالية في صفحة طلبك. لا تُسجّل موافقة عرض في هذا الشات، وهذا ليس حجزًا أو دفعًا.':'Status, quote review and acceptance use your existing request page. This chat does not record quote approval, booking or payment.'}</p>
   <Link prefetch={false} data-drive-chat-open-request href={'/my-requests/'+encodeURIComponent(reference.current)+'/drive'} className="my-2 inline-block rounded-lg border px-4 py-2 font-semibold">{ar?'متابعة الطلب من صفحته':'Follow the request on its page'}</Link>
  </div>}
  {plan?.blocked&&!pending&&<p>{plan.question}</p>}
  {busy&&<p role="status">{ar?'جارٍ التحقق…':'Checking…'}</p>}
 </section>;
});