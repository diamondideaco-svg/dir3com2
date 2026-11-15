import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/ai2/chat/route';
import { agentIntent } from '../lib/dabra/agent-contract';
import { conversationIntent } from '../lib/dabra/conversation-renderer';
import { ContinuityContext } from '../lib/dabra/continuity-context';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import { bareDrivePartyWithLuggage, driveDialogue, driveDialogueCopy, driveQuantities } from '../lib/dabra/drive-planning';
import { explicitDabraReplyLocale } from '../lib/dabra/locale-contract';
import { buildPlatformAssistantResponse as respond, normalizePlatformQuery as normalize } from '../lib/dabra/platform-assistant';
import { DRIVE_OFFERS, VEHICLE_MASTER } from '../lib/drive/catalog';
import { driveModelReference, driveModelReferenceCopy } from '../lib/drive/model-reference';
import { DRIVE_OWNER_AVAILABILITY, driveOwnerAvailabilityCopy } from '../lib/drive/owner-availability';

type Turn = {role:'user'|'assistant';content:string};
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-10','2026-12-13'],party:'4',durationDays:3};

test('quoted whole-duration SAR budget is complete; ask only an actually missing budget field',()=>{
 const state=driveDialogue([normalize('أحتاج سيارة مع سائق'),normalize('1000 ريال سعودي للثلاثة أيام كاملة')],prefs);
 assert.ok(state);assert.equal(state.kind,'ready');assert.deepEqual(state.budget,{kind:'amount',amount:'1000',currency:'SAR',basis:'trip'});
 assert.equal(driveQuantities(normalize('للثلاثة أيام كاملة')).days.value,3);
 const missingBasis=driveDialogue([normalize('أحتاج سيارة مع سائق'),normalize('1000 ريال')],prefs);assert.ok(missingBasis);
 assert.match(driveDialogueCopy(missingBasis,'ar').question!,/لليوم أم للرحلة/);assert.doesNotMatch(driveDialogueCopy(missingBasis,'ar').question!,/عملة/);
 const missingCurrency=driveDialogue([normalize('أحتاج سيارة مع سائق'),normalize('ميزانية 1000 للرحلة')],prefs);assert.ok(missingCurrency);
 assert.match(driveDialogueCopy(missingCurrency,'ar').question!,/عملة/);assert.doesNotMatch(driveDialogueCopy(missingCurrency,'ar').question!,/لليوم/);
});

test('Arabic conjunction and compound answer capture bounded counts without accepting a partial number',()=>{
 const q=driveQuantities(normalize('3 أيام و4 أشخاص و3 شنط'));
 assert.equal(q.days.value,3);assert.equal(q.party.value,4);assert.equal(q.luggage.value,3);
 assert.deepEqual(bareDrivePartyWithLuggage(normalize('أربعة و3 شنط')),{party:4,luggage:3});
 assert.equal(driveQuantities(normalize('1000 و2 أشخاص')).party.value,undefined);
 assert.equal(bareDrivePartyWithLuggage(normalize('أربعة و300 شنط')),null);
 const initial='أحتاج سيارة في القاهرة من 2026-12-10 إلى 2026-12-13 مع سائق والميزانية مفتوحة';
 const first=respond(initial,[],'ar');assert.match(first.answer,/كم عدد الأشخاص/);
 const history:Turn[]=[{role:'user',content:initial},{role:'assistant',content:first.answer}];
 const answer=respond('أربعة و3 شنط',history,'ar').answer;
 assert.match(answer,/4 أشخاص/);assert.match(answer,/3 قطع أمتعة/);assert.match(answer,/passengers=4/);assert.match(answer,/luggage=3/);
 assert.match(answer,/سعة ركاب موثقة/);assert.doesNotMatch(answer,/تم الحجز|تم الدفع/);
 const unsolicited=respond('أربعة و3 شنط',[],'ar').answer;assert.doesNotMatch(unsolicited,/4 أشخاص|passengers=4/);
});

