import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
// Executes actual components with synthetic IO. Adapted from the independent Task208 gap proof.
const owner = process.cwd().replaceAll('\\', '/');
const req = createRequire(owner + '/package.json');
const ts = req('typescript');
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
import path from 'node:path';
const sourceCache = new Map();
function loadSource(file) {
 if (!path.extname(file)) file += '.ts';
 if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file,'utf8'));
 if (sourceCache.has(file)) return sourceCache.get(file).exports;
 const compiledModule={exports:{}};sourceCache.set(file,compiledModule);
 const localRequire=name=>name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):name.startsWith('.')?loadSource(path.resolve(path.dirname(file),name)):req(name);
 vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{module:compiledModule,exports:compiledModule.exports,require:localRequire,crypto:globalThis.crypto,AbortController,AbortSignal,Date,URL,URLSearchParams,console,process});
 return compiledModule.exports;
}
const {ConversationSession} = loadSource(owner + '/lib/dabra/conversation-session.ts');
const fixtureRequire=name=>name.startsWith(owner+'/')?loadSource(name):req(name);

// Reuse only the owner's controlled-hook harness; run new cases, not its accepted tests.
let providerSource = fs.readFileSync(owner+'/tests/dabra-conversation-provider.test.ts','utf8').split("\ntest(")[0];
providerSource = providerSource.replaceAll("'../lib/", "'"+owner+"/lib/").replaceAll('createRequire(import.meta.url)', 'createRequire('+JSON.stringify(owner+'/package.json')+')');
const providerExports = {};
vm.runInNewContext(compile(providerSource+'\nexport {fixture};'), {exports:providerExports,require:fixtureRequire,AbortController,AbortSignal,crypto:globalThis.crypto,setImmediate,process,console});

test('same-account TOKEN_REFRESHED must preserve text, draft and the in-flight answer',async()=>{
  const f=providerExports.fixture();f.render();f.commit();await f.respond();const view=f.render();
  view.session.setMessages([{id:'q',role:'user',text:'same active account question'}]);
  const contextKey='dir3com-dabra-v1:context:user%3Asynthetic-a';
  const cartKey='dir3com-dabra-v1:cart:user%3Asynthetic-a';
  f.cache.set(contextKey,'previously persisted context');f.cache.set(cartKey,'previously persisted cart');
  view.session.setDraft('unsent same-account draft');const job=view.session.begin();
  f.changeAuth('TOKEN_REFRESHED');await f.respond();const after=f.render();
  console.log('TOKEN_REFRESHED actual',JSON.stringify({owner:after.state.persistence?.ownerId,draft:after.state.draft,messages:after.state.messages.length,aborted:job.signal.aborted,cachedContext:f.cache.has(contextKey),cachedCart:f.cache.has(cartKey)}));
  try {assert.equal(f.cache.has(contextKey),true,'same-account refresh deleted persisted context');assert.equal(f.cache.has(cartKey),true);assert.equal(after.state.draft,'unsent same-account draft');assert.equal(after.state.messages.length,1);assert.equal(job.signal.aborted,false);} finally {f.unmount();}
});

function floatingFixture(options={}){
 const session=new ConversationSession();session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic-a',storage:'local'});
 const preferences={replyLanguage:'en',displayCurrency:'SAR',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed'};
 const snapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences,preferencesExpiresAt:'2027-01-01T00:00:00Z',trip:null,tripExpiresAt:null,updatedAt:null};
 session.context.capture('user:synthetic-a',snapshot,true,false);session.setPreferences(preferences);session.setContinuitySnapshot(snapshot);session.setContinuityCurrency({before:'USD',applied:'SAR'});session.setDraft('hotels');
 if(options.privateJson){session.forgetContext();session.setDraft('my requests');}
 let currency='SAR',index=0,refIndex=0;const slots=[],refs=[];let posts=0;
 const react={useCallback:fn=>fn,useEffect:()=>{},useRef:value=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
 const dependencies={react,'next/image':()=>null,'next/link':()=>null,'next/navigation':{usePathname:()=>'/'} ,'@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency,setCurrency:value=>{currency=value;}})},'@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session,state:session.getSnapshot()})},'@/components/layout/useDibrahSpeech':{useDibrahSpeech:()=>({listening:false,supported:false})},'@/components/i18n/LanguageProvider':{useLanguage:()=>({language:'en'})},'@/components/dabra/PlatformAnswer':()=>null,'./FloatingDibrahIdentity.module.css':{default:{}}};
 const exports={};vm.runInNewContext(compile(fs.readFileSync(owner+'/components/layout/FloatingDibrah.tsx','utf8')), {exports,require:name=>name in dependencies?dependencies[name]:name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):req(name),AbortSignal,crypto:globalThis.crypto,window:{localStorage:{getItem:()=>null}},fetch:async url=>{if(url==='/api/dabra/continuity')return new Response(JSON.stringify({enabled:false}),{headers:{'content-type':'application/json'}});posts++;return new Response(JSON.stringify({answer:options.privateJson?'Synthetic private request REQ-EXAMPLE':'mock answer'}),{headers:{'content-type':'application/json','cache-control':'private, no-store'}});}});
 const elements=node=>Array.isArray(node)?node.flatMap(elements):!node||typeof node!=='object'||!node.props?[]:[node,...elements(node.props.children)];
 const render=()=>{index=0;refIndex=0;const outer=exports.default();return outer.type(outer.props);};
 render();slots[4]=true;
 return {session,currency:()=>currency,posts:()=>posts,send:async()=>{const input=elements(render()).find(n=>n.type==='textarea');assert.ok(input);input.props.onKeyDown({key:'Enter',shiftKey:false,nativeEvent:{isComposing:false},preventDefault(){}});for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}};
}

