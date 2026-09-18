import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as contract from '../lib/marketplace/stay-demo';
import * as mode from '../lib/marketplace/stay-demo-mode';
import type { StaySearchResult } from '../lib/travel/contracts';

const env = { DIR3COM_STAY_SANDBOX_ENABLED:'true', DIR3COM_STAY_SANDBOX_PROVIDERS:'liteapi', DIR3COM_STAY_SANDBOX_LOCAL:'true', LITEAPI_ENV:'sandbox', LITEAPI_TEST_API_KEY:'sand_unit_only' };
const params = new URLSearchParams({ destination:'Cairo',checkIn:'2027-01-12',checkOut:'2027-01-14',adults:'4',rooms:'2',currency:'SAR',nationality:'EG' });
const now = Date.parse('2026-09-19T00:00Z');
const query = contract.parseStayDemoQuery(params, now)!;
// Transport-only unit double; no test inventory is imported by application code.
const response: StaySearchResult = { provider:'liteapi', sandbox:true, status:'ok',hotels:[{id:'test-hotel',provider:'liteapi',name:'Unit hotel',address:'Unit address',rating:8.4,imageUrl:'javascript:alert(1)',rooms:[{id:'r',name:'Unit room',rates:[{id:'provider-offer',provider:'liteapi',roomName:'Room',currency:'SAR',totalAmount:'50',offerTotalAmount:'100',offerCurrency:'SAR',suggestedSellingAmount:'110',suggestedSellingCurrency:'SAR',refundable:false}]}]}] };
function serverFactory() {
  const exported: Record<string, unknown> = {};
  const imports: Record<string, unknown> = { 'server-only':{}, '../travel/liteapi/stays':{searchLiteApiHotels:()=>assert.fail('Network forbidden in unit test')}, './stay-demo-mode':mode, './stay-demo':contract };
  runInNewContext(ts.transpileModule(readFileSync('lib/marketplace/stay-demo-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:exported,require:(id:string)=>{assert.ok(id in imports);return imports[id];},process});
  return exported.createStayDemoSearch as (search:(...args:unknown[])=>Promise<StaySearchResult>, clock:()=>number)=>(q:typeof query,e:typeof env)=>Promise<contract.StayDemoResult>;
}
test('default denied; exact LiteAPI Sandbox allowlist and flag required in every deployment',()=>{
  assert.equal(mode.stayDemoEnabled({}),false);
  assert.equal(mode.stayDemoEnabled(env),true);
  for(const patch of [{DIR3COM_STAY_SANDBOX_ENABLED:'false'},{DIR3COM_STAY_SANDBOX_PROVIDERS:'liteapi,duffel'},{LITEAPI_ENV:'production'},{LITEAPI_TEST_API_KEY:'live_unit'},{VERCEL_ENV:'unknown'}])assert.equal(mode.stayDemoEnabled({...env,...patch}),false);
  assert.equal(mode.stayDemoEnabled({...env,VERCEL_ENV:'production',DIR3COM_STAY_SANDBOX_ENABLED:undefined}),false);
  assert.equal(mode.stayDemoEnabled({...env,VERCEL_ENV:'production'}),true);
});
test('query validates real calendar, future dates, occupancy, bounds and destination aliases',()=>{
  assert.ok(query);
  for(const patch of [{checkIn:'2027-02-30'},{checkIn:'2020-01-01'},{checkOut:'2027-01-12'},{checkOut:'2027-03-12'},{adults:'NaN'},{rooms:'5'},{adults:'1',rooms:'2'},{destination:'__proto__'},{currency:'XXX'},{nationality:'bad'}]){
    const p=new URLSearchParams(params);for(const [k,v] of Object.entries(patch))p.set(k,v);assert.equal(contract.parseStayDemoQuery(p,now),null,JSON.stringify(patch));
  }
  const p=new URLSearchParams(params);p.set('destination','القاهرة');assert.equal(contract.parseStayDemoQuery(p,now)?.destination,'Cairo');
});
test('existing Stay service search keeps city, guests, rooms, dates and submitted intent',()=>{
  const legacy='family=dir3-stay&service=stay&city=riyadh&guests=4&rooms=2&checkIn=2027-01-12&checkOut=2027-01-14';
  const normalized=new URLSearchParams(contract.normalizeStayDemoSearch(legacy));
  assert.equal(normalized.get('destination'),'Riyadh');assert.equal(normalized.get('adults'),'4');assert.equal(normalized.get('rooms'),'2');assert.equal(normalized.get('searched'),'1');
  assert.equal(contract.parseStayDemoQuery(normalized,now)?.destination,'Riyadh');
  assert.equal(contract.normalizeStayDemoSearch(normalized.toString()),normalized.toString());
  const unsupported=new URLSearchParams(contract.normalizeStayDemoSearch(legacy.replace('riyadh','unsupported').replace('guests=4','guests=99')));
  assert.equal(unsupported.get('destination'),'unsupported');assert.equal(unsupported.get('adults'),'99');assert.equal(contract.parseStayDemoQuery(unsupported,now),null);
  const explicit=new URLSearchParams(contract.normalizeStayDemoSearch(`${legacy}&destination=Cairo&adults=2`));
  assert.equal(explicit.get('destination'),'Cairo');assert.equal(explicit.get('adults'),'2');
  assert.equal(new URLSearchParams(contract.normalizeStayDemoSearch('family=dir3-stay')).has('searched'),false);
});
test('rooms preserve explicit allocation, currency and nationality without invented child ages',()=>{
  const input=contract.stayDemoProviderInput({...query,adults:5});
  assert.deepEqual(input.occupancies,[{adults:3},{adults:2}]);assert.equal(input.currency,'SAR');assert.equal(input.guestNationality,'EG');assert.equal(input.maxRatesPerHotel,1);
});
test('only actual sandbox provider data maps; unique20 hotel cap; exact identity and timestamp',()=>{
  const result=contract.stayDemoCards({...response,hotels:Array.from({length:25},(_,i)=>({...response.hotels[0],id:`hotel-${i}`}))},'2026-09-19T00:00:00Z',2);
  assert.equal(result.length,20);assert.equal(result[0].price,110);assert.equal(result[0].offerId,'provider-offer');assert.equal(result[0].retrievedAt,'2026-09-19T00:00:00Z');assert.equal(result[0].image,null);
  assert.equal(contract.stayDemoCards({...response,sandbox:false},'now').length,0);
  assert.equal(contract.stayDemoCards({...response,provider:'other'},'now').length,0);
  assert.equal(contract.stayDemoCards({...response,status:'unavailable'},'now').length,0);
  assert.equal(contract.stayDemoCards({...response,hotels:[...response.hotels,...response.hotels]},'now').length,1);
});
test('never invents missing/malformed price or multi-room totals',()=>{
  const data=structuredClone(response);const rate=data.hotels[0].rooms[0].rates[0];
  delete rate.suggestedSellingAmount;delete rate.offerTotalAmount;
  assert.equal(contract.stayDemoCards(data,'now',2).length,0);
  assert.equal(contract.stayDemoCards(data,'now',1)[0].price,50);
  rate.totalAmount='';assert.equal(contract.stayDemoCards(data,'now').length,0);
});
test('sort/filter uses returned prices/names only and preserves relevance order',()=>{
  const first=contract.stayDemoCards(response,'now')[0]; const cards=[first,{...first,hotelId:'second',name:'Other',price:10}];
  assert.equal(contract.filterStayDemoCards(cards,new URLSearchParams('sort=price-asc'))[0].hotelId,'second');
  assert.equal(contract.filterStayDemoCards(cards,new URLSearchParams('sort=price-desc'))[0].hotelId,'test-hotel');
  assert.equal(contract.filterStayDemoCards(cards,new URLSearchParams('maxPrice=15')).length,1);
  assert.equal(contract.filterStayDemoCards(cards,new URLSearchParams('hotelName=other')).length,1);
  assert.equal(cards[0].hotelId,'test-hotel');
  assert.equal(contract.filterStayDemoCards([{...first,currency:'USD',price:1}],new URLSearchParams('currency=SAR&maxPrice=15')).length,0);
});
test('search coalesces duplicates; cache keeps retrievedAt; expiry requests provider again',async()=>{
  let time=now,calls=0;const run=serverFactory()(async()=>{calls++;return response;},()=>time);
  const [a,b]=await Promise.all([run(query,env),run(query,env)]);assert.equal(calls,1);assert.equal(a.retrievedAt,b.retrievedAt);
  time+=30000;assert.equal((await run(query,env)).retrievedAt,a.retrievedAt);assert.equal(calls,1);
  time+=31000;await run(query,env);assert.equal(calls,2);
});
test('failure never returns stale/fake alternatives; bounded concurrency rejects other searches',async()=>{
  let release!:(value:StaySearchResult)=>void;
  const run=serverFactory()(()=>new Promise(resolve=>{release=resolve;}),()=>now);
  const first=run(query,env);assert.equal((await run({...query,adults:3},env)).status,'rate_limited');release(response);await first;
  const failing=serverFactory()(async()=>{throw new Error('PRIVATE_KEY_ERROR');},()=>now);
  const result=await failing(query,env);assert.equal(result.status,'unavailable');assert.equal(result.cards.length,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_KEY/);
});
test('server contract uses one bounded read, disabled config never calls provider',async()=>{
  let calls=0;const run=serverFactory()(async(_input,transport)=>{calls++;assert.equal((transport as {singleAttempt:boolean}).singleAttempt,true);assert.equal((transport as {timeoutMs:number}).timeoutMs,12000);return response;},()=>now);
  await run(query,{...env,DIR3COM_STAY_SANDBOX_ENABLED:'false'});assert.equal(calls,0);await run(query,env);assert.equal(calls,1);
});
test('unexpected provider or non-Sandbox response is unavailable, never live inventory',async()=>{
  for(const patch of [{sandbox:false},{provider:'other'}]){
    const result=await serverFactory()(async()=>({...response,...patch}),()=>now)(query,env);
    assert.equal(result.status,'unavailable');assert.equal(result.cards.length,0);
  }
});
test('GET route enforces closed flag, validates input, and preserves controlled HTTP states',async()=>{
  let enabled=false,calls=0,status:contract.StayDemoResult['status']='ok';
  const exported:Record<string,unknown>={};
  const imports:Record<string,unknown>={
    '@/lib/marketplace/stay-demo-mode':{stayDemoEnabled:()=>enabled},
    '@/lib/marketplace/stay-demo':{parseStayDemoQuery:(p:URLSearchParams)=>contract.parseStayDemoQuery(p,now)},
    '@/lib/marketplace/stay-demo-server':{searchStayDemo:async()=>{calls++;return {status,cards:[],retrievedAt:new Date(now).toISOString()};}},
  };
  runInNewContext(ts.transpileModule(readFileSync('app/api/marketplace/stay-sandbox/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:exported,require:(id:string)=>{assert.ok(id in imports);return imports[id];},URL,Response});
  const get=exported.GET as (r:Request)=>Promise<Response>;
  const request=new Request(`https://example.invalid/api/marketplace/stay-sandbox?${params}`);
  assert.equal((await get(request)).status,403);assert.equal(calls,0);
  enabled=true;assert.equal((await get(new Request('https://example.invalid/'))).status,400);assert.equal(calls,0);
  assert.equal((await get(request)).status,200);
  status='rate_limited';const busy=await get(request);assert.equal(busy.status,429);assert.equal(busy.headers.get('Retry-After'),'2');
  status='unavailable';const unavailable=await get(request);assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Cache-Control'),'private, no-store');
});
test('public detail is exactly scoped; UI has no transaction endpoint, labels are bilingual',()=>{
  const ui=readFileSync('components/stay/StaySandbox.tsx','utf8');
  assert.doesNotMatch(ui,/api\/(marketplace\/requests|.*book|.*pay)|supabase|LITEAPI_TEST_API_KEY/);
  assert.match(ui,/<button disabled/);assert.match(ui,/STAY_DEMO_NOTICE\[language\]/);assert.match(ui,/method="get"/);
  assert.match(contract.STAY_DEMO_NOTICE.ar,/غير قابلة للحجز أو الدفع/);assert.match(contract.STAY_DEMO_NOTICE.en,/no booking or payment/);
  assert.match(readFileSync('app/marketplace/page.tsx','utf8'),/query.inventory !== 'partners' && stayDemoEnabled/);
  assert.match(readFileSync('app/api/marketplace/stay-sandbox/route.ts','utf8'),/export async function GET/);
  assert.doesNotMatch(readFileSync('app/api/marketplace/stay-sandbox/route.ts','utf8'),/export async function POST/);
});