test('synthetic described flow isolates Dubai budget while preserving Cairo counts and later correction',()=>{
 const history:Turn[]=[];
 const ask=(message:string)=>{const a=respond(message,history,'ar').answer;history.push({role:'user',content:message},{role:'assistant',content:a});return a;};
 ask('أحتاج مساعدة في السفر');
 const dubai=ask('أحتاج سيارة في دبي لمدة 5 أيام و4 أشخاص بميزانية 8000 ريال');
 assert.match(dubai,/كتالوج السيارات الحالي يعرض خدمات مصر/);assert.doesNotMatch(dubai,/offer=|أسعار كتالوج/);
 const cairo=ask('أحتاج سيارة في القاهرة لمدة 3 أيام و4 أشخاص و3 شنط');
 assert.match(cairo,/4 أشخاص/);assert.match(cairo,/3 قطع أمتعة/);assert.doesNotMatch(cairo,/8000/);
 const corrected=ask('ميزانيتي 1000 ريال');assert.match(corrected,/1000 SAR/);assert.match(corrected,/4 أشخاص/);assert.doesNotMatch(corrected,/8000/);
 const whole=ask('1000 ريال سعودي للثلاثة أيام كاملة');assert.match(whole,/1000 SAR/);assert.match(whole,/تاريخ/);assert.doesNotMatch(whole,/بأي عملة|لليوم أم للرحلة/);
 const objection=ask('السعر غالي');assert.match(objection,/ميزانيتك/);assert.doesNotMatch(objection,/ما النقطة التي تريدها تحديدا/);
 const summary=ask('ليش بتكرر نفس الرد ولخص كلامي');assert.match(summary,/1000 SAR/);assert.doesNotMatch(summary,/8000/);
});

test('same-request budget revision retains its unit while a different request starts clean',()=>{
 const history:Turn[]=[{role:'user',content:'أحتاج سيارة في القاهرة من 2026-12-10 إلى 2026-12-13 لأربعة أشخاص مع سائق ميزانية 8000 ريال للرحلة'}, {role:'assistant',content:'استجابة اصطناعية'}];
 const corrected=respond('الميزانية 1000',history,'ar').answer;
 assert.match(corrected,/1000 SAR/);assert.doesNotMatch(corrected,/8000 SAR|بأي عملة/);
 const hotel=respond('أحتاج فندق في دبي',history,'ar').answer;
 assert.match(hotel,/destination=dubai/);assert.doesNotMatch(hotel,/8000|checkIn=2026-12-10/);
 const insteadHotel=respond('بدلا من ذلك أريد فندق في القاهرة',history,'ar').answer;
 assert.doesNotMatch(insteadHotel,/8000|checkIn=2026-12-10/);
 const multi=respond('أحتاج سيارة وفندق في دبي',history,'ar').answer;
 assert.doesNotMatch(multi,/8000|checkIn=2026-12-10/);
 const newCar=respond('أريد سيارة جديدة في القاهرة لأربعة أشخاص',history,'ar').answer;
 assert.doesNotMatch(newCar,/8000 SAR|2026-12-10/);
 const sameTrip=respond('بدلا من ذلك في الجيزة',history,'ar').answer;
 assert.match(sameTrip,/8000 SAR/);assert.match(sameTrip,/الجيزة/);
});

test('a new destination detaches only the in-memory saved-trip projection before refinement',()=>{
 const trip: SavedTrip={id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Dubai',startDate:'2026-12-10',endDate:'2026-12-13',adults:4,children:0,rooms:1,budget:8000,currency:'SAR',families:['drive']};
 const snapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'test',preferences:null,preferencesExpiresAt:null,trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null} as ContinuitySnapshot;
 const context=new ContinuityContext();context.capture('user:A',snapshot,false,true);
 assert.equal(context.scope('أحتاج سيارة في القاهرة',[]),null);assert.equal(context.trip,null);assert.equal(context.lease?.trip,false);
 assert.equal(snapshot.trip?.destination,'Dubai');assert.equal(snapshot.trip?.budget,8000);
 const continued=new ContinuityContext();continued.capture('user:A',snapshot,false,true);
 const changed=continued.scope('بدلا من ذلك في القاهرة',[]);assert.equal(changed?.destination,'cairo');assert.equal(changed?.budget,8000);
});

