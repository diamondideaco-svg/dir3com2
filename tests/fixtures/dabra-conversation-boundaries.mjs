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
 const session=options.session??new ConversationSession();if(!options.session)session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic-a',storage:'local'});
 const preferences={replyLanguage:'en',displayCurrency:'SAR',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed'};
 const snapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences,preferencesExpiresAt:'2027-01-01T00:00:00Z',trip:null,tripExpiresAt:null,updatedAt:null};
 if(!options.session){session.context.capture('user:synthetic-a',snapshot,true,false);session.setPreferences(preferences);session.setContinuitySnapshot(snapshot);session.setContinuityCurrency({before:'USD',applied:'SAR'});session.setDraft('hotels');}
 if(options.privateJson){session.forgetContext();session.setDraft('my requests');}
 let currency='SAR',index=0,refIndex=0;const slots=[],refs=[];let posts=0;let unmountView;let rejectContinuity;const histories=[],requests=[];
 session.setCurrencyRestorer(applied=>{if(currency===applied.applied)currency=applied.before;});
 const react={useCallback:fn=>fn,useEffect:fn=>{if(/viewMountedRef.current\s*=\s*true/.test(fn.toString()))unmountView=fn();},useRef:value=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
 const dependencies={react,'next/image':()=>null,'next/link':()=>null,'next/navigation':{usePathname:()=>'/'} ,'@/components/currency/useDisplayCurrency':{getDisplayCurrency:()=>currency,useDisplayCurrency:()=>({currency,setCurrency:value=>{currency=value;}})},'@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session,state:session.getSnapshot()})},'@/components/layout/useDibrahSpeech':{useDibrahSpeech:()=>({listening:false,supported:false})},'@/components/i18n/LanguageProvider':{useLanguage:()=>({language:'en'})},'@/components/dabra/PlatformAnswer':()=>null,'./FloatingDibrahIdentity.module.css':{default:{}}};
 const exports={};vm.runInNewContext(compile(fs.readFileSync(owner+'/components/layout/FloatingDibrah.tsx','utf8')), {exports,require:name=>name in dependencies?dependencies[name]:name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):req(name),AbortSignal,crypto:globalThis.crypto,window:{localStorage:{getItem:()=>null}},fetch:async (url,init)=>{if(url==='/api/dabra/continuity'){if(options.deferContinuity)await new Promise(resolve=>{rejectContinuity=resolve;});return new Response(JSON.stringify({enabled:false}),{headers:{'content-type':'application/json'}});}posts++;requests.push(JSON.parse(init.body));histories.push(requests.at(-1).history);return new Response(JSON.stringify({answer:options.privateJson?'Synthetic private request REQ-EXAMPLE':'mock answer'}),{headers:{'content-type':'application/json','cache-control':'private, no-store'}});}});
 const elements=node=>Array.isArray(node)?node.flatMap(elements):!node||typeof node!=='object'||!node.props?[]:[node,...elements(node.props.children)];
 const render=()=>{index=0;refIndex=0;const outer=exports.default();return outer.type(outer.props);};
 render();slots[4]=true;
 return {session,view:()=>elements(render()),currency:()=>currency,chooseCurrency:value=>{currency=value;},unmount:()=>unmountView?.(),rejectContinuity:()=>rejectContinuity?.(),histories,requests,posts:()=>posts,send:async()=>{const input=elements(render()).find(n=>n.type==='textarea');assert.ok(input);input.props.onKeyDown({key:'Enter',shiftKey:false,nativeEvent:{isComposing:false},preventDefault(){}});for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}};
}

test('floating continuity invalidation must undo its saved display currency',async()=>{
 const f=floatingFixture();await f.send();
 console.log('REVOKED_CONTINUITY actual',JSON.stringify({currency:f.currency(),preferences:f.session.getSnapshot().preferences,lease:f.session.context.lease,continuityCurrency:f.session.continuityCurrency,posts:f.posts(),pending:f.session.getSnapshot().pending}));
 assert.equal(f.posts(),0);assert.equal(f.session.context.lease,null);assert.equal(f.session.getSnapshot().preferences,null);
 assert.equal(f.currency(),'USD');assert.equal(f.session.continuityCurrency,null);
});

