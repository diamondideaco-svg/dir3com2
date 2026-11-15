import test from 'node:test';
import assert from 'node:assert/strict';
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
