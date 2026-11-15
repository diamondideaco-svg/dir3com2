import test from 'node:test';
import assert from 'node:assert/strict';
import type { FxSnapshot } from '../lib/currency/display';
import type { MarketplaceService } from '../lib/marketplace/data';
import { presentDabraPrice, sortDabraMarketPrices, summarizeDabraPrices, type DabraPricePolicy } from '../lib/dabra/marketplace-pricing';

const fx: FxSnapshot = {base:'USD', rates:{USD:1,SAR:3.75,EUR:0.9,EGP:50,AED:3.67}, asOf:'2026-11-15', expiresAt:Date.now()+60_000, provider:'frankfurter'};
const policy: DabraPricePolicy = {currency:'SAR',excludedCurrencies:['USD'],snapshot:null};
const item = (id:string, basePrice:number, currency:string) => ({id,basePrice,currency} as MarketplaceService);

test('source stays intact and a fresh snapshot converts; expired or excluded source is withheld',()=>{
  const source=item('a',100,'USD');
  assert.deepEqual(presentDabraPrice(source,{...policy,snapshot:fx}),{kind:'available',amount:375,currency:'SAR',converted:true,asOf:'2026-11-15',sourceFallback:false});
  assert.deepEqual(source,{id:'a',basePrice:100,currency:'USD'});
  assert.deepEqual(presentDabraPrice(source,{...policy,snapshot:{...fx,expiresAt:0}}),{kind:'unavailable'});
  assert.deepEqual(presentDabraPrice(source,policy),{kind:'unavailable'});
  assert.deepEqual(presentDabraPrice(item('b',100,'UNKNOWN'),policy),{kind:'unavailable'});
  assert.deepEqual(presentDabraPrice(item('c',0,'USD'),policy),{kind:'on_request'});
});

test('fallback is labelled only for an allowed source and quotes must match the chosen target',()=>{
  const source=item('a',100,'USD');
  assert.deepEqual(presentDabraPrice(source,{currency:'SAR',excludedCurrencies:[],snapshot:null}),{kind:'available',amount:100,currency:'USD',converted:false,asOf:null,sourceFallback:true});
  const quote={...source,displayPriceAmount:375,displayCurrency:'SAR',pricingStatus:'converted' as const};
  assert.equal(presentDabraPrice(quote,policy).kind,'available');
  assert.deepEqual(presentDabraPrice({...quote,displayCurrency:'EUR'},policy),{kind:'unavailable'});
  assert.deepEqual(presentDabraPrice({...quote,displayPriceAmount:NaN},policy),{kind:'unavailable'});
  assert.deepEqual(presentDabraPrice({...quote,pricingStatus:'conversion_unavailable'},policy),{kind:'unavailable'});
});

test('sorting and totals use only the same visible amounts without comparing different currencies',()=>{
  const rows=[item('usd',100,'USD'),item('sar-high',300,'SAR'),item('eur',10,'EUR'),item('sar-low',100,'SAR')];
  assert.deepEqual(sortDabraMarketPrices(rows,'price-low',policy).map(row=>row.id),['eur','sar-low','sar-high','usd']);
  assert.deepEqual(sortDabraMarketPrices(rows,'price-high',policy).map(row=>row.id),['eur','sar-high','sar-low','usd']);
  const prices=rows.map(row=>presentDabraPrice(row,policy));
  assert.deepEqual(summarizeDabraPrices(prices),{kind:'unavailable'});
  assert.deepEqual(summarizeDabraPrices(prices.slice(1)),{kind:'mixed',groups:[{currency:'SAR',amount:400},{currency:'EUR',amount:10}]});
  assert.deepEqual(summarizeDabraPrices([presentDabraPrice(item('x',1.25,'SAR'),policy),presentDabraPrice(item('y',2.5,'SAR'),policy)]),{kind:'total',currency:'SAR',amount:3.75});
});
