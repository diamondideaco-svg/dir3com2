'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import type {ManagedDriveChatPlan} from '@/lib/dabra/platform-assistant';
import type {OwnedDriveSnapshot,DriveNoticeState} from '@/lib/drive/owned-request';
import type {ConversationMessage,ConversationJob,ConversationSession} from '@/lib/dabra/conversation-session';
import {parseDriveTrip} from '@/lib/drive/request';
import {newTripRequested} from '@/lib/dabra/trip-routing';
import {driveChatAction,driveChatContact} from '@/lib/dabra/drive-chat-actions';
export type ManagedDriveChatHandle={review:()=>Promise<void>;handleMessage:(text:string,job:ConversationJob)=>Promise<string|null>;reset:()=>void;invalidatePlan:()=>void};
type Offer={id:string;title:string};
type Props={messages:ConversationMessage[];locale:'ar'|'en';ownerId:string|null;session:ConversationSession;onAssistant:(text:string)=>void;onPrivate:()=>void};
export default forwardRef<ManagedDriveChatHandle,Props>(function ManagedDriveChat({messages,locale,ownerId,session,onAssistant,onPrivate},ref){
 const ar=locale==='ar',alive=useRef(true),busyRef=useRef(false),controller=useRef<AbortController|null>(null);
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [plan,setPlan]=useState<ManagedDriveChatPlan|null>(null),[offers,setOffers]=useState<Offer[]>([]),[catalog,setCatalog]=useState('');
 const [selected,setSelected]=useState(''),[contact,setContact]=useState<{name:string;phone:string}|null>(null),[snapshot,setSnapshot]=useState<OwnedDriveSnapshot|null>(null);
 const messageJob=useRef<ConversationJob|null>(null),seenUser=useRef<string|null>(null);
 const reference=useRef<string|null>(null),key=useRef<string|null>(null),body=useRef<unknown>(null);
 const storageKey=ownerId?.startsWith('user:')?'dabra.managed-drive:'+ownerId:null;
 const persist=()=>{try{if(storageKey)sessionStorage.setItem(storageKey,JSON.stringify({key:key.current,reference:reference.current}));}catch{/* Durable RPC remains authoritative. No automatic resend. */}};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 // Only an opaque owner-scoped reference/key survives reload, never chat/contact/quote authority.
 useEffect(()=>{
  if(!storageKey)return;const restoreController=new AbortController();
  try{
   const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');
   if(saved&&typeof saved.key==='string'&&/^[a-f0-9-]{36}$/i.test(saved.key)){
    key.current=saved.key;
    if(typeof saved.reference==='string'&&/^REQ-[A-Z0-9]{1,40}$/.test(saved.reference)){
     const expected=saved.reference;reference.current=expected;setVisible(true);
     void fetch('/api/marketplace/drive-requests/'+encodeURIComponent(expected),{cache:'no-store',credentials:'same-origin',signal:restoreController.signal})
      .then(async response=>{if(!response.ok)throw Error('READ_UNCONFIRMED');const value:OwnedDriveSnapshot=await response.json();if(value.reference!==expected)throw Error('REFERENCE_MISMATCH');if(alive.current&&!restoreController.signal.aborted&&reference.current===expected)setSnapshot(value);})
      .catch(()=>{if(alive.current&&!restoreController.signal.aborted)setError(ar?'تعذر قراءة حالة الطلب. حدّث نفس المرجع.':'The request status could not be read. Refresh the same reference.');});
    }else setError(ar?'نتيجة الإرسال السابقة غير محسومة. راجع طلباتك قبل محاولة جديدة.':'The earlier submission outcome is unknown. Check your requests before another attempt.');
   }
  }catch{/* No authority is restored from malformed storage. */}
  return()=>restoreController.abort();
 },[storageKey,ar]);
 const run=async<T,>(work:(signal:AbortSignal)=>Promise<T>):Promise<T|null>=>{
  if(busyRef.current||!alive.current)return null;const delegated=messageJob.current;const job=delegated??session.begin();if(!job||!session.isCurrent(job))return null;busyRef.current=true;setBusy(true);setError('');controller.current=new AbortController();
  try{const value=await work(AbortSignal.any([controller.current.signal,job.signal,AbortSignal.timeout(20000)]));return alive.current&&session.isCurrent(job)?value:null;}
  catch{if(alive.current&&session.isCurrent(job))setError(ar?'تعذر تأكيد النتيجة. حدّث حالة نفس الطلب قبل أي إعادة إرسال.':'The outcome could not be confirmed. Refresh the same request before resubmitting.');return null;}
  finally{busyRef.current=false;if(alive.current)setBusy(false);if(!delegated)session.finish(job);}
 };
 const read=async(signal:AbortSignal)=>{
  if(!reference.current)throw Error('NO_REFERENCE');
  const response=await fetch('/api/marketplace/drive-requests/'+encodeURIComponent(reference.current),{cache:'no-store',credentials:'same-origin',signal});
  if(!response.ok)throw Error('READ_UNCONFIRMED');
  const next:OwnedDriveSnapshot=await response.json();if(next.reference!==reference.current)throw Error('REFERENCE_MISMATCH');
  if(alive.current&&!signal.aborted)setSnapshot(next);return next;
 };
 const refresh=()=>run(async signal=>{onPrivate();setVisible(true);return read(signal);});
 const review=async()=>{setVisible(true);onPrivate();if(reference.current){await refresh();return;}
  if(key.current&&!body.current){setError(ar?'تحقق من طلبك السابق أولًا؛ لن أنشئ طلبًا بديلًا لنتيجة مجهولة.':'Check your earlier request first. An unknown outcome cannot create a replacement request.');return;}
  if(!storageKey){setError(ar?'سجّل الدخول بحساب العميل لمراجعة الطلب هنا.':'Sign in with your customer account to review the request here.');return;}
  const userIndex=messages.findLastIndex(m=>m.role==='user');if(userIndex<0)return;
  await run(async signal=>{
   const current=messages[userIndex];const response=await fetch('/api/marketplace/drive-chat',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal,
    body:JSON.stringify({message:current.text,relativeDate:current.relativeDate,history:messages.slice(0,userIndex).slice(-24).map(m=>({role:m.role,content:m.text,relativeDate:m.relativeDate})),locale})});
   if(!response.ok)throw Error('PLAN_UNAVAILABLE');const result=await response.json() as {plan:ManagedDriveChatPlan;offers:Offer[];catalogVersion:string};
   if(!alive.current||signal.aborted)return;setPlan(result.plan);setOffers(result.offers);setCatalog(result.catalogVersion);setSelected('');
   if(result.plan.blocked)onAssistant(result.plan.question??(ar?'أكمل التفاصيل الناقصة أولًا.':'Complete the missing details first.'));
   else onAssistant(ar?'راجع تفاصيل الرحلة أدناه واختر سيارة منشورة لطلب التأكيد. اكتب الاسم والهاتف هنا بصيغة «الاسم: ...، الهاتف: ...». لن يُنشأ طلب حتى تؤكد الإرسال.':'Review the trip below and select a published vehicle to request confirmation. Enter “Name: ..., Phone: ...” here. No request is created until you confirm submission.');
  });
 };
 const submit=async()=>{
  if(reference.current){await refresh();return ar?'هذا هو الطلب نفسه؛ لم أنشئ طلبًا آخر.':'This is the same request; no second request was created.';}
  if(!plan||plan.blocked||!contact||!selected||!offers.some(o=>o.id===selected))return ar?'راجع التفاصيل واختر السيارة وأضف الاسم والهاتف قبل تأكيد الطلب.':'Review the details, select a vehicle and add your name and phone before confirming.';
  const parsed=parseDriveTrip({...plan.requirements,...contact,flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:true});
  if(!parsed.trip){setError(ar?'تفاصيل الرحلة غير مكتملة أو الموعد لم يعد صالحًا. عدّلها في الشات ثم أعد المراجعة.':'Trip details are incomplete or the time is no longer valid. Correct them in chat and review again.');return ar?'لم يُرسل طلب.':'No request was submitted.';}
  const result=await run(async signal=>{
   onPrivate();
   // Every mounted chat view reserves the same session and recovers its existing opaque key/reference.
   try{const saved=storageKey?JSON.parse(sessionStorage.getItem(storageKey)??'null'):null;
    if(saved&&typeof saved.reference==='string'&&/^REQ-[A-Z0-9]{1,40}$/.test(saved.reference)){
     reference.current=saved.reference;key.current=typeof saved.key==='string'?saved.key:key.current;await read(signal);
     return ar?'استعدت نفس طلب المراجعة؛ لم أنشئ طلبًا ثانيًا.':'Recovered the same review request; no second request was created.';
    }
    if(saved?.key&&!key.current)throw Error('UNCONFIRMED_PRIOR_REQUEST');
   }catch(error){if(error instanceof SyntaxError)throw Error('INVALID_DRAFT_STATE');throw error;}
   if(!key.current){key.current=crypto.randomUUID();body.current={drive_offer_id:selected,catalog_version:catalog,trip:parsed.trip};persist();}
   if(!body.current)throw Error('UNCONFIRMED_PRIOR_REQUEST');
   const response=await fetch('/api/marketplace/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify(body.current),credentials:'same-origin',signal});
   const payload=await response.json();if(!response.ok||!payload.request?.request_reference)throw Error('SUBMISSION_UNCONFIRMED');
   reference.current=payload.request.request_reference;persist();await read(signal);
   return (ar?'تم حفظ طلب المراجعة ':'Request saved for review ')+reference.current+(ar?'. ليس حجزًا ولا تأكيد توفر أو سعر.':'. This is not a booking or confirmation of availability or price.');
  });return result;
 };
 const accept=async()=>{
  if(!snapshot?.quote)return ar?'اعرض عرض العمليات أولًا وراجعه قبل الموافقة.':'Display and review the Operations quote before approving it.';
  if(snapshot.acceptedAt)return ar?'موافقتك مسجلة على نفس المرجع؛ لا حجز ولا دفع.':'Your approval is already recorded on this reference. No booking or payment.';
  if(snapshot.state!=='quote_ready'||Date.parse(snapshot.quote.expiresAt)<=Date.now())return ar?'العرض غير ساري؛ يلزم عرض صالح من العمليات.':'The quote is not current. A valid Operations quote is required.';
  const expected=snapshot;
  return run(async signal=>{
   const response=await fetch('/api/marketplace/drive-requests/'+encodeURIComponent(expected.reference),{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'accept',version:expected.version,acknowledged:true}),signal});
   if(!response.ok){if(response.status===409){await read(signal);return ar?'تغير العرض أو انتهت صلاحيته. راجع النسخة الظاهرة مجددًا؛ لم أسجل موافقة جديدة.':'The quote changed or expired. Review the displayed version again; no new approval was recorded.';}throw Error('ACCEPT_UNCONFIRMED');}
   const result:OwnedDriveSnapshot=await response.json();if(result.reference!==expected.reference||!result.acceptedAt)throw Error('ACCEPT_UNCONFIRMED');
   if(alive.current&&!signal.aborted)setSnapshot(result);
   return ar?'حُفظت موافقتك على سعر وسيارة وصلاحية هذا العرض. ستتابع العمليات الترتيب معك؛ لم يتم حجز أو دفع.':'Your approval of this quote’s price, vehicle and validity is saved. Operations will follow up with you. No booking or payment has occurred.';
  });
 };
 const reset=()=>{
  if(busyRef.current||key.current&&!reference.current){setError(ar?'تحقق من نتيجة الطلب السابق أولًا؛ لن أمسح مفتاحه أو أنشئ بديلًا مجهولًا.':'Check the earlier request outcome first. Its key cannot be discarded to create an unknown replacement.');return;}
  setVisible(false);setPlan(null);setOffers([]);setSelected('');setContact(null);setSnapshot(null);reference.current=null;key.current=null;body.current=null;
  try{if(storageKey)sessionStorage.removeItem(storageKey);}catch{}
 };
 const userTurns=messages.filter(m=>m.role==='user'),latestUser=userTurns.at(-1),precedingUser=userTurns.at(-2);
 useEffect(()=>{
  if(!latestUser||seenUser.current===latestUser.id)return;seenUser.current=latestUser.id;
  if(newTripRequested(latestUser.text,precedingUser?.text))reset();
 // Reset only once per new USER turn, across both mounted views of the shared session.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[latestUser?.id]);
 useImperativeHandle(ref,()=>({review,reset,
  invalidatePlan:()=>{if(!reference.current&&!key.current){setPlan(null);setOffers([]);setSelected('');}},
  handleMessage:async(text,job)=>{
   messageJob.current=job;try{
   if(busyRef.current)return ar?'أتحقق من نفس العملية؛ انتظر النتيجة قبل محاولة أخرى.':'The same operation is being checked. Wait for its outcome before another attempt.';
   const action=driveChatAction(text);
   if(action==='show'&&reference.current){const value=await refresh();return value?(ar?'هذا آخر عرض وحالة لنفس المرجع.':'This is the latest quote and state for the same reference.'):(ar?'تعذر قراءة الحالة؛ لم أرسل شيئًا.':'The state could not be read; nothing was sent.');}
   if(action==='accept'&&(visible||reference.current))return (await accept())??(ar?'نتيجة الموافقة غير مؤكدة. حدّث نفس الطلب؛ لن أكررها تلقائيًا.':'Approval outcome is unconfirmed. Refresh the same request; it will not be repeated automatically.');
   if(action==='submit'&&visible)return (await submit())??(ar?'نتيجة الإرسال غير مؤكدة. أعد التحقق من نفس الطلب.':'Submission outcome is unconfirmed. Check the same request.');
   const parsed=driveChatContact(text);if(parsed&&visible&&!reference.current&&!key.current){onPrivate();setContact(parsed);return ar?'حُفظ الاسم والهاتف لهذه المراجعة فقط. راجع التفاصيل واضغط تأكيد إرسال طلب واحد.':'Name and phone are set for this review only. Review the details and confirm one request.';}
   return null;
   }finally{messageJob.current=null;}
  }}));
 const announce=async(work:()=>Promise<string|null>)=>{const text=await work();if(text&&alive.current)onAssistant(text);};
 const notice=(state:DriveNoticeState)=>({not_queued:ar?'لم يُجهز إشعار عمليات معتمد.':'No approved Operations notice is queued.',queued:ar?'إشعار العمليات في الطابور؛ الإرسال والتسليم غير مثبتين.':'Operations notice queued; sending and delivery are not confirmed.',sending:ar?'إشعار العمليات قيد الإرسال؛ التسليم غير مثبت.':'Operations notice sending; delivery is unconfirmed.',provider_accepted:ar?'قبِل مزود الرسائل الإشعار؛ التسليم غير مثبت.':'Messaging provider accepted the notice; delivery is unconfirmed.',sent:ar?'سُجل إرسال الإشعار؛ لم يثبت التسليم.':'Notice marked sent; delivery is unconfirmed.',delivered:ar?'سُجل تسليم إشعار العمليات.':'Operations notice marked delivered.',read:ar?'سُجلت قراءة إشعار العمليات.':'Operations notice marked read.',failed:ar?'تعذر إرسال أو تسليم إشعار العمليات.':'Operations notice sending or delivery failed.',unknown:ar?'حالة إشعار العمليات غير معروفة.':'Operations notice status is unknown.'}[state]);
 if(!visible)return null;
 const requirements=snapshot?.trip??plan?.requirements;
 return <section data-managed-drive-chat className="my-3 rounded-2xl border border-teal-200 bg-white p-4 text-sm text-slate-800" dir={ar?'rtl':'ltr'} aria-label={ar?'طلب السيارة داخل الشات':'Car request in chat'}>
  <h3 className="font-bold">{ar?'مراجعة السيارة داخل المحادثة':'Car review in this conversation'}</h3>
  {error&&<p role="alert" className="my-2 text-red-700">{error}</p>}
  {requirements&&<div data-drive-chat-summary className="my-3 space-y-1 break-words">
   <p>{ar?'الاستلام: ':'Pickup: '}{requirements.pickup} · <bdi>{requirements.pickupAt}</bdi></p><p>{ar?'التسليم: ':'Return: '}{requirements.dropoff} · <bdi>{requirements.returnAt}</bdi> (Africa/Cairo)</p>
   <p>{requirements.passengers} {ar?'أشخاص':'people'} · {requirements.luggage} {ar?'قطع أمتعة':'bags'} · {requirements.mode==='chauffeur'?(ar?'سيارة مع سائق باليوم، ليست توصيلة مطار':'Daily chauffeured car, not an airport transfer'):(ar?'خدمة توصيلة مطار':'Airport transfer')}</p>
   {requirements.customerBudget&&<p>{ar?'ميزانية العميل للرحلة، وليست سعر العرض: ':'Customer whole-trip budget, not a quote: '}<bdi>{requirements.customerBudget.amount} {requirements.customerBudget.currency}</bdi></p>}
  </div>}
  {plan&&!plan.blocked&&!reference.current&&<>
   <p>{ar?'اختر سيارة منشورة لطلب التأكيد. السعة وساعات السائق والتوفر والإجمالي تؤكدها العمليات؛ لا ضمان من الاختيار.':'Select a published vehicle to request confirmation. Operations must confirm capacity, driver hours, availability and total; selection is not a guarantee.'}</p>
   <div className="my-3 flex flex-wrap gap-2">{offers.map(offer=><button type="button" data-drive-chat-offer={offer.id} key={offer.id} disabled={busy||Boolean(key.current)} aria-pressed={selected===offer.id} onClick={()=>setSelected(offer.id)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{offer.title}{selected===offer.id?' ✓':''}</button>)}</div>
   <p>{contact?(ar?'تم إدخال الاسم والهاتف لهذه المراجعة.':'Name and phone entered for this review.'):(ar?'اكتب في الشات: الاسم: ...، الهاتف: ...':'Enter in chat: Name: ..., Phone: ...')}</p>
   <p className="my-2">{ar?'التأكيد يرسل طلب مراجعة واحدًا، دون حجز أو دفع أو موافقة على شروط مجهولة.':'Confirmation submits one review request, without booking, payment or agreement to unknown terms.'}</p>
   <button type="button" data-drive-chat-submit disabled={busy||!selected||!contact} onClick={()=>announce(submit)} className="rounded-lg bg-teal-800 px-4 py-3 font-bold text-white disabled:opacity-40">{ar?'أؤكد التفاصيل وأرسل طلبًا واحدًا':'Confirm details and submit one request'}</button>
  </>}
  {reference.current&&<>
   <p data-drive-chat-reference className="my-2 font-semibold"><bdi>{reference.current}</bdi></p>
   {!snapshot?.quote&&<p>{ar?'بانتظار عرض العمليات. هذا طلب وليس حجزًا.':'Awaiting the Operations quote. This is a request, not a booking.'}</p>}
   {snapshot?.quote&&<div data-drive-chat-quote className="my-3 space-y-2"><p>{ar?'سعر عرض العمليات الإجمالي: ':'Operations quote total: '}<strong><bdi>{snapshot.quote.amount} {snapshot.quote.currency}</bdi></strong></p><p>{snapshot.quote.vehicle} {snapshot.quote.vehicleYear??''}</p><p>{ar?'صالح حتى: ':'Valid until: '}<bdi>{new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(snapshot.quote.expiresAt))}</bdi> (Africa/Cairo)</p>
    <p>{ar?'شروط التغيير والإلغاء غير مسجلة في العرض الحالي. الموافقة هنا على السعر والسيارة والصلاحية فقط، وليست قبولًا لشروط مجهولة أو تأكيد حجز.':'Change and cancellation terms are not recorded in this quote. Approval here covers its price, vehicle and validity only; it is not agreement to unknown terms or a booking confirmation.'}</p>
    {snapshot.state==='expired'&&<p role="status">{ar?'انتهت صلاحية العرض.':'This quote has expired.'}</p>}
    {snapshot.state==='quote_ready'&&!snapshot.acceptedAt&&<button type="button" data-drive-chat-accept disabled={busy} onClick={()=>announce(accept)} className="rounded-lg bg-teal-800 px-4 py-3 font-bold text-white disabled:opacity-40">{ar?'أوافق على سعر وسيارة وصلاحية العرض الظاهر':'Approve displayed quote price, vehicle and validity'}</button>}
   </div>}
   {snapshot?.acceptedAt&&<div data-drive-chat-accepted><p>{ar?'موافقة العميل محفوظة؛ تتابع العمليات الترتيب معك مباشرة. لا حجز صادر ولا دفع من الشات.':'Customer approval saved. Operations will follow up directly. No booking issued or payment taken in chat.'}</p><p data-drive-chat-notice>{notice(snapshot.operationsNotice)}</p></div>}
   <button type="button" data-drive-chat-refresh disabled={busy} onClick={()=>refresh()} className="mt-3 rounded-lg border px-4 py-2">{ar?'تحديث حالة نفس الطلب':'Refresh same request'}</button>
  </>}
  {plan?.blocked&&<p>{plan.question}</p>}{busy&&<p role="status">{ar?'جارٍ التحقق…':'Checking…'}</p>}
 </section>;
});
