import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformAnswer,{platformLinkAllowed} from '../components/dabra/PlatformAnswer';
import {createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse,preparePlatformEntryForUserRequest,platformFamilies,normalizePlatformQuery} from '../lib/dabra/platform-assistant';
import {driveQuantities} from '../lib/dabra/drive-planning';
import {driveHandoffForUsers,applyDriveHandoff,airportDriveService,withoutDriveEndpointPlaces} from '../lib/dabra/drive-handoff';
function session(turns:string[],language:'ar'|'en') {
 const owner=createPlatformScopeOwner(),history:{role:'user'|'assistant';content:string}[]=[];
 let answer='',href='';
 for(const content of turns) {
  const request=platformUserRequest({role:'user',content},history,null,owner);
  answer=buildPlatformAssistantResponse(request,[],language,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;
  href=preparePlatformEntryForUserRequest('drive',request,language,'SAR').deliver();
  history.push({role:'user',content},{role:'assistant',content:answer});
 }
 return {answer,href,actual:answer.match(/\]\((\/marketplace[^)]+)\)/)?.[1]??''};
}
for(const language of ['ar','en'] as const)for(const amount of [800,900])test('same-language complete chauffeur handoff '+language+amount,()=>{
 const turns=language==='ar'?[
  `أحتاج سيارة مع سائق في القاهرة لمدة يومين، لشخصين بالغين ومعنا شنطتان كبيرتان. ميزانيتي الإجمالية ${amount} ريال سعودي للرحلة كاملة، لا لليوم. لا تحجز ولا تنشئ طلبًا.`,
  'الاستلام من فندق التحرير في القاهرة يوم 2026-12-08 الساعة 09:15. التسليم في مطار القاهرة يوم 2026-12-09 الساعة 18:30، وهو موقع مختلف.',
  'أريد رابط مراجعة متطلبات السيارة مع سائق ليومين بنفس التفاصيل، لا توصيلة مطار ولا إنشاء طلب.'
 ]:[
  `I need a car with a driver in Cairo for two days, for two adults with two large bags. My car budget is ${amount} SAR total for the whole trip, not per day. Do not book or create a request.`,
  'Pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15. Drop off at Cairo Airport on 2026-12-09 at 18:30; the drop-off location is different.',
  'Show the requirements review link for the same two-day car with a driver, not an airport transfer, keeping these details. Do not submit.'
 ];
 const result=session(turns,language);assert.ok(result.actual,result.answer);assert.equal(result.actual,result.href);
 const p=new URL(result.actual,'https://local.invalid').searchParams;
 assert.equal(p.get('budgetAmount'),String(amount));assert.equal(p.get('budgetCurrency'),'SAR');assert.equal(p.get('budgetBasis'),'trip');
 assert.equal(p.get('passengers'),'2');assert.equal(p.get('luggage'),'2');assert.equal(p.get('mode'),'chauffeur');
 assert.equal(p.get('pickupAt'),'2026-12-08T09:15');assert.equal(p.get('returnAt'),'2026-12-09T18:30');assert.equal(p.get('language'),language);
 assert.match(p.get('pickup')??'',language==='ar'?/فندق التحرير/:/Tahrir Hotel/);
 assert.match(p.get('dropoff')??'',language==='ar'?/مطار القاهرة/:/Cairo Airport/);assert.notEqual(p.get('pickup'),p.get('dropoff'));
 assert.equal(platformLinkAllowed(result.actual),true);
 assert.match(renderToStaticMarkup(createElement(PlatformAnswer,{text:result.answer})),/<a[^>]+href=/);
 assert.doesNotMatch(result.href,/content=|history=|token=|account=|execute=|confirmed=/i);
 assert.match(result.answer,language==='ar'?/تؤكد|تأكيد/:/confirms|verify/i);
});
test('hotel endpoint masking preserves independently requested Stay and its financial scope',()=>{
 assert.deepEqual(platformFamilies('Pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15'),[]);
 assert.ok(platformFamilies('Pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15. I need a hotel too.').includes('stay'));
 assert.match(withoutDriveEndpointPlaces('Pick up at the hotel budget office. My hotel budget is 900 SAR.'),/hotel budget/);
 for(const phrase of ['My hotel budget is 900 SAR for the whole trip.','If approved, my car budget is 900 SAR for the whole trip.','No car. My budget is 900 SAR for the whole trip.']) {
  const result=session(['I need a car with a driver in Cairo. Pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15.',phrase],'en');
  assert.doesNotMatch(result.href,/budgetAmount=900/,phrase);
 }
});
test('endpoint dates, times and uncertainty remain editable requirements with no fabricated values',()=>{
 for(const phrase of [
  'If approved, pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15.',
  'Pick up at Tahrir Hotel or another hotel on 2026-12-08 at 09:15.',
  'Pick up at Tahrir Hotel in Cairo on 2026-02-30 at 25:88.',
 ]) {
  const p=new URLSearchParams('pickupDate=2026-12-08');
  applyDriveHandoff(p,driveHandoffForUsers([phrase]));assert.equal(p.has('pickupAt'),false,phrase);
 }
 const p=new URLSearchParams();
 applyDriveHandoff(p,driveHandoffForUsers(['Pick up at Tahrir Hotel in Cairo on 2026-12-08.']));
 assert.equal(p.get('pickupDate'),'2026-12-08');assert.equal(p.has('pickupAt'),false);
});
test('airport endpoint/refusal does not choose transfer rates while explicit transfer remains supported',()=>{
 for(const text of ['Pick up at Cairo Airport on 2026-12-08 at 09:15.','A two-day car with a driver, not an airport transfer.','لا توصيلة مطار، سيارة مع سائق ليومين.'])assert.equal(airportDriveService(text),false,text);
 for(const text of ['I need an airport transfer in Cairo.','أريد توصيلة مطار.'])assert.equal(airportDriveService(text),true,text);
});
test('dropoff links remain Drive-only and singleton bounded customer input',()=>{
 const prefix='/marketplace?family=dir3-drive&dropoff=';
 assert.equal(platformLinkAllowed(prefix+'Cairo+Airport'),true);
 for(const href of [prefix+'x',prefix+'x'.repeat(201),prefix+'Cairo%0AAirport',prefix+'Cairo&dropoff=Giza',prefix+'Cairo&execute=1',prefix.replace('dir3-drive','dir3-stay')+'Cairo'])assert.equal(platformLinkAllowed(href),false,href);
});
test('qualified luggage and explicit adult apposition retain nonexact/count boundaries',()=>{
 assert.equal(driveQuantities(normalizePlatformQuery('لشخصين بالغين ومعنا شنطتان كبيرتان')).party.value,2);
 for(const text of ['two large bags','two small suitcases','شنطتان كبيرتان'])assert.equal(driveQuantities(normalizePlatformQuery(text)).luggage.value,2,text);
 for(const text of ['at least two large bags','two or three large bags','not two large bags','perhaps two large bags','ربما شنطتان كبيرتان'])assert.equal(driveQuantities(normalizePlatformQuery(text)).luggage.value,undefined,text);
});

test('neutral catalogue browsing does not invent a service-mode query while explicit services remain intact',()=>{
 for(const content of ['car Cairo','Nissan Sunny Cairo','سيارات القاهرة']) {
  const request=platformUserRequest({role:'user',content},[],null,createPlatformScopeOwner());
  const href=preparePlatformEntryForUserRequest('drive',request,'en').deliver();
  assert.ok(href);assert.equal(new URL(href,'http://local.invalid').searchParams.has('mode'),false);
 }
 for(const [content,mode]of [['I need a car with a driver in Cairo.','chauffeur'],['I need an airport transfer in Cairo.','airport']]as const) {
  const p=new URLSearchParams();applyDriveHandoff(p,driveHandoffForUsers([content]));assert.equal(p.get('mode'),mode);
 }
 const neutral=new URLSearchParams('mode=airport');
 applyDriveHandoff(neutral,driveHandoffForUsers(['car Cairo']));
 assert.equal(neutral.has('mode'),false,'unowned legacy mode must not be promoted');
});
