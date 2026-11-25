import {NextRequest,NextResponse} from 'next/server';
import {createSupabaseRequestClient} from '@/lib/supabase/server';
import {readLimitedBody} from '@/lib/notifications/drive-whatsapp';
import {createPlatformScopeOwner,platformUserRequest,managedDriveChatPlan} from '@/lib/dabra/platform-assistant';
import {replayDriveTemporalText} from '@/lib/dabra/drive-time.mjs';
import {DRIVE_OFFERS,DRIVE_CATALOG_VERSION,vehicleFor,vehicleTitle} from '@/lib/drive/catalog';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Cross-Origin-Resource-Policy':'same-origin',Vary:'Cookie, Authorization'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
/** Read-only Core planning projection. It confers no consent, actor or price authority. */
export async function POST(request:NextRequest){
 const auth=await createSupabaseRequestClient(request);if(!auth)return json({error:'UNAUTHORIZED'},401);
 let body:Record<string,unknown>;
 try{const raw:unknown=JSON.parse(await readLimitedBody(request,65536));if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error();body=raw as Record<string,unknown>;}catch{return json({error:'INVALID'},400);}
 if(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000||!Array.isArray(body.history)||body.history.length>24)return json({error:'INVALID'},400);
 type Turn={role:'user'|'assistant';content:string};const history:Turn[]=[];
 for(const value of body.history){if(!value||typeof value!=='object'||!['user','assistant'].includes(value.role)||typeof value.content!=='string'||value.content.length>4000)return json({error:'INVALID'},400);history.push({role:value.role,content:value.role==='user'?replayDriveTemporalText(value.content,value.relativeDate):value.content});}
 if(body.locale!==undefined&&body.locale!=='ar'&&body.locale!=='en')return json({error:'INVALID'},400);
 const locale=body.locale==='en'?'en':'ar';
 const message=replayDriveTemporalText(body.message,body.relativeDate);
 const input=platformUserRequest({role:'user',content:message},history,undefined,createPlatformScopeOwner());
 const plan=managedDriveChatPlan(input,locale,Date.now());
 const offers=plan.blocked?[]:DRIVE_OFFERS.filter(offer=>offer[plan.requirements.mode??'chauffeur']!==null).map(offer=>({id:offer.id,title:vehicleTitle(vehicleFor(offer),locale)}));
 return json({plan,offers,catalogVersion:DRIVE_CATALOG_VERSION});
}