function cacheInFullView(session,beforePersist=()=>{}){
 let index=0,refIndex=0;const slots=[],refs=[],effects=[],cache=new Map();
 const storage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)};
 const react={useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useRef:value=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useMemo:fn=>fn()};
 const deps={react,'@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session,state:session.getSnapshot()})},'@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'USD',setCurrency:()=>{}})},'@/components/i18n/LanguageProvider':{useLanguage:()=>({language:'en',direction:'ltr'})}};
 for(const name of ['PlatformAnswer','DabraContinuity','PlatformResults','DabraFamilySafetyPanel'])deps['@/components/dabra/'+name]=()=>null;
 deps['@/components/v6/CollaborativeTripCapabilities']=()=>null;
 const exports={};vm.runInNewContext(compile(fs.readFileSync(owner+'/components/dabra/DabraChatCommerce.tsx','utf8')),{exports,require:name=>name in deps?deps[name]:name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):req(name),window:{localStorage:storage,sessionStorage:storage,setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{}},AbortController,AbortSignal,crypto:globalThis.crypto});
 const render=()=>{index=0;refIndex=0;effects.length=0;const outer=exports.default();outer.type(outer.props);};
 render();const hydrate=effects.find(fn=>fn.toString().includes('conversation.hydrateMessages'));assert.ok(hydrate);hydrate();
 render();const persist=effects.find(fn=>fn.toString().includes('cachedMessages(messages)'));assert.ok(persist);beforePersist();persist();
 return storage.getItem('dir3com-dabra-v1:context:user%3Asynthetic-a');
}

test('a private JSON reply from floating must not enter the full-page persistence path',async()=>{
 const f=floatingFixture({privateJson:true});await f.send();
 const cacheable=f.session.cachedMessages(f.session.getSnapshot().messages);
 const leaked=cacheable.some(m=>m.text==='Synthetic private request REQ-EXAMPLE');
 const stored=cacheInFullView(f.session);
 console.log('PRIVATE_JSON actual',JSON.stringify({posts:f.posts(),privateConversation:f.session.privateConversation,privateAnswerCacheable:leaked,privateAnswerStored:stored?.includes('Synthetic private request REQ-EXAMPLE')??false}));
 // Source-verified JSON route supplies private,no-store but omits X-DABRA-Private-Context;
 // the full view writes cachedMessages to localStorage whenever privateConversation is false.
 assert.equal(f.posts(),1);assert.equal(stored?.includes('Synthetic private request REQ-EXAMPLE')??false,false);assert.equal(f.session.privateConversation,true);assert.equal(leaked,false);
});


test('private replies remain in live history while excluded from storage',async()=>{
 const f=floatingFixture({privateJson:true});await f.send();f.session.setDraft('What do you mean by that option?');await f.send();
 assert.equal(f.posts(),2);assert.equal(f.histories[1].some(message=>message.content==='Synthetic private request REQ-EXAMPLE'),true);
 assert.equal(f.session.cachedMessages(f.session.getSnapshot().messages).length,0);
 assert.equal(cacheInFullView(f.session),null);
});

test('late continuity rejection respects newer currency after view unmount',async()=>{
 const f=floatingFixture({deferContinuity:true});await f.send();assert.equal(f.session.getSnapshot().pending,true);
 f.unmount();f.chooseCurrency('EUR');f.rejectContinuity();for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.currency(),'EUR');assert.equal(f.session.continuityCurrency,null);assert.equal(f.posts(),0);assert.equal(f.session.getSnapshot().pending,false);
});


test('retired storage effect cannot rewrite account A after identity invalidation',async()=>{
 const f=floatingFixture({privateJson:true});await f.send();
 const stored=cacheInFullView(f.session,()=>{f.session.resolve(f.session.invalidate('customer-public'),{ownerId:'user:synthetic-b',storage:'local'});});
 assert.equal(stored,null);assert.equal(f.session.getSnapshot().persistence.ownerId,'user:synthetic-b');
});


