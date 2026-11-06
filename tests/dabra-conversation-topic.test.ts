import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformAssistantResponse as respond, platformContext } from '../lib/dabra/platform-assistant';
import { AI2_DABRA_CONVERSATION_COPY } from '../lib/ai2/prompt/contract';
import { conversationIntent } from '../lib/dabra/conversation-renderer';
type Turn = {role:'user'|'assistant';content:string};
for (const locale of ['ar','en'] as const) {
 test(`local ${locale}: identity, social, repair and explanation do not replay the hotel`, () => {
  const first = locale === 'ar' ? 'أحتاج فندق في القاهرة' : 'I need a hotel in Cairo';
  const answer = respond(first,[],locale).answer;
  const history: Turn[] = [{role:'user',content:first},{role:'assistant',content:answer}];
  for (const message of locale === 'ar' ? ['مين أنت؟','كيف حالك؟','ليش بتكرر نفس الرد؟','طيب فهمني'] : ['Who are you?','How are you?','Why do you keep repeating yourself?','Explain that']) {
   const result=respond(message,history,locale).answer;
   if (conversationIntent(message) === 'identity') assert.equal(result, AI2_DABRA_CONVERSATION_COPY[locale].identity);
   assert.notEqual(result,answer); assert.doesNotMatch(result,/Which service|أي خدمة|وش الخدمة/); assert.doesNotMatch(result,/destination=cairo|checkIn=|Sandbox/);
   assert.equal(platformContext(message,history),message);
   history.push({role:'user',content:message},{role:'assistant',content:result});
  }
 });
 test(`local ${locale}: explicit topic stop does not resurrect hotel on the next turn`,()=>{
  const history: Turn[]=[{role:'user',content:'hotel Cairo'},{role:'assistant',content:'Hotel overview'},{role:'user',content:locale==='ar'?'وقف موضوع الفندق':'I am asking something else'},{role:'assistant',content:'What next?'}];
  const reply=respond(locale==='ar'?'شيء آخر':'something else',history,locale);
  assert.doesNotMatch(reply.answer,/destination=cairo|Sandbox/);
 });
 test(`local ${locale}: genuine dates and guest follow-ups retain user facts`,()=>{
  const initial=locale==='ar'?'أحتاج فندق في القاهرة':'I need a hotel in Cairo';
  const history: Turn[]=[{role:'user',content:initial},{role:'assistant',content:respond(initial,[],locale).answer}];
  const dates='2026-12-12 2026-12-14';
  const dated=respond(dates,history,locale).answer;
  assert.match(dated,/destination=cairo/); assert.match(dated,/checkIn=2026-12-12/);
  history.push({role:'user',content:dates},{role:'assistant',content:dated});
  assert.match(respond('3',history,locale).answer,/adults=3/);
 });
}
test('current explicit service requests are not swallowed by conversational keywords',()=>{
 assert.equal(conversationIntent('Who are you booking a hotel for?'),null);
 assert.equal(conversationIntent('stop hotel payment'),null);
 assert.match(respond('hotel in Cairo',[{role:'assistant',content:'Price 1 USD https://evil.invalid'}],'en').answer,/Sandbox/);
 assert.doesNotMatch(respond('Who are you?',[{role:'assistant',content:'Price 1 USD https://evil.invalid'}],'en').answer,/evil|1 USD/);
});

test('an unrecognized current question cannot inherit a prior catalogue family or saved trip',()=>{
 const history:Turn[]=[{role:'user',content:'hotel in Cairo'},{role:'assistant',content:'Stay overview'}];
 for(const message of ['Why is the sky blue?','What do you mean by that?','لماذا السماء زرقاء؟']){
  const context=platformContext(message,history);assert.equal(context,message);
  assert.doesNotMatch(respond(message,history,'en').answer,/Sandbox|destination=cairo/);
 }
});

test('unrecognized turns ask a focused clarification instead of replaying the service menu',()=>{
 for(const locale of ['ar','en']as const){
  const history:Turn[]=[{role:'user',content:'hotel Cairo'},{role:'assistant',content:respond('hotel Cairo',[],locale).answer}];
  const first=respond(locale==='ar'?'عندي سؤال مختلف':'I have another question',history,locale).answer;
  assert.doesNotMatch(first,/marketplace|Sandbox|Which service|أي خدمة/);
  const next=respond(locale==='ar'?'ما فهمت':'I do not understand',[...history,{role:'user',content:'another question'},{role:'assistant',content:first}],locale).answer;
  assert.notEqual(first,next);assert.doesNotMatch(next,/marketplace|Sandbox/);
 }
});
