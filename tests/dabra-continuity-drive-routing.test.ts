import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as platform from './fixtures/task248-platform-request';
import PlatformAnswer from '../components/dabra/PlatformAnswer';
import { ContinuityContext } from '../lib/dabra/continuity-context';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';

// Execute actual displayed-results component with deterministic currency IO,
// not a source-pattern assertion or a browser/live-availability claim.
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../components/dabra/PlatformResults.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const exports = {} as {default:(props:import('react').ComponentProps<typeof import('../components/dabra/PlatformResults').default>)=>ReactElement};
let selectedCurrency = 'USD';
let rateSnapshot: {base:'USD';provider:'frankfurter';rates:{USD:number;SAR:number;EGP:number;EUR:number;AED:number};asOf:string;expiresAt:number}|null = null;
const dependencies:Record<string,unknown>={
  '@/components/currency/CurrencyPrice':{default:({amount,sourceCurrency}:{amount:number;sourceCurrency:string})=>createElement('span',null,`${amount} ${sourceCurrency}`)},
  '@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:selectedCurrency}),useCurrencyRates:()=>({snapshot:rateSnapshot,loading:false})},
  '@/components/dabra/DabraConversationProvider':{useOptionalDabraConversationSession:()=>null},
  'next/image':{default:({src,alt}:{src:string;alt:string})=>createElement('img',{src,alt})},
  './PlatformResults.module.css':{default:{}},
  './PlatformAnswer':{default:PlatformAnswer},
  '@/lib/dabra/platform-assistant':platform,
};
runInNewContext(compiled,{exports,require:(id:string)=>id in dependencies?dependencies[id]:require(id)},{filename:'PlatformResults.tsx'});
const trip:SavedTrip={id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:null,currency:'USD',families:['drive']};
const snapshot:ContinuitySnapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences:null,preferencesExpiresAt:null,trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null};
const rendered=(query:string|platform.PlatformUserRequest,language:'ar'|'en',trip:SavedTrip|null)=>{
 const session=platform.createPlatformMarketSession(),ticket=session.begin();
 const scope=typeof query==='string' ? {message:query,history:[],trip} : platform.platformUserRequestScope(query)!;
 const request=session.issue(ticket,{role:'user',content:scope.message},scope.history,scope.trip)!;
 const currencyPolicy=session.issueCurrencyPolicy(ticket,request,selectedCurrency as import('../lib/currency/display').DisplayCurrency,[],false)!;
 return renderToStaticMarkup(exports.default({request,language,family:'drive',currencyPolicy}));
};

for(const language of ['ar','en'] as const){
  for(const [origin,destination] of [['Cairo','Riyadh'],['Dubai','Jeddah'],['Cairo','Dubai'],['Cairo','Paris'],['القاهرة','الرياض']] as const){
    test(`${language} resumed Drive ${origin} to ${destination} excludes Egypt offers in assistant and displayed results`,()=>{
      const context=new ContinuityContext();context.capture('user:A',{...snapshot,trip:{...trip,origin,destination}},false,true);
      for(const message of language==='en'?['show cars','3 adults']:['اعرض السيارات','٣ اشخاص']){
        context.refine(message);
        const query=platform.platformContext(message,[],context.trip);
        assert.equal(platform.findPlatformDriveOffers(query,undefined,context.trip).length,0);
        const answer=platform.buildPlatformAssistantResponse(message,[],language,undefined,undefined,undefined,context.trip).answer;
        assert.doesNotMatch(answer,/offer=|matching options|\d+\.\d{2} USD/);
        assert.match(answer,language==='en'?/No car matches/:/لم أجد سيارة/);
        const html=rendered(query,language,context.trip);
        assert.doesNotMatch(html,/dabra-product-card|offer=|\d+\.\d{2} USD/);
        assert.match(html,/destination=/,'truthful discovery navigation remains available');
        assert.equal(context.trip?.origin,origin);
      }
    });
  }
  for(const destination of ['Cairo','Giza','Alexandria','القاهرة'])test(`${language} resumed Drive Egypt ${destination} withholds unverified passenger matches and preserves destination handoff`,()=>{
    const context=new ContinuityContext();context.capture('user:A',{...snapshot,trip:{...trip,origin:'Dubai',destination}},false,true);
    const message=language==='en'?'show cars':'اعرض السيارات';
    const query=platform.platformContext(message,[],context.trip);
    assert.equal(platform.findPlatformDriveOffers(query,undefined,context.trip).length,0,'supplier passenger capacity is not documented');
    const answer=platform.buildPlatformAssistantResponse(message,[],language,undefined,undefined,undefined,context.trip).answer;
    assert.doesNotMatch(answer,/offer=/);assert.match(answer,/destination=/);
    const html=rendered(query,language,context.trip);assert.doesNotMatch(html,/dabra-product-card|offer=/);assert.match(html,/destination=/);
    assert.equal(context.trip?.origin,'Dubai','foreign origin must not exclude Egypt destination');
  });
}
test('a saved multi-service foreign trip keeps its destination in the displayed Drive fallback',()=>{
  const context=new ContinuityContext();context.capture('user:A',{...snapshot,trip:{...trip,destination:'Dubai',families:['drive','stay']}},false,true);
  const query=platform.platformContext('show cars',[],context.trip);
  assert.equal(platform.findPlatformDriveOffers(query,undefined,context.trip).length,0);
  const html=rendered(query,'en',context.trip);
  assert.doesNotMatch(html,/dabra-product-card|offer=|\d+\.\d{2} USD/);
  assert.match(html,/No car matches/);
});
test('unstructured Drive geography fallback remains unchanged and explicit typed correction updates eligibility',()=>{
  assert.ok(platform.findPlatformDriveOffers('show cars').length>0);
  assert.ok(platform.findPlatformDriveOffers('cars in Cairo').length>0);
  assert.equal(platform.findPlatformDriveOffers('cars in Dubai').length,0);
  const context=new ContinuityContext();context.capture('user:A',snapshot,false,true);
  context.refine('cars in Cairo');assert.equal(platform.findPlatformDriveOffers('cars',undefined,context.trip).length,0,'known party cannot match unknown capacity');
  context.refine('instead in Riyadh');assert.equal(platform.findPlatformDriveOffers('cars',undefined,context.trip).length,0);
  context.forget();assert.equal(context.trip,null);
});


test('displayed car cards hide rejected source prices on missing FX and show valid conversion',()=>{
 selectedCurrency='SAR';rateSnapshot=null;
 try {
  const query='show cars in Cairo, do not use USD';
  const unavailable=rendered(query,'en',null);
  assert.match(unavailable,/dabra-product-card/);assert.match(unavailable,/Price in an accepted currency is unavailable/);
  assert.doesNotMatch(unavailable,/\b[\d,.]+\s+USD\b/);
  rateSnapshot={base:'USD',provider:'frankfurter',rates:{USD:1,SAR:3.75,EGP:50,EUR:.9,AED:3.67},asOf:'2026-11-15',expiresAt:Date.now()+60000};
  const converted=rendered(query,'en',null);
  assert.match(converted,/\b[\d,.]+\s+SAR\b/);assert.doesNotMatch(converted,/\b[\d,.]+\s+USD\b/);
 } finally {selectedCurrency='USD';rateSnapshot=null;}
});