test('shared actual persistence excludes private content',()=>{
 const session=new ConversationSession();session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic-a',storage:'local'});
 session.setMessages([{id:'visible',role:'assistant',text:'Only visible final answer'}]);
 const publicStored=cacheInFullView(session);assert.ok(publicStored?.includes('Only visible final answer'));
 session.markPrivate();assert.equal(cacheInFullView(session),null);
 assert.equal(session.getSnapshot().messages[0].text,'Only visible final answer');
});

test('actual provider and view reject retired account writes',async()=>{
 const f=providerExports.fixture();f.render();f.commit();await f.respond();const a=f.render().session;
 a.setMessages([{id:'a',role:'assistant',text:'Private A'}]);a.markPrivate();const job=a.begin();assert.ok(job);
 let storageWasRun=false;
 const stored=cacheInFullView(a,()=>{storageWasRun=true;f.changeAuth('SIGNED_IN','synthetic-b');});
 assert.equal(storageWasRun,true);assert.equal(stored,null);assert.equal(job.signal.aborted,true);
 await f.respond({identityState:'authenticated',authenticated:true,userId:'synthetic-b'});
 a.update(job,[{id:'late-a',role:'assistant',text:'Private A late answer'}]);a.fail(job,'A error');a.finish(job);
 const b=f.render();assert.equal(b.state.persistence.ownerId,'user:synthetic-b');assert.equal(b.state.messages.length,0);assert.equal(b.state.error,null);
 f.unmount();
});

test('actual shared root resets account authority',async()=>{
 const f=providerExports.fixture();f.render();f.commit();await f.respond();const a=f.render();
 a.session.setDraft('Private draft');a.session.setMessages([{id:'a',role:'user',text:'Private A'}]);const job=a.session.begin();assert.ok(job);
 f.changeAuth('SIGNED_OUT');assert.equal(f.render().state.ready,false);assert.equal(f.render().state.messages.length,0);assert.equal(f.render().state.draft,'');assert.equal(job.signal.aborted,true);
 await f.respond({identityState:'anonymous_confirmed',authenticated:false});assert.equal(f.render().state.persistence.storage,'session');
 f.unmount();
});

test('actual locale boundary retains transcript and cancels pending',async()=>{
 const f=providerExports.fixture();f.render();f.commit();await f.respond();const a=f.render();
 a.session.setMessages([{id:'done',role:'assistant',text:'Completed Arabic answer'}]);a.session.setDraft('Unsent draft');const job=a.session.begin();assert.ok(job);
 f.language('en');f.render();f.commit();const next=f.render();
 assert.equal(job.signal.aborted,true);assert.equal(next.state.pending,false);assert.equal(next.state.messages[0].text,'Completed Arabic answer');assert.equal(next.state.draft,'Unsent draft');
 f.unmount();
});

test('actual floating request preserves wire contract',async()=>{
 const f=floatingFixture({privateJson:true});f.session.setMessages([{id:'previous',role:'assistant',text:'Earlier visible reply'}]);f.chooseCurrency('EUR');f.session.setDraft('Show hotels in Cairo');
 await f.send();assert.equal(f.requests.length,1);const body=f.requests[0];
 assert.equal(body.message,'Show hotels in Cairo');assert.equal(body.currency,'EUR');assert.equal(body.locale,'en');assert.equal(body.history[0].content,'Earlier visible reply');
 assert.deepEqual(Object.keys(body).sort(),['currency','history','locale','message']);
 assert.equal(f.session.getSnapshot().pending,false);
});