test('explicit reply language overrides the request locale without changing stored preferences',async()=>{
 for(const [message,expected] of [['رد باللغة الإنجليزية','en'],['بالإنجليزية','en'],['Reply in English','en'],['answer in Arabic','ar'],['رد بالعربية','ar'],['do not reply in English',null],['لا تجاوب بالإنجليزية',null],['hotel in Cairo',null]] as const)assert.equal(explicitDabraReplyLocale(message),expected,message);
 const saved=process.env.DABRA_INTERNAL_AI_ENABLED;process.env.DABRA_INTERNAL_AI_ENABLED='false';
 const fetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('OFFLINE_TEST_NETWORK_BLOCKED');};
 try {
  const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'hotel in Cairo, reply in English',locale:'ar'})}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.language,'en');assert.match(body.answer,/Search hotels/);
 } finally {globalThis.fetch=fetch;if(saved===undefined)delete process.env.DABRA_INTERNAL_AI_ENABLED;else process.env.DABRA_INTERNAL_AI_ENABLED=saved;}
});

test('conversation repair, objection and booking capability do not replay a service menu',()=>{
 assert.equal(conversationIntent('ليش بتكرر نفس الرد ولخص كلامي'),'summary');
 assert.equal(conversationIntent('السعر غالي'),'price_objection');assert.equal(conversationIntent('هذا السعر غالية'),'price_objection');
 assert.equal(agentIntent('هل تستطيع حجز سيارة؟').tool,'capabilities');
 assert.equal(agentIntent('شكوى تكرر نفس الرد ولخص كلامي').tool,'discover');
});

test('dated owner statement and model references remain separate from verified supplier fields',()=>{
 assert.equal(DRIVE_OFFERS.length,30);assert.ok(DRIVE_OFFERS.every(x=>x.availability==='request_to_confirm'));
 assert.equal(DRIVE_OWNER_AVAILABILITY.source,'owner-statement');assert.equal(DRIVE_OWNER_AVAILABILITY.observedAt,'2026-11-15T11:42:00.528725Z');
 assert.match(driveOwnerAvailabilityCopy('ar'),/11:42 UTC/);assert.match(driveOwnerAvailabilityCopy('ar'),/يؤكد فريق العمليات/);
 const sunny=driveModelReference('nissan-sunny');assert.equal(sunny?.kind,'manufacturer-model-reference');assert.equal(sunny?.luggageLitres,490);assert.equal(sunny?.airConditioning,true);
 assert.deepEqual(driveModelReference('kia-carval')?.exampleSeatingConfigurations,[7,8]);assert.match(driveModelReferenceCopy('kia-carval','en')!,/unconfirmed/);
 assert.ok(VEHICLE_MASTER.every(v=>v.passengers===null&&v.luggage===null&&v.doors===null&&v.airConditioning===null));
});

test('unrecognised destination starts a separate request without carrying Cairo facts',()=>{
 const history:Turn[]=[
  {role:'user',content:'I need a car in Cairo from 2026-12-10 to 2026-12-13 for 4 people with a driver, budget 8000 SAR total'},
  {role:'assistant',content:'Synthetic response'},
 ];
 for(const [message,locale] of [['I need a car in Paris','en'],['أحتاج سيارة في باريس','ar']] as const){
  const answer=respond(message,history,locale).answer;
  assert.doesNotMatch(answer,/8000|2026-12-10|destination=cairo|القاهرة/);
  assert.match(answer,locale==='en'?/Which city|No car matches/i:/مدينة|لم أجد سيارة/);
 }
});

test('budget corrections and negative duals preserve only the stated facts',()=>{
 const base=normalize('I need a car with a driver and budget 8000 SAR per day');
 for(const correction of ['Not 8000 SAR, 1000 SAR total','not per day, for the whole trip']){
  const state=driveDialogue([base,normalize(correction)],prefs);
  assert.ok(state);assert.equal(state.budget?.kind,'amount');
  if(state.budget?.kind==='amount'){
   assert.equal(state.budget.basis,'trip');
   assert.equal(state.budget.amount,correction.startsWith('Not 8000')?'1000':'8000');
  }
 }
 assert.equal(driveQuantities(normalize('مو شنطتين')).luggage.value,undefined);
 assert.equal(driveQuantities(normalize('مو شنطتين')).luggage.mentioned,true);
 assert.equal(driveQuantities(normalize('مو شنطتين، 3 شنط')).luggage.value,3);
 const rejectedAmount=driveDialogue([base,normalize('not 8000 SAR')],prefs);
 assert.equal(rejectedAmount?.budget,null);
 const rejectedBasis=driveDialogue([base,normalize('not per day')],prefs);
 assert.equal(rejectedBasis?.budget?.kind==='amount'&&rejectedBasis.budget.basis,null);
});

