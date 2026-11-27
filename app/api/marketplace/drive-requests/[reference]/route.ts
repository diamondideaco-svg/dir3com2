import {NextRequest,NextResponse} from 'next/server';
import {createSupabaseRequestClient} from '@/lib/supabase/server';
import {readOwnedDriveRequest,acceptOwnedDriveQuote} from '@/lib/drive/owned-request';
import {readLimitedBody} from '@/lib/notifications/drive-whatsapp';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff',Vary:'Cookie, Authorization'};
type Context={params:Promise<{reference:string}>};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
export async function GET(request:NextRequest,context:Context) {
 const auth=await createSupabaseRequestClient(request);
 if(!auth)return json({error:'UNAUTHORIZED'},401);
 const {reference}=await context.params;
 const result=await readOwnedDriveRequest(auth.supabase,auth.user.id,reference);
 return result.ok?json(result.snapshot):json({error:result.error},result.error==='NOT_FOUND'?404:503);
}
export async function POST(request:NextRequest,context:Context) {
 const origin=request.headers.get('origin');
 const bearer=/^Bearer\s+\S+$/i.test(request.headers.get('authorization')??'');
 if(request.headers.get('sec-fetch-site')==='cross-site'||origin&&origin!==request.nextUrl.origin||!origin&&!bearer)return json({error:'FORBIDDEN'},403);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return json({error:'INVALID'},415);
 const auth=await createSupabaseRequestClient(request);
 if(!auth)return json({error:'UNAUTHORIZED'},401);
 let body:unknown;
 try {body=JSON.parse(await readLimitedBody(request,4096));}catch{return json({error:'INVALID'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'INVALID'},400);
 const input=body as Record<string,unknown>;
 if(input.action!=='accept'||input.acknowledged!==true||!Number.isSafeInteger(input.version))return json({error:'INVALID'},400);
 const {reference}=await context.params;
 const result=await acceptOwnedDriveQuote(auth.supabase,auth.user.id,reference,input.version as number,true);
 if(result.ok)return json({ ...result.snapshot,replayed:result.replayed});
 return json({error:result.error},result.error==='NOT_FOUND'?404:result.error==='FORBIDDEN'?403:result.error==='UNAVAILABLE'?503:result.error==='INVALID'?400:409);
}