function fullSendFixture(options={}){
 const session=options.session??new ConversationSession();if(!options.session)session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic-a',storage:'local'});if(!options.session)session.setDraft('Show Cairo hotels');
 let cursor=0,refCursor=0;const slots=[],refs=[],events=[],requests=[];let releaseReply;
 const source=fs.readFileSync(owner+'/components/dabra/DabraChatCommerce.tsx','utf8');
 const tree=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const refNames=[];
 function scan(node){if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(tree)==='useRef')refNames.push(node.name.getText(tree));ts.forEachChild(node,scan);}scan(tree);
 const react={useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:()=>{},useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
 const deps={react,'@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session,state:session.getSnapshot()})},'@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'USD',setCurrency:()=>{}})},'@/components/i18n/LanguageProvider':{useLanguage:()=>({language:'en',direction:'ltr'})}};
 for(const name of ['PlatformAnswer','DabraContinuity','PlatformResults','DabraFamilySafetyPanel'])deps['@/components/dabra/'+name]=()=>null;deps['@/components/v6/CollaborativeTripCapabilities']=()=>null;
 const exports={};const syntheticURL=class extends URL{static revokeObjectURL(value){events.push('revoke:'+value);}};
 vm.runInNewContext(compile(source),{exports,require:name=>name in deps?deps[name]:name.startsWith('@/')?loadSource(owner+'/'+name.slice(2)):req(name),window:{localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null}},AbortController,AbortSignal,FormData,URL:syntheticURL,crypto:globalThis.crypto,fetch:async(url,init)=>{
 if(url==='/api/ai2/chat'){events.push('chat-dispatch');requests.push(init);const ordinal=requests.length;if(options.deferFirst&&ordinal===1)await new Promise(resolve=>{releaseReply=resolve;});return Response.json({answer:options.deferFirst&&ordinal===1?'Late answer '+options.lateMarker:'Synthetic visible answer'});}
 if(String(url).startsWith('/api/marketplace'))return Response.json({services:[]});
 throw Error('Unmocked full-view IO '+url);
 }});
 const elements=node=>Array.isArray(node)?node.flatMap(elements):!node||typeof node!=='object'||!node.props?[]:[node,...elements(node.props.children)];
 const render=()=>{cursor=0;refCursor=0;const outer=exports.default();return outer.type(outer.props);};render();
 const ref=name=>{const i=refNames.indexOf(name);assert.ok(i>=0,'missing actual ref '+name);assert.ok(refs[i]);return refs[i];};
 const playback=new AbortController();playback.signal.addEventListener('abort',()=>events.push('voice-abort'));
 ref('playbackAbortRef').current=playback;
 ref('playbackRef').current={onended:null,onerror:null,pause:()=>events.push('audio-pause'),removeAttribute:name=>events.push('remove:'+name),load:()=>events.push('audio-load')};
 ref('playbackUrlRef').current='blob:synthetic-voice';
 return {session,events,requests,playback,view:()=>elements(render()),release:async()=>{assert.ok(releaseReply);releaseReply();for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));},send:async()=>{const button=elements(render()).find(n=>n.props.className==='dabra-send');assert.ok(button);button.props.onClick();for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}};
}

test('actual full send stops voice before dispatch',async()=>{
 const f=fullSendFixture();await f.send();assert.equal(f.requests.length,1);const dispatch=f.events.indexOf('chat-dispatch');
 for(const event of ['voice-abort','audio-pause','revoke:blob:synthetic-voice']){assert.ok(f.events.indexOf(event)>=0,event);assert.ok(f.events.indexOf(event)<dispatch,event+' must precede chat');}
 assert.equal(f.playback.signal.aborted,true);assert.equal(f.requests[0].body.get('message'),'Show Cairo hotels');assert.equal(f.requests[0].signal.aborted,false);
 assert.equal(f.session.getSnapshot().pending,false);
});

const visibleSyntheticText=nodes=>nodes.flatMap(node=>[node.props.text,typeof node.props.children==='string'?node.props.children:'']).filter(value=>typeof value==='string').join('\n');

