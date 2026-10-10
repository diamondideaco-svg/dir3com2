type Command=(path:string,body?:unknown)=>Promise<unknown>;
export type ClickGeometry={x:number;y:number;width:number;height:number;viewportWidth:number;viewportHeight:number;unobscured:boolean;enabled:boolean};
export class Task187CommandError extends Error {
 constructor(status:number,code:unknown,path:string){
  super(JSON.stringify({status,code:typeof code==='string'&&/^[a-z ]{1,60}$/.test(code)?code:'unknown',path:path.replace(/\/session\/[^/]+/,'/session/[OWNED]').replace(/\/element\/[^/]+/,'/element/[ELEMENT]')}));
  this.name='Task187CommandError';
 }
}
export class Task187ClickError extends Error {
 constructor(operation:string,geometry:ClickGeometry|undefined,cause?:unknown){
  super(JSON.stringify({operation,geometry,webdriver:cause instanceof Task187CommandError?JSON.parse(cause.message):undefined}));
  this.name='Task187ClickError';
 }
}
// WebDriver clicks an OPTION through its SELECT container; selection remains native.
export const SCROLL_TARGET="const e=arguments[0];const c=e.tagName==='OPTION'?e.closest('select'):e;c.scrollIntoView({block:'center',inline:'center',behavior:'instant'});";
export const READ_CLICK_GEOMETRY="const e=arguments[0];const c=e.tagName==='OPTION'?e.closest('select'):e;const r=c.getBoundingClientRect();const w=Math.min(innerWidth,document.documentElement.clientWidth),h=Math.min(innerHeight,document.documentElement.clientHeight);const x=Math.floor((Math.max(0,r.left)+Math.min(w,r.right))/2),y=Math.floor((Math.max(0,r.top)+Math.min(h,r.bottom))/2);const hit=document.elementFromPoint(x,y);return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:w,viewportHeight:h,unobscured:!!hit&&(hit===c||c.contains(hit)),enabled:!e.disabled&&!c.disabled};";
function ready(g:ClickGeometry){
 return [g.x,g.y,g.width,g.height,g.viewportWidth,g.viewportHeight].every(Number.isFinite)&&g.width>0&&g.height>0&&g.x>=0&&g.y>=0&&g.x+g.width<=g.viewportWidth&&g.y+g.height<=g.viewportHeight&&g.enabled&&g.unobscured;
}
function stable(a:ClickGeometry,b:ClickGeometry){
 return (['x','y','width','height','viewportWidth','viewportHeight'] as const).every(k=>Math.abs(a[k]-b[k])<=0.5);
}
export async function clickTask187Element(command:Command,session:string,id:string,operation:string,options:{attempts?:number;pause?:()=>Promise<void>}={}){
 const args=[{'element-6066-11e4-a52e-4f735466cecf':id}];
 let geometry:ClickGeometry|undefined,previous:ClickGeometry|undefined,steady=0;
 try{
  await command('/session/'+session+'/execute/sync',{script:SCROLL_TARGET,args});
  for(let attempt=0;attempt<(options.attempts??20);attempt++){
   geometry=await command('/session/'+session+'/execute/sync',{script:READ_CLICK_GEOMETRY,args}) as ClickGeometry;
   steady=ready(geometry)?previous&&stable(previous,geometry)?steady+1:1:0;
   previous=ready(geometry)?geometry:undefined;
   if(steady>=3){await command('/session/'+session+'/element/'+id+'/click',{});return;}
   await (options.pause??(()=>new Promise<void>(resolve=>setTimeout(resolve,150))))();
  }
  throw new Task187ClickError(operation,geometry);
 }catch(error){if(error instanceof Task187ClickError)throw error;throw new Task187ClickError(operation,geometry,error);}
}