test('basis-only answers keep the active car dialogue',()=>{
 const initial='I need a car in Cairo from 2026-12-10 to 2026-12-13 for 4 people with a driver and budget 1000 SAR';
 const first=respond(initial,[],'en');
 const history:Turn[]=[{role:'user',content:initial},{role:'assistant',content:first.answer}];
 for(const answer of ['for the whole trip','per day']){
  const reply=respond(answer,history,'en').answer;
  assert.match(reply,/1000 SAR/);
  assert.doesNotMatch(reply,/which currency.*per day|is that budget per day/i);
 }
 const arabic='أحتاج سيارة في القاهرة من 2026-12-10 إلى 2026-12-13 لأربعة أشخاص مع سائق وميزانية 1000 ريال';
 const previous:Turn[]=[{role:'user',content:arabic},{role:'assistant',content:respond(arabic,[],'ar').answer}];
 const reply=respond('للرحلة كاملة',previous,'ar').answer;
 assert.match(reply,/1000 SAR/);assert.doesNotMatch(reply,/بأي عملة|لليوم أم للرحلة/);
});

test('actual POST retains bounded user facts across more than eight messages, never assistant claims',async()=>{
 const initial='I need a car in Cairo from 2026-12-10 to 2026-12-13 for 4 people with a driver and budget 1000 SAR';
 const history:Turn[]=[{role:'user',content:initial},{role:'assistant',content:'Synthetic false claim: Dubai, 9 passengers, budget 9000 SAR.'}];
 for(const answer of ['yes','fine','okay','yes','fine']) history.push({role:'user',content:answer},{role:'assistant',content:'Synthetic acknowledgement'});
 const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'for the whole trip',locale:'en',history})}));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.match(body.answer,/cairo/i);assert.match(body.answer,/1000 SAR/);
 assert.doesNotMatch(body.answer,/9000|Dubai|9 passengers/);
});

test('unbounded locale input is processed promptly and POST uses only its bounded turn',async()=>{
 const start=performance.now();
 assert.equal(explicitDabraReplyLocale('رد'+' '.repeat(64000)+'!'),null);
 assert.ok(performance.now()-start<3000,'locale parsing should not backtrack quadratically');
 const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'سيارة'+' '.repeat(500)+'reply in English',locale:'ar'})}));
 assert.equal(response.status,200);assert.equal((await response.json()).language,'ar');
});

test('catalogue wording says Operations will confirm dates, not that availability was confirmed',()=>{
 const answer=respond('show Nissan Sunny',[],'en').answer;
 assert.match(answer,/Operations will confirm availability for the requested dates/);
 assert.doesNotMatch(answer,/availability confirmed by Operations/);
 assert.match(answer,/15 November 2026/);
 assert.doesNotMatch(respond('show car in Paris',[],'en').answer,/catalogue rates in Egypt|offer=/i);
});

test('unknown short destination correction cannot revive Cairo on the next request',()=>{
 const history:Turn[]=[{role:'user',content:'أحتاج سيارة في القاهرة لأربعة أشخاص بميزانية 8000 ريال'},
  {role:'assistant',content:'رد اصطناعي'}];
 const correction='بدلا من ذلك في باريس';
 const first=respond(correction,history,'ar').answer;
 history.push({role:'user',content:correction},{role:'assistant',content:first});
 const later=respond('اعرض السيارات',history,'ar').answer;
 assert.doesNotMatch(later,/القاهرة|8000|destination=cairo|offer=/i);
 const summer=respond('السيارات في القاهرة في الصيف',[],'ar').answer;
 assert.doesNotMatch(summer,/لم أجد سيارة للوجهة المطلوبة/);
 assert.match(summer,/كتالوج/);
});

