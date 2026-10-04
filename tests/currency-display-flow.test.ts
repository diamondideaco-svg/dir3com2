import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/currency/route';
import { POST } from '../app/api/ai2/chat/route';
import { clearCurrencyCacheForTests, convertCurrency, getCurrencySnapshot } from '../lib/currency/service';
import { displayPrice } from '../lib/currency/display';
import { findPlatformDriveOffers } from '../lib/dabra/platform-assistant';
const originalFetch=globalThis.fetch;
const rows=()=>Object.entries({SAR:3.75,EGP:50,EUR:0.9,AED:3.67}).map(([quote,rate])=>({base:'USD',quote,rate,date:new Date().toISOString().slice(0,10)}));
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test.afterEach(()=>{globalThis.fetch=originalFetch;clearCurrencyCacheForTests();});
test('thirty simultaneous conversions share one request and source money is preserved',async()=>{
 let calls=0;globalThis.fetch=async input=>{calls++;assert.equal(String(input),'https://api.frankfurter.dev/v2/rates?base=USD&quotes=SAR,EGP,EUR,AED');return json(rows());};
 const values=await Promise.all(Array.from({length:30},()=>convertCurrency({amount:140.25,sourceCurrency:'USD',targetCurrency:'SAR'})));
 assert.equal(calls,1);for(const value of values){assert.ok(value.ok);assert.equal(value.quote.amount,140.25);assert.equal(value.quote.convertedAmount,525.94);assert.equal(value.quote.source,'USD');assert.equal(value.quote.target,'SAR');}
 assert.equal((await convertCurrency({amount:50,sourceCurrency:'EGP',targetCurrency:'USD'})).quote.convertedAmount,1);
 assert.equal((await convertCurrency({amount:140.25,sourceCurrency:'USD',targetCurrency:'EGP'})).quote.convertedAmount,7012.5);
});
test('missing stale future duplicate negative and null rate payloads never become successful conversions',async()=>{
 for(const payload of [rows().slice(0,2), rows().map(r=>({...r,date:'2000-01-01'})),rows().map(r=>({...r,date:'2999-01-01'})),[...rows(),rows()[0]],rows().map(r=>({...r,rate:-1})),rows().map(r=>({...r,rate:null}))]){
  clearCurrencyCacheForTests();globalThis.fetch=async()=>json(payload);
  const value=await convertCurrency({amount:140.25,sourceCurrency:'USD',targetCurrency:'SAR'});
  assert.equal(value.ok,false);assert.equal(value.quote.live,false);assert.equal(value.quote.convertedAmount,140.25);assert.equal(value.quote.target,'USD');
 }
});
test('FX outage returns original currency, batches do not repeatedly hit a failed provider',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('offline');};
 await convertCurrency({amount:1,sourceCurrency:'USD',targetCurrency:'SAR'});await convertCurrency({amount:1,sourceCurrency:'USD',targetCurrency:'EGP'});
 assert.equal(calls,1);assert.deepEqual(displayPrice(140.25,'USD','SAR',null),{amount:140.25,currency:'USD',converted:false,unavailable:true,asOf:null});
});
test('public converter validates inputs and serves all supported target currencies without auth',async()=>{
 globalThis.fetch=async()=>json(rows());
 for(const code of ['SAR','USD','EGP','AED','EUR']){
  const response=await GET(new NextRequest(`http://localhost/api/currency?from=USD&to=${code}&amount=140.25`));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.ok,true);assert.equal(data.quote.target,code);
 }
 for(const tail of ['from=BTC&to=SAR&amount=1','from=USD&to=SAR&amount=-1','from=USD&to=SAR&amount=','from=USD&to=SAR&amount=Infinity']) assert.equal((await GET(new NextRequest('http://localhost/api/currency?'+tail))).status,400);
 assert.equal((await (await GET(new NextRequest('http://localhost/api/currency?rates=1'))).json()).snapshot.base,'USD');
});
test('selected currency reaches DABRA answer and internal handoff, only FX endpoint is called',async()=>{
 let calls=0;globalThis.fetch=async input=>{calls++;assert.ok(String(input).startsWith('https://api.frankfurter.dev/v2/rates?'));return json(rows());};
 for(const [currency,expected] of [['SAR','525.94 SAR'],['EGP','7012.50 EGP'],['USD','140.25 USD']]){
  const response=await POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'احجز جيتور T2 القاهرة',currency,locale:'ar'})}));
  const data=await response.json();assert.ok(data.answer.includes(expected));assert.ok(data.answer.includes(`currency=${currency}`));assert.doesNotMatch(data.answer,/https?:|Budget|Flynas|Saudia/);
 }
 assert.equal(calls,1);
 const snapshot=await getCurrencySnapshot();const matches=findPlatformDriveOffers('سيارة أقل من 250 ريال في القاهرة',{currency:'SAR',snapshot});
 assert.ok(matches.length>0);for(const offer of matches)assert.ok(displayPrice(offer.chauffeur,offer.currency,'SAR',snapshot).amount<=250);
});