test('controlled same-account internal navigation shares private transcript in both actual views',async()=>{
 const f=providerExports.fixture();f.render();f.commit();await f.respond();const session=f.render().session;
 session.setMessages([{id:'question',role:'user',text:'Synthetic private question'},{id:'answer',role:'assistant',text:'Synthetic private answer'}]);session.markPrivate();session.setDraft('Synthetic private draft');
 f.path('/dabra');f.render();f.commit();const full=fullSendFixture({session});
 assert.match(visibleSyntheticText(full.view()),/Synthetic private answer/);
 f.path('/');f.render();f.commit();f.changeAuth('SIGNED_IN');await f.respond();
 const floating=floatingFixture({session});
 for(const view of [full,floating]){
  const nodes=view.view();assert.match(visibleSyntheticText(nodes),/Synthetic private question/);assert.match(visibleSyntheticText(nodes),/Synthetic private answer/);
  assert.ok(nodes.some(node=>node.props.value==='Synthetic private draft'));
 }
 assert.equal(cacheInFullView(session),null,'private answer never enters browser storage');
 f.unmount();
 const reloaded=providerExports.fixture();reloaded.render();reloaded.commit();await reloaded.respond();
 assert.equal(reloaded.render().state.messages.length,0,'a fresh application root does not persist private text');reloaded.unmount();
});

for(const [before,after] of [['synthetic-a','synthetic-b'],['synthetic-b','synthetic-a']])test('controlled late reply and request context isolation '+before+' to '+after,async()=>{
 const f=providerExports.fixture();f.render();f.commit();await f.respond({identityState:'authenticated',authenticated:true,userId:before});const session=f.render().session;
 const marker='private-'+before;
 session.setMessages([{id:'old-user',role:'user',text:marker+' question'},{id:'old-answer',role:'assistant',text:marker+' answer'}]);session.markPrivate();session.setContinuityDraft(marker+' context');session.setDraft('what can you do '+marker);
 const oldView=fullSendFixture({session,deferFirst:true,lateMarker:marker});await oldView.send();
 assert.equal(oldView.requests.length,1);assert.equal(session.getSnapshot().pending,true);assert.match(String(oldView.requests[0].body.get('history')),new RegExp(marker));session.setDraft(marker+' unsent');
 const trip={id:marker,origin:null,destination:marker,startDate:null,endDate:null,adults:1,children:0,rooms:1,budget:null,currency:'SAR',families:['drive']};
 session.context.capture('user:'+before,{revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences:null,preferencesExpiresAt:null,trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null},false,true);
 session.setContinuityDraft(marker+' staged context');assert.equal(session.context.trip.destination,marker);assert.equal(session.context.lease.ownerId,'user:'+before);
 f.changeAuth('SIGNED_OUT',null);assert.equal(oldView.requests[0].signal.aborted,true);
 await f.respond({identityState:'anonymous_confirmed',authenticated:false});
 f.changeAuth('SIGNED_IN',after);await f.respond({identityState:'authenticated',authenticated:true,userId:after});
 const clean=f.render();assert.equal(clean.state.persistence.ownerId,'user:'+after);assert.equal(clean.state.messages.length,0);assert.equal(clean.state.draft,'');assert.equal(session.context.draft,null);assert.equal(session.context.lease,null);assert.equal(session.context.trip,null);assert.equal(clean.state.continuityDraft,null);assert.equal(session.privateConversation,false);
 // The old transport deliberately ignores abort and resolves only AFTER the new actor is ready.
 session.setDraft('next actor draft');await oldView.release();
 assert.equal(session.getSnapshot().messages.length,0);assert.equal(session.getSnapshot().draft,'next actor draft');assert.equal(session.getSnapshot().pending,false);assert.equal(session.getSnapshot().error,null);assert.equal(session.privateConversation,false);
 for(const view of [fullSendFixture({session}),floatingFixture({session})]){
  const nodes=view.view();assert.doesNotMatch(visibleSyntheticText(nodes),new RegExp(marker));assert.ok(nodes.some(node=>node.props.value==='next actor draft'));
 }
 session.setDraft('what can you do next actor');await oldView.send();assert.equal(oldView.requests.length,2);
 const fullBody=oldView.requests[1].body;assert.equal(fullBody.get('continuityTrip'),null);assert.doesNotMatch(String(fullBody.get('history')),new RegExp(marker));assert.equal(fullBody.get('message'),'what can you do next actor');
 session.setDraft('what can you do floating next actor');const floating=floatingFixture({session});await floating.send();
 assert.equal(floating.requests.length,1);assert.doesNotMatch(JSON.stringify(floating.requests[0]),new RegExp(marker));assert.equal(floating.requests[0].continuityTrip,undefined);
 f.unmount();
});