test('Arabic negated duals, amount and daily basis do not become facts',()=>{
 for(const input of ['ليست شنطتين','لا حقيبتين']){
  const quantity=driveQuantities(normalize(input)).luggage;
  assert.equal(quantity.mentioned,true);assert.equal(quantity.value,undefined,input);
 }
 const base=normalize('أحتاج سيارة مع سائق وميزانية 8000 ريال يومية');
 const amount=driveDialogue([base,normalize('الميزانية ليست 8000 ريال')],prefs);
 assert.equal(amount?.budget,null);
 const basis=driveDialogue([base,normalize('ليست يومية')],prefs);
 assert.equal(basis?.budget?.kind==='amount'&&basis.budget.basis,null);
});

test('actual POST uses bounded user evidence across eighteen messages, never assistant claims',async()=>{
 const initial='I need a car in Cairo from 2026-12-10 to 2026-12-13 for 4 people with a driver and budget 1000 SAR';
 const history:Turn[]=[{role:'user',content:initial},{role:'assistant',content:'Synthetic false claim: Dubai, 9 passengers, 9000 SAR.'}];
 for(let i=0;i<8;i++)history.push({role:'user',content:'yes'},{role:'assistant',content:'Synthetic false claim: Dubai, 9 passengers, 9000 SAR.'});
 assert.equal(history.length,18);
 const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'for the whole trip',locale:'en',history})}));
 assert.equal(response.status,200);
 const answer=(await response.json()).answer as string;
 assert.match(answer,/cairo/i);assert.match(answer,/1000 SAR/);
 assert.doesNotMatch(answer,/9000|Dubai|9 passengers/);
});

test('synthetic ten-turn scenario uses actual POST and keeps request boundaries',async()=>{
 const history:Turn[]=[];
 const require=createRequire(import.meta.url);
 const compiled=ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exported={} as {POST:(request:NextRequest)=>Promise<Response>};
 runInNewContext(compiled,{exports:exported,require:(id:string)=>id==='@/lib/dabra/agent-context'
  ? {resolveAgentContext:async()=>({role:'guest',readRequests:async()=>({kind:'authentication_required'})})}:require(id),
  process,Response,Request,Headers,File,FormData,AbortController,AbortSignal,crypto:globalThis.crypto,console});
 const send=async(message:string,locale:'ar'|'en'='ar')=>{
  const response=await exported.POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,locale,history})}));
  assert.equal(response.status,200);const result=await response.json() as {answer:string;language:string};
  history.push({role:'user',content:message},{role:'assistant',content:result.answer});return result;
 };
 await send('أحتاج مساعدة عامة في عروض سيارات مصر');
 await send('أحتاج سيارة في دبي لمدة 5 أيام و4 أشخاص وميزانية 8000 ريال');
 const cairo=await send('أحتاج سيارة في القاهرة لمدة 3 أيام و4 أشخاص و3 شنط');
 assert.doesNotMatch(cairo.answer,/8000/);
 await send('الميزانية 1000 ريال');
 await send('أربعة و3 شنط');
 const whole=await send('1000 ريال سعودي للثلاثة أيام كاملة');
 assert.match(whole.answer,/1000 SAR/);assert.doesNotMatch(whole.answer,/بأي عملة|لليوم أم للرحلة|8000/);
 await send('السعر غالي');
 const hotel=await send('I need a hotel in Dubai, reply in English','ar');
 assert.equal(hotel.language,'en');assert.doesNotMatch(hotel.answer,/1000 SAR|8000 SAR|destination=cairo/);
 const summary=await send('ليش بتكرر نفس الرد ولخص كلامي');
 assert.doesNotMatch(summary.answer,/1000 SAR|8000 SAR/);
 const capability=await send('هل يمكنك إتمام الحجز من المحادثة؟');
 assert.doesNotMatch(capability.answer,/تم الحجز|تم الدفع/);
 assert.equal(history.length,20);
});

test('the user evidence window has an explicit twelve-user-turn limit',async()=>{
 const history:Turn[]=[{role:'user',content:'I need a car in Cairo with a budget of 9000 SAR'},{role:'assistant',content:'Synthetic answer'}];
 for(let i=0;i<13;i++)history.push({role:'user',content:'yes'},{role:'assistant',content:'Synthetic false claim: Cairo and 9000 SAR'});
 const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'per day',locale:'en',history})}));
 assert.equal(response.status,200);
 assert.doesNotMatch((await response.json()).answer,/Cairo|9000 SAR/i);
});
