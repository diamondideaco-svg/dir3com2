import assert from 'node:assert/strict';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TASK187_APP_ORIGIN,attachTask187ConnectProxy} from './sandbox/task187-browser-network.mjs';
import {assertTask187BrowserVersions} from './sandbox/task187-browser-versions.mjs';
const origin=TASK187_APP_ORIGIN;
let stage='preflight';const abort=new AbortController();process.once('SIGTERM',()=>abort.abort());
const labels={en:{panel:'My memory and trip',save:'Confirm and save',resume:'Resume trip',revoke:'Disable memory and delete all',origin:'Departure city',destination:'Destination',consent:'I agree to save',trip:'Save this trip',message:'Message DABRA',send:'Send message',saved:'Saved in your account.',stage:'Saved trip intent, awaiting your confirmation to send:'},ar:{panel:'ذاكرتي ورحلتي',save:'تأكيد وحفظ',resume:'استئناف الرحلة',revoke:'إيقاف الذاكرة وحذف الكل',origin:'مدينة المغادرة',destination:'الوجهة',consent:'أوافق على حفظ',trip:'حفظ هذه الرحلة',message:'رسالة للدبرة',send:'إرسال الرسالة',saved:'تم الحفظ في حسابك.',stage:'نية الرحلة المحفوظة، بانتظار تأكيد الإرسال:'}};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 let raw='';for await(const c of process.stdin)raw+=c;
 const cfg=JSON.parse(raw) as {url:string;anon:string;password:string;aid:string;bid:string};assert.equal(cfg.url,'http://127.0.0.1:19030');
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])assert.equal(existsSync(name),false,'browser runtime must not load external environment files');
 const chrome=execFileSync('google-chrome',['--version'],{encoding:'utf8',timeout:5000}).match(/\d+\.\d+\.\d+\.\d+/)?.[0];
 const driverVersion=execFileSync('chromedriver',['--version'],{encoding:'utf8',timeout:5000}).match(/\d+\.\d+\.\d+\.\d+/)?.[0];assertTask187BrowserVersions(chrome,driverVersion);
 const out=mkdtempSync(join(tmpdir(),'task187-browser-'));const font=join(out,'fonts.cjs');
 writeFileSync(font,"module.exports=new Proxy({}, {get(_t,url){if(typeof url!=='string'||!url.startsWith('https://fonts.googleapis.com/css2?'))return undefined;const f=new URL(url).searchParams.get('family').split(':')[0];if(!['Tajawal','Montserrat','Playfair Display'].includes(f))throw Error('UNEXPECTED_FONT');return `@font-face{font-family:'${f}';src:local('Arial');font-style:normal;font-weight:400 700;font-display:swap}`;}});",{mode:0o600});
 // Child receives no Production/provider credentials, only existing local anon configuration.
 const env:NodeJS.ProcessEnv={NODE_ENV:'development'};for(const key of ['PATH','HOME','TEMP','TMP','TMPDIR','SystemRoot','WINDIR'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_FONT_GOOGLE_MOCKED_RESPONSES:font,NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:cfg.anon,DABRA_CONTINUITY_ENABLED:'true',DABRA_INTERNAL_AI_ENABLED:'false',TASK187_APP_ORIGIN:origin,TASK187_BACKEND_ORIGIN:cfg.url});
 let app:ChildProcess|undefined,driver:ChildProcess|undefined,session:string|null=null;
 let result:unknown;let browserDenied=0,browserProxied=0;const receipts:Array<{language:string;width:number;height:number;status:string;checks:string[]}>=[];
 // All browser HTTP/CONNECT traffic outside loopback is rejected by this test-only proxy.
 // <-loopback> removes Chrome's implicit bypass, so only the exact local app
 // origin can be forwarded. No system proxy/security settings change.
 const proxy=createServer((req,res)=>{
  let url:URL;try{url=new URL(req.url??'');}catch{browserDenied++;res.writeHead(403).end();return;}
  if(url.origin!==origin){browserDenied++;res.writeHead(403).end('TASK187_EXTERNAL_BROWSER_DENIED');return;}
  browserProxied++;const headers:Record<string,string|string[]|undefined>={...req.headers,host:url.host};delete headers['proxy-connection'];
  const upstream=httpRequest({hostname:'127.0.0.1',port:19040,path:url.pathname+url.search,method:req.method,headers},response=>{res.writeHead(response.statusCode??503,response.headers);response.pipe(res);});
  upstream.on('error',()=>res.writeHead(503).end());req.pipe(upstream);
 });
 const closeTunnels=attachTask187ConnectProxy(proxy,()=>{browserProxied++;},()=>{browserDenied++;});
 const finish=async(child:ChildProcess|undefined,ipc=false)=>{if(!child||child.exitCode!==null)return;if(ipc)child.send('STOP');else child.kill('SIGTERM');await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('TASK187_OWNED_PROCESS_STOP_TIMEOUT')),10000);child.once('exit',()=>{clearTimeout(timer);resolve();});});};
 const command=async(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<unknown>=>{const response=await fetch('http://127.0.0.1:19041'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(65000),abort.signal])});const payload=await response.json();if(!response.ok||payload.value?.error)throw Error('TASK187_WEBDRIVER_COMMAND_FAILED');return payload.value;};
 const script=async<T>(source:string,args:unknown[]=[]):Promise<T>=>await command('/session/'+session+'/execute/sync',{script:source,args}) as T;
 const wait=async<T>(fn:()=>Promise<T>,name:string):Promise<T>=>{const start=Date.now();while(Date.now()-start<60000){if(abort.signal.aborted)throw Error('TASK187_TEST_STOPPED');try{const result=await fn();if(result)return result;}catch{}await delay(200);}throw Error('TASK187_BROWSER_WAIT_'+name);};
 const element=async(source:string,args:unknown[]=[])=>{const e=await wait(()=>script<Record<string,string>|null>(source,args),'ELEMENT');assert.ok(e);return e['element-6066-11e4-a52e-4f735466cecf'];};
 const click=async(source:string,args:unknown[]=[])=>{const id=await element(source,args);await command('/session/'+session+'/element/'+id+'/click',{});};
 const fill=async(source:string,value:string,args:unknown[]=[])=>{const id=await element(source,args);await command('/session/'+session+'/element/'+id+'/clear',{});await command('/session/'+session+'/element/'+id+'/value',{text:value});};
 const metrics=async()=>await (await fetch(origin+'/__task187_metrics',{signal:AbortSignal.any([AbortSignal.timeout(10000),abort.signal])})).json() as {chatRequests:number;chatCompleted:number;externalDenied:number};
 const state=async()=>await command('/session/'+session+'/execute/async',{script:"const done=arguments[arguments.length-1];fetch('/api/dabra/continuity',{cache:'no-store'}).then(async r=>done({status:r.status,body:await r.json()})).catch(()=>done(null));",args:[]}) as {status:number;body:{ownerId:string;state:{trip:{origin:string;destination:string}|null;preferences:unknown;consentEnabled:boolean}}};
 try{
  await new Promise<void>(r=>proxy.listen(19042,'127.0.0.1',r));
  app=spawn(process.execPath,['scripts/task187-browser-next.mjs'],{env,stdio:['ignore','ignore','ignore','ipc']});
  await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('TASK187_NEXT_START_TIMEOUT')),60000);app!.once('message',m=>{if((m as {ready?:boolean}).ready){clearTimeout(t);resolve();}});app!.once('exit',()=>{clearTimeout(t);reject(Error('TASK187_NEXT_EXIT'));});});
  const portProbe=createServer();await new Promise<void>((resolve,reject)=>{portProbe.once('error',reject);portProbe.listen(19041,'127.0.0.1',resolve);});await new Promise<void>(resolve=>portProbe.close(()=>resolve()));
  driver=spawn('chromedriver',['--port=19041','--allowed-ips=127.0.0.1'],{stdio:'ignore'});await wait(async()=>{if(driver!.exitCode!==null)throw Error('TASK187_DRIVER_EXIT');try{return await command('/status');}catch{return null;}},'DRIVER');assert.equal(driver.exitCode,null);
  for(const language of ['ar','en'] as const)for(const [width,height] of [[390,844],[1440,900]]){
   stage=language+'-'+width+'-login';const t=labels[language],checks:string[]=[];const profile=mkdtempSync(join(out,language+'-'+width+'-'));
   const created=await command('/session',{capabilities:{alwaysMatch:{browserName:'chrome','goog:chromeOptions':{args:['--headless=new','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--proxy-server=http://127.0.0.1:19042','--proxy-bypass-list=<-loopback>','--user-data-dir='+profile]}}}}) as {sessionId:string;capabilities:{browserVersion:string;chrome:{chromedriverVersion:string}}};session=created.sessionId;
   const actualDriver=created.capabilities.chrome.chromedriverVersion.split(' ')[0];assertTask187BrowserVersions(created.capabilities.browserVersion,actualDriver);assert.equal(created.capabilities.browserVersion,chrome);assert.equal(actualDriver,driverVersion);
   await command('/session/'+session+'/timeouts',{script:60000,pageLoad:60000,implicit:0});
   await command('/session/'+session+'/goog/cdp/execute',{cmd:'Emulation.setDeviceMetricsOverride',params:{width,height,deviceScaleFactor:1,mobile:false}});
   const navigate=async(path:string)=>{await command('/session/'+session+'/url',{url:origin+path});};
   await navigate('/login?redirect=%2Fdabra');await script("localStorage.setItem('dir3com-lang',arguments[0]);document.cookie='dir3com-lang='+arguments[0]+';path=/;samesite=lax';",[language]);await navigate('/login?redirect=%2Fdabra');
   const login=async(email:string)=>{await fill("return document.querySelector('#login-email')",email);await fill("return document.querySelector('#login-password')",cfg.password);await click("return document.querySelector('form button[type=submit]')");await wait(()=>script("return location.pathname==='/dabra'&&!!document.querySelector('.dabra-composer input[aria-label]:not([disabled])')"),'LOGIN');};
   await login('a@example.invalid');
   const panel="document.querySelector('section[aria-label='+JSON.stringify(arguments[0])+']')";
   const button="const p="+panel+";return p&&[...p.querySelectorAll('button')].find(e=>e.textContent.trim()===arguments[1]&&!e.disabled)";
   const input="const p="+panel+";return p&&[...p.querySelectorAll('label')].find(e=>e.textContent.startsWith(arguments[1]))?.querySelector('input')";
   await wait(async()=>{const s=await state();return s?.status===200&&s.body.ownerId==='user:'+cfg.aid;},'A_STATE');
   stage=language+'-'+width+'-save';await click(button,[t.panel,t.revoke]);await wait(async()=>!(await state()).body.state.consentEnabled,'RESET');
   const include=await script<boolean>("const p="+panel+";return [...p.querySelectorAll('label')].find(e=>e.textContent===arguments[1])?.querySelector('input')?.checked",[t.panel,t.trip]);if(!include)await click(input,[t.panel,t.trip]);
   await fill(input,'Cairo',[t.panel,t.origin]);await fill(input,'Riyadh',[t.panel,t.destination]);
   // Actual preference control: keep replies in the cell's selected language.
   await click("const p="+panel+";return p.querySelector('select').querySelector('option[value='+JSON.stringify(arguments[1])+']')",[t.panel,language]);
   await click(input,[t.panel,t.consent]);await click(button,[t.panel,t.save]);
   await wait(async()=>{const s=await state();return s.body.state.trip?.origin==='Cairo'&&s.body.state.trip?.destination==='Riyadh';},'SAVED');checks.push('save-genuine-cookie-RPC');
   await navigate('/dabra');await wait(()=>script("return !!document.querySelector('.dabra-composer input[aria-label]:not([disabled])')"),'RELOADED');
   assert.equal((await state()).body.state.trip?.destination,'Riyadh');checks.push('reload-durable-trip');
   stage=language+'-'+width+'-resume';const before=(await metrics()).chatRequests;await click(button,[t.panel,t.resume]);
   await wait(()=>script("return [...document.querySelectorAll('p[role=status]')].some(e=>e.textContent.startsWith(arguments[0]))",[t.stage]),'STAGED');await delay(700);assert.equal((await metrics()).chatRequests,before);checks.push('resume-no-auto-chat');
   const composer="return document.querySelector('.dabra-composer input[aria-label]')";
   const send=async(text:string)=>{const initial=await metrics();const n=initial.chatRequests;await fill(composer,text);await click("return document.querySelector('.dabra-send:not([disabled])')");await wait(async()=>{const m=await metrics();return m.chatRequests===n+1&&m.chatCompleted===initial.chatCompleted+1&&await script("return !!document.querySelector('.dabra-composer input[aria-label]:not([disabled])')&&!!document.querySelector('.dabra-send[disabled]')&&!!document.querySelector('[data-platform-results]')");},'CHAT_RESULT');};
   const links=async()=>await script<string[]>("return [...document.querySelectorAll('[data-platform-results] a')].map(e=>e.getAttribute('href'))");
   const checkLink=async(destination:string,rooms?:string)=>{await wait(async()=>{const hrefs=await links();return hrefs.some(h=>{const u=new URL(h,origin);return u.searchParams.get('destination')===destination&&(!rooms||u.searchParams.get('rooms')===rooms);});},'DESTINATION');};
   stage=language+'-'+width+'-journey';await send(language==='ar'?'فنادق':'hotels');await checkLink('riyadh');checks.push('hotels-Riyadh');
   await send(language==='ar'?'2 غرف':'2 rooms');await checkLink('riyadh','2');checks.push('rooms-retain-destination');
   await send(language==='ar'?'فنادق في جدة':'hotels in Jeddah');await checkLink('jeddah','2');checks.push('explicit-Jeddah');
   await send(language==='ar'?'سيارة في جدة':'car in Jeddah');await checkLink('jeddah');assert.equal(await script("return document.querySelectorAll('[data-platform-results] .dabra-product-card').length"),0);checks.push('Drive-foreign-no-Egypt-cards');
   await send(language==='ar'?'سيارة في القاهرة':'car in Cairo');await wait(()=>script("return document.querySelectorAll('[data-platform-results] .dabra-product-card').length>0"),'EGYPT_CARDS');await checkLink('cairo');checks.push('Drive-Egypt-cards');
   const activeGeometry=await script<{width:number;height:number;overflow:boolean}>("return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}");assert.equal(activeGeometry.width,width);assert.equal(activeGeometry.height,height);assert.equal(activeGeometry.overflow,false);checks.push('active-A-viewport-no-overflow');
   stage=language+'-'+width+'-forget';await fill(composer,'independent typing');await click(button,[t.panel,t.revoke]);
   await wait(()=>script("return !document.querySelector('[data-platform-results]')&&![...document.querySelectorAll('p[role=status]')].some(e=>e.textContent.startsWith(arguments[0]))",[t.stage]),'FORGOTTEN');
   assert.equal(await script("return document.querySelector('.dabra-composer input[aria-label]').value"),'independent typing');
   assert.equal(await script("return /Riyadh|الرياض/.test([...document.querySelectorAll('.dabra-message')].map(e=>e.textContent).join(' '))"),false);
   assert.equal((await state()).body.state.trip,null);assert.equal((await state()).body.state.preferences,null);checks.push('revoke-clears-derived-preserves-typing');
   // Save again while A is present, then use genuine logout/login to prove B isolation.
   await click(input,[t.panel,t.trip]);await fill(input,'Cairo',[t.panel,t.origin]);await fill(input,'Riyadh',[t.panel,t.destination]);await click(input,[t.panel,t.consent]);await click(button,[t.panel,t.save]);await wait(async()=>!!(await state()).body.state.trip,'RESAVED');
   stage=language+'-'+width+'-B-isolation';const logout=await command('/session/'+session+'/execute/async',{script:"const done=arguments[arguments.length-1];fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).then(async r=>done({status:r.status,body:await r.json()})).catch(()=>done(null));",args:[]}) as {status:number;body:{signedOut:boolean}};
   assert.equal(logout.status,200);assert.equal(logout.body.signedOut,true);await navigate('/login?redirect=%2Fdabra');await login('b@example.invalid');
   const bs=await state();assert.equal(bs.body.ownerId,'user:'+cfg.bid);assert.equal(bs.body.state.trip,null);assert.equal(bs.body.state.preferences,null);assert.equal(await script("return /Riyadh|الرياض|independent typing/.test(document.querySelector('.dabra-experience').textContent)"),false);checks.push('B-real-cookie-isolation');
   const geometry=await script<{width:number;height:number;overflow:boolean;direction:string}>("return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,direction:document.querySelector('.dabra-experience')?.dir}");assert.equal(geometry.width,width);assert.equal(geometry.height,height);assert.equal(geometry.overflow,false);assert.equal(geometry.direction,language==='ar'?'rtl':'ltr');checks.push('actual-viewport-direction-no-overflow');
   receipts.push({language,width,height,status:'PASS',checks});await command('/session/'+session,undefined,'DELETE');session=null;
  }
  const m=await metrics();assert.equal(receipts.length,4);assert.ok(browserProxied>0,'browser traffic must traverse the owned loopback proxy');
  result={status:'PASS',mode:'real-Next-ChromeDriver-cookie-Auth-RPC',chrome,driver:driverVersion,cells:receipts,externalAllowed:0,browserProxied,browserExternalDenied:browserDenied,serverExternalDenied:m.externalDenied,limits:'Test-only local gates and Arial font fixtures; not hosted Preview or Production activation.'};
 }finally{
  // Even deadline termination attempts every owned cleanup path before exit.
  if(session)await fetch('http://127.0.0.1:19041/session/'+session,{method:'DELETE',signal:AbortSignal.timeout(10000)}).catch(()=>null);
  closeTunnels();
  const stopped=await Promise.allSettled([finish(driver),finish(app,true),new Promise<void>(r=>{proxy.close(()=>r());proxy.closeAllConnections();})]);
  assert.ok(stopped.every(s=>s.status==='fulfilled'),'owned process cleanup must complete');
 }
 console.log(JSON.stringify({...result as object,ownedProcessesStopped:true}));
}
main().catch(()=>{console.error('TASK187_BROWSER_ACCEPTANCE_FAILED:'+stage);process.exitCode=1;});