test('floating continuity invalidation must undo its saved display currency',async()=>{
 const f=floatingFixture();await f.send();
 console.log('REVOKED_CONTINUITY actual',JSON.stringify({currency:f.currency(),preferences:f.session.getSnapshot().preferences,lease:f.session.context.lease,continuityCurrency:f.session.continuityCurrency,posts:f.posts(),pending:f.session.getSnapshot().pending}));
 assert.equal(f.posts(),0);assert.equal(f.session.context.lease,null);assert.equal(f.session.getSnapshot().preferences,null);
 assert.equal(f.currency(),'USD');assert.equal(f.session.continuityCurrency,null);
});

function cacheInFullView(session){
 let index=0,refIndex=0;const slots=[],refs=[],effects=[],cache=new Map();
 const storage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)};
 const react={useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useRef:value=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useMemo:fn=>fn()};
 const deps={react,'@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session,state:session.getSnapshot()})},'@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'USD',setCurrency:()=>{}})},'@/components/i18n/LanguageProvider':{useLanguage:()=>({language:'en',direction:'ltr'})}};
 for(const name of ['PlatformAnswer','DabraContinuity','PlatformResults','DabraFamilySafetyPanel'])deps['@/components/dabra/'+name]=()=>null;
 deps['@/components/v6/CollaborativeTripCapabilities']=()=>null;
 const exports={};vm.runInNewContext(compile(fs.readFileSync(owner+'/components/dabra/DabraChatCommerce.tsx','utf8')),{exports,require:name=>name in deps?deps[name]:name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):req(name),window:{localStorage:storage,sessionStorage:storage,setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{}},AbortController,AbortSignal,crypto:globalThis.crypto});
 const render=()=>{index=0;refIndex=0;effects.length=0;const outer=exports.default();outer.type(outer.props);};
 render();const hydrate=effects.find(fn=>fn.toString().includes('conversation.hydrateMessages'));assert.ok(hydrate);hydrate();
 render();const persist=effects.find(fn=>fn.toString().includes('cachedMessages(messages)'));assert.ok(persist);persist();
 return storage.getItem('dir3com-dabra-v1:context:user%3Asynthetic-a');
}

test('a private JSON reply from floating must not enter the full-page persistence path',async()=>{
 const f=floatingFixture({privateJson:true});await f.send();
 const cacheable=f.session.context.cachedMessages(f.session.getSnapshot().messages);
 const leaked=cacheable.some(m=>m.text==='Synthetic private request REQ-EXAMPLE');
 const stored=cacheInFullView(f.session);
 console.log('PRIVATE_JSON actual',JSON.stringify({posts:f.posts(),privateConversation:f.session.privateConversation,privateAnswerCacheable:leaked,privateAnswerStored:stored?.includes('Synthetic private request REQ-EXAMPLE')??false}));
 // Source-verified JSON route supplies private,no-store but omits X-DABRA-Private-Context;
 // the full view writes cachedMessages to localStorage whenever privateConversation is false.
 assert.equal(f.posts(),1);assert.equal(stored?.includes('Synthetic private request REQ-EXAMPLE')??false,false);assert.equal(f.session.privateConversation,true);assert.equal(leaked,false);
});
