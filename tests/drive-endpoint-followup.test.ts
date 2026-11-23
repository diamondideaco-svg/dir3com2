import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse} from '../lib/dabra/platform-assistant';
function answer(turns:string[],language:'ar'|'en'){
 const history:{role:'user'|'assistant';content:string}[]=[],owner=createPlatformScopeOwner();
 let text='';
 for(const content of turns){text=buildPlatformAssistantResponse(platformUserRequest({role:'user',content},history,null,owner),[],language,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;history.push({role:'user',content},{role:'assistant',content:text});}
 const href=text.match(/\]\((\/marketplace[^)]+)\)/)?.[1]??'';
 return{text,href,params:new URL(href||'/','http://local.invalid').searchParams};
}
for(const language of ['ar','en']as const)for(const amount of [800,900])test('endpoint-only second reply retains whole-trip customer requirement '+language+amount,()=>{
 const turns=language==='ar'?[
  'أحتاج سيارة مع سائق في القاهرة لمدة يومين، لشخصين بالغين ومعنا شنطتان كبيرتان. ميزانيتي الإجمالية '+amount+' ريال سعودي للرحلة كاملة، لا لليوم. لا تحجز ولا تنشئ طلبًا.',
  'الاستلام من فندق التحرير في القاهرة يوم 2026-12-08 الساعة 09:15. التسليم في مطار القاهرة يوم 2026-12-09 الساعة 18:30، وهو موقع مختلف.'
 ]:[
  'I need a car with a driver in Cairo for two days, for two adults with two large bags. My car budget is '+amount+' SAR total for the whole trip, not per day. Do not book or create a request.',
  'Pick up at Tahrir Hotel in Cairo on 2026-12-08 at 09:15. Drop off at Cairo Airport on 2026-12-09 at 18:30; the drop-off location is different.'
 ];
 const result=answer(turns,language),p=result.params;
 assert.doesNotMatch(result.text,/لم أجد سيارة للوجهة المطلوبة|No car matches the requested destination/);
 assert.equal(p.get('budgetAmount'),String(amount));assert.equal(p.get('budgetCurrency'),'SAR');assert.equal(p.get('budgetBasis'),'trip');
 assert.equal(p.get('luggage'),'2');assert.equal(p.get('passengers'),'2');assert.equal(p.get('mode'),'chauffeur');assert.equal(p.get('language'),language);
 assert.equal(p.get('pickupAt'),'2026-12-08T09:15');assert.equal(p.get('returnAt'),'2026-12-09T18:30');
 assert.notEqual(p.get('pickup'),p.get('dropoff'));assert.ok(p.get('dropoff'));
});
test('a genuine unknown current destination remains guarded',()=>{
 const result=answer(['I need a car with a driver in Cairo. My car budget is 900 SAR for the whole trip.','Pick up at Tanta Hotel in Tanta on 2026-12-08 at 09:15.'],'en');
 assert.doesNotMatch(result.href,/budgetAmount=900/);
});
test('competing current endpoint cities do not inherit a confirmed budget link',()=>{
 const result=answer(['I need a car with a driver in Cairo. My car budget is 900 SAR for the whole trip.','Pick up at Cairo or Riyadh on 2026-12-08 at 09:15.'],'en');
 assert.doesNotMatch(result.href,/budgetAmount=900/);
});
test('conditional endpoint details are not promoted to confirmed handoff times',()=>{
 const result=answer(['I need a car with a driver in Cairo. My car budget is 900 SAR for the whole trip.','If approved, pick up at Cairo Hotel on 2026-12-08 at 09:15.'],'en');
 assert.equal(result.params.has('pickupAt'),false);
});
