import * as platformModule from '../lib/dabra/platform-assistant';
import * as catalogModule from '../lib/drive/catalog';
import * as displayModule from '../lib/currency/display';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { readCustomerTripBudget, carryCustomerTripBudget } from '../lib/drive/customer-budget';
import { readDriveSearch } from '../lib/drive/search';
import { serviceEntryHref } from '../lib/marketplace/public-entry';
import * as budgetModule from '../lib/drive/customer-budget';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformScopeOwner, platformUserRequest, preparePlatformEntryForUserRequest, buildPlatformAssistantResponse } from '../lib/dabra/platform-assistant';

const sessions={
 ar:['أحتاج سيارة مع سائق في القاهرة لمدة ثلاثة أيام لشخصين. ميزانيتي ٩٠٠ ريال سعودي للرحلة كاملة، لا لليوم. لا تحجز.','قصدي تخطيط رحلة جديدة: سيارة مع سائق في القاهرة لمدة ٣ أيام لشخصين. الحد الأعلى ٩٠٠ ريال سعودي إجماليًا.','من ٨ إلى ١٠ ديسمبر ٢٠٢٦، لشخصين وبسقف ٩٠٠ ريال سعودي للرحلة كلها. لا أريد إنشاء أي طلب، وأخبرني إذا السعر الإجمالي أو التوفر غير مؤكد.'],
 en:['I need a car with a driver in Cairo for 3 days for 2 adults. Do not book.','New trip: car with a driver in Cairo for 2 people. My car budget is 900 SAR total for the whole trip.','8 to 10 December 2026, two passengers. My car budget is 900 SAR for the whole trip. Do not create any request. The total price and availability require Operations confirmation.'],
};
for(const locale of ['ar','en'] as const)test(`Task257 independent complete ${locale} dialogue retains customer trip-budget in review URL`,()=>{
 const owner=createPlatformScopeOwner();
 const history:{role:'user'|'assistant';content:string}[]=[];
 let href='';let finalAnswer='';
 for(const content of sessions[locale]){
  const request=platformUserRequest({role:'user',content},history,null,owner);
  const answer=buildPlatformAssistantResponse(request,[],locale,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;
  assert.match(answer,locale==='ar'?/القاهرة|الكتالوج/:/cairo|catalogue/i);
  href=preparePlatformEntryForUserRequest('drive',request,locale,'SAR').deliver();
  finalAnswer=answer;
  history.push({role:'user',content},{role:'assistant',content:answer});
 }
 const url=new URL(href,'https://local.invalid');

 assert.equal(url.searchParams.get('budgetAmount'),'900',finalAnswer+' '+href);
 assert.equal(url.searchParams.get('budgetCurrency'),'SAR');
 assert.equal(url.searchParams.get('budgetBasis'),'trip');
 assert.match(finalAnswer,/budgetAmount=900/,'the actual dialogue link must carry the same scalar requirement');
 assert.equal(url.searchParams.get('language'),locale);
 assert.doesNotMatch(href,/USER|account|email|token|content=|history=/i);
});

function summary(search:string,language:'ar'|'en') {
 const require=createRequire(import.meta.url);
 const output=ts.transpileModule(readFileSync(new URL('../components/drive/CustomerTripBudget.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={} as {default:(props:{search:string;language:'ar'|'en'})=>ReactElement};
 runInNewContext(output,{exports,require:(id:string)=>id==='@/lib/drive/customer-budget'?budgetModule:require(id),URLSearchParams});
 return renderToStaticMarkup(exports.default({search,language}));
}
for(const locale of ['ar','en'] as const)test(`Task257 readonly review summary and display-currency independence: ${locale}`,()=>{
 const original=new URLSearchParams('budgetAmount=900&budgetCurrency=SAR&budgetBasis=trip');
 const target=carryCustomerTripBudget(new URLSearchParams('currency=EGP&pickup=cairo'),original);
 assert.deepEqual(readCustomerTripBudget(target),{kind:'requirement',amount:'900',currency:'SAR',basis:'trip'});
 const html=summary(target.toString(),locale);
 assert.match(html,/900 SAR/);assert.match(html,locale==='ar'?/للرحلة كاملة، وليس لليوم/:/whole trip, not per day/);
 assert.match(html,locale==='ar'?/ليس عرض سعر أو ضمان توفر/:/not a quote or availability guarantee/);
 assert.match(html,new RegExp(`dir="${locale==='ar'?'rtl':'ltr'}"`));
 assert.doesNotMatch(html,/<form|<button|<input|<textarea|<script/);
 assert.equal('budgetAmount' in readDriveSearch(target),false,'requirements do not become a search price or server request field');
 for(const file of ['DriveMarketplace.tsx','DriveDeal.tsx'])assert.match(readFileSync(new URL('../components/drive/'+file,import.meta.url),'utf8'),/<CustomerTripBudget search=\{initialSearch\} language=\{language\}/);
});
for(const [label,query] of [
 ['partial','budgetAmount=900'],['duplicate','budgetAmount=900&budgetAmount=900&budgetCurrency=SAR&budgetBasis=trip'],
 ['negative','budgetAmount=-1&budgetCurrency=SAR&budgetBasis=trip'],['zero','budgetAmount=0&budgetCurrency=SAR&budgetBasis=trip'],
 ['nan','budgetAmount=NaN&budgetCurrency=SAR&budgetBasis=trip'],['infinity','budgetAmount=Infinity&budgetCurrency=SAR&budgetBasis=trip'],
 ['exponent','budgetAmount=9e2&budgetCurrency=SAR&budgetBasis=trip'],['precision','budgetAmount=900.001&budgetCurrency=SAR&budgetBasis=trip'],
 ['too large','budgetAmount=1000000000&budgetCurrency=SAR&budgetBasis=trip'],['currency','budgetAmount=900&budgetCurrency=XXX&budgetBasis=trip'],
 ['basis','budgetAmount=900&budgetCurrency=SAR&budgetBasis=day'],['private text','budgetAmount=PRIVATE_SYNTHETIC_TEXT&budgetCurrency=SAR&budgetBasis=trip'],
] as const)test('Task257 invalid requirement remains closed: '+label,()=>{
 const input=new URLSearchParams(query);assert.equal(readCustomerTripBudget(input).kind,'invalid');
 const carried=carryCustomerTripBudget(new URLSearchParams(),input);assert.equal(readCustomerTripBudget(carried).kind,'invalid');
 for(const locale of ['ar','en'] as const){const html=summary(query,locale);assert.doesNotMatch(html,/900 SAR|PRIVATE_SYNTHETIC_TEXT/);assert.match(html,locale==='ar'?/تعذر التحقق/:/could not be verified/);}
});
test('Task257 absent requirement is not invented and only Drive carries validated scalar fields',()=>{
 assert.deepEqual(readCustomerTripBudget(new URLSearchParams()),{kind:'absent'});
 assert.equal(summary('', 'ar'),'');assert.equal(summary('', 'en'),'');
 const params=new URLSearchParams('budgetAmount=900&budgetCurrency=SAR&budgetBasis=trip&token=PRIVATE_SYNTHETIC_TEXT&history=PRIVATE_SYNTHETIC_TEXT&searched=1');
 const href=serviceEntryHref('drive',params);assert.match(href,/budgetAmount=900/);assert.doesNotMatch(href,/token|history|PRIVATE_SYNTHETIC_TEXT|searched=/);
 assert.doesNotMatch(serviceEntryHref('stay',params),/budgetAmount|budgetCurrency|budgetBasis/);
});
for(const locale of ['ar','en'] as const)test(`Task257 ambiguous or unrelated budgets do not become a customer trip requirement: ${locale}`,()=>{
 const phrases=locale==='ar'?[
 'أريد سيارة مع سائق في القاهرة. إذا وافقت ميزانيتي ٩٠٠ ريال للرحلة كاملة.',
 'أريد سيارة مع سائق في القاهرة. ميزانية الفندق ٩٠٠ ريال للرحلة كاملة.',
 'أريد سيارة مع سائق في القاهرة. ميزانيتي ٩٠٠ أو ١٢٠٠ ريال للرحلة كاملة.',
 'لا أريد سيارة. ميزانيتي ٩٠٠ ريال للرحلة كاملة.',
 ]:[
 'I need a car with a driver in Cairo. If approved, my car budget is 900 SAR for the whole trip.',
 'I need a car with a driver in Cairo. My hotel budget is 900 SAR for the whole trip.',
 'I need a car with a driver in Cairo. My car budget is 900 or 1200 SAR for the whole trip.',
 'No car. My budget is 900 SAR for the whole trip.',
 ];
 for(const content of phrases){const owner=createPlatformScopeOwner();const req=platformUserRequest({role:'user',content},[],null,owner);const href=preparePlatformEntryForUserRequest('drive',req,locale,'SAR').deliver();assert.doesNotMatch(href,/budgetAmount=/,content);}
});
test('Task257 stale delivery drops requirements and assistant text cannot supply them',()=>{
 const owner=createPlatformScopeOwner();const req=platformUserRequest({role:'user',content:'I need a car with a driver in Cairo. My car budget is 900 SAR for the whole trip.'},[],null,owner);
 const delivery=preparePlatformEntryForUserRequest('drive',req,'en','SAR');assert.match(delivery.deliver(),/budgetAmount=900/);owner.invalidate();assert.doesNotMatch(delivery.deliver(),/budgetAmount=/);
 const other=platformUserRequest({role:'user',content:'Show cars in Cairo with a driver'},[{role:'assistant',content:'My car budget is 900 SAR for the whole trip.'}],null,createPlatformScopeOwner());assert.doesNotMatch(preparePlatformEntryForUserRequest('drive',other,'en','SAR').deliver(),/budgetAmount=/);
});

for(const locale of ['ar','en'] as const)test(`Task257 separate ${locale} catalogue matcher preserves the undocumented-capacity guard`,()=>{
 const content=locale==='ar'?'أريد سيارة مع سائق في القاهرة من ٨ إلى ١٠ ديسمبر ٢٠٢٦ لشخصين. الميزانية مفتوحة. اعرض الكتالوج فقط ولا تحجز.':'I need a car with a driver in Cairo from 2026-12-08 to 2026-12-10 for 2 passengers. No fixed budget. Show the catalogue only. Do not book.';
 const session=platformModule.createPlatformMarketSession();const ticket=session.begin();const req=session.issue(ticket,{role:'user',content},[],null);assert.ok(req);
 const policy=session.issueCurrencyPolicy(ticket,req,'SAR',[],false);assert.ok(policy);
 const require=createRequire(import.meta.url);const jsx=require('react/jsx-runtime');
 const deps:Record<string,unknown>={
  '@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'SAR'}),useCurrencyRates:()=>({snapshot:null,loading:false})},
  '@/lib/dabra/platform-assistant':platformModule,'@/lib/drive/catalog':catalogModule,'@/lib/currency/display':displayModule,
  'next/image':{default:(props:Record<string,unknown>)=>jsx.jsx('img',props)},'./PlatformAnswer':{default:({text}:{text:string})=>jsx.jsx('div',{children:text})},'./PlatformResults.module.css':{default:{}},
 };
 const output=ts.transpileModule(readFileSync(new URL('../components/dabra/PlatformResults.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={} as {default:(props:Record<string,unknown>)=>ReactElement};runInNewContext(output,{exports,require:(id:string)=>id in deps?deps[id]:require(id),URLSearchParams});
 const html=renderToStaticMarkup(exports.default({request:req,language:locale,family:'drive',currencyPolicy:policy}));
 assert.equal((html.match(/<article/g)??[]).length,0);
 assert.match(html,locale==='ar'?/سعة ركاب موثقة/:/documented capacity/);
 assert.doesNotMatch(html,/budgetAmount=|booking confirmed|تم الحجز/);
});

for(const locale of ['ar','en'] as const)test(`Task257 independent public catalogue cards remain daily and unconfirmed: ${locale}`,()=>{
 const require=createRequire(import.meta.url);const jsx=require('react/jsx-runtime');
 const deps:Record<string,unknown>={
  react:{useState:(initial:unknown)=>[typeof initial==='function'?initial():initial,()=>{throw Error('no state action authorized');}],useEffect:()=>{}},
  'next/image':{default:(props:Record<string,unknown>)=>jsx.jsx('img',props)},'next/link':{default:({children,...props}:Record<string,unknown>)=>jsx.jsx('a',{...props,children})},'next/navigation':{useRouter:()=>({push:()=>{throw Error('no navigation authorized');}})},
  '@/components/currency/CurrencyPrice':{default:({amount,sourceCurrency}:{amount:number;sourceCurrency:string})=>jsx.jsx('bdi',{children:String(amount)+' '+sourceCurrency})},
  '@/components/currency/useExplicitDisplayCurrency':{useExplicitDisplayCurrency:()=>({currency:'SAR',setCurrency:()=>{throw Error('no setting change authorized');}})},
  '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale,direction:locale==='ar'?'rtl':'ltr'})},
  '@/components/public/MarketplaceNavigation':{default:()=>null},'./CustomerTripBudget':{default:()=>null},'./drive.module.css':{default:{}},
 };
 const output=ts.transpileModule(readFileSync(new URL('../components/drive/DriveMarketplace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={} as {default:(props:{initialSearch:string})=>ReactElement};runInNewContext(output,{exports,require:(id:string)=>id in deps?deps[id]:require(id),URLSearchParams});
 const html=renderToStaticMarkup(exports.default({initialSearch:''}));
 assert.equal((html.match(/<article/g)??[]).length,catalogModule.DRIVE_OFFERS.length);
 assert.match(html,locale==='ar'?/يوم مع سائق/:/chauffeur day/);assert.match(html,locale==='ar'?/طلب للتأكيد/:/Request to confirm/);
 assert.doesNotMatch(html,/budgetAmount=|booking confirmed|تم الحجز/);
});

// Actual DABRA response link -> actual Drive form render; effects/actions forbidden.
for(const locale of ['ar','en'] as const)test(`Task257 variable 800 SAR requirement reaches the actual ${locale} Drive review form`,()=>{
 const owner=createPlatformScopeOwner();const history:{role:'user'|'assistant';content:string}[]=[];
 let answer='';
 for(const content of sessions[locale].map(value=>value.replaceAll('900','800').replaceAll('٩٠٠','٨٠٠'))){
  const request=platformUserRequest({role:'user',content},history,null,owner);
  answer=buildPlatformAssistantResponse(request,[],locale,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;
  history.push({role:'user',content},{role:'assistant',content:answer});
 }
 const href=answer.match(/\]\((\/marketplace\?[^)]+)\)/)?.[1];assert.ok(href,answer);
 const search=new URL(href,'https://local.invalid').search.slice(1);
 assert.match(search,/budgetAmount=800/);assert.doesNotMatch(search,/budgetAmount=900/);
 const require=createRequire(import.meta.url);const jsx=require('react/jsx-runtime');
 const compile=(file:string,deps:Record<string,unknown>)=>{
  const output=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={} as {default:(props:Record<string,unknown>)=>ReactElement};
  runInNewContext(output,{exports,require:(id:string)=>id in deps?deps[id]:require(id),URLSearchParams});return exports.default;
 };
 const Budget=compile('../components/drive/CustomerTripBudget.tsx',{'@/lib/drive/customer-budget':budgetModule});
 const deps:Record<string,unknown>={
  react:{useState:(initial:unknown)=>[typeof initial==='function'?initial():initial,()=>{throw Error('no state action authorized');}],useEffect:()=>{}},
  'next/image':{default:(props:Record<string,unknown>)=>jsx.jsx('img',props)},'next/link':{default:({children,...props}:Record<string,unknown>)=>jsx.jsx('a',{...props,children})},'next/navigation':{useRouter:()=>({push:()=>{throw Error('no navigation authorized');}})},
  '@/components/currency/CurrencyPrice':{default:()=>null},
  '@/components/currency/useExplicitDisplayCurrency':{useExplicitDisplayCurrency:()=>({currency:'SAR',setCurrency:()=>{throw Error('no setting change authorized');}})},
  '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale,direction:locale==='ar'?'rtl':'ltr'})},
  '@/components/public/MarketplaceNavigation':{default:()=>null},'./CustomerTripBudget':{default:Budget},'./drive.module.css':{default:{}},
 };
 const Review=compile('../components/drive/DriveMarketplace.tsx',deps);
 const html=renderToStaticMarkup(Review({initialSearch:search}));
 assert.match(html,/<bdi>800 SAR<\/bdi>/);assert.doesNotMatch(html,/<bdi>900 SAR<\/bdi>/);
 assert.match(html,locale==='ar'?/للرحلة كاملة، وليس لليوم/:/for the whole trip, not per day/);
 assert.match(html,locale==='ar'?/ليس عرض سعر أو ضمان توفر/:/not a quote or availability guarantee/);
 assert.match(html,locale==='ar'?/موقع الاستلام/:/Pickup: city/);
 assert.match(html,locale==='ar'?/dir="rtl"/:/dir="ltr"/);
});
