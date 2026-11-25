import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedDriveTrip } from './record';
import { isMarketplaceRequestReference } from '../marketplace/customer-requests';
import { driveRequestState } from './request';
export type DriveNoticeState='not_queued'|'queued'|'sending'|'provider_accepted'|'sent'|'delivered'|'read'|'failed'|'unknown';
export type OwnedDriveSnapshot={
 reference:string;status:string;state:string;version:number;acceptedAt:string|null;
 trip:Pick<PersistedDriveTrip,'pickup'|'dropoff'|'pickupAt'|'returnAt'|'mode'|'passengers'|'luggage'|'customerBudget'>;
 quote:{amount:number;currency:string;vehicle:string;vehicleYear:number|null;expiresAt:string}|null;
 operationsNotice:DriveNoticeState;
};
type Row={id:string;request_reference:string;status:string;quote_amount:number|null;quote_currency:string|null;quote_expires_at:string|null;
 drive_request_context:{trip:PersistedDriveTrip;confirmed_vehicle:string|null;confirmed_vehicle_year:number|null;customer_accepted_at:string|null;version:number}};
type ReadResult={ok:true;snapshot:OwnedDriveSnapshot;requestId:string}|{ok:false;error:'NOT_FOUND'|'UNAVAILABLE'};
const notices:readonly string[]=['not_queued','queued','sending','provider_accepted','sent','delivered','read','failed','unknown'];
// No supplier costs, private Operations notes, contact details or outbox identifiers leave Core.
const fields='id,request_reference,status,quote_amount,quote_currency,quote_expires_at,drive_request_context!inner(trip,confirmed_vehicle,confirmed_vehicle_year,customer_accepted_at,version)';
export async function readOwnedDriveRequest(supabase:SupabaseClient,actorId:string,reference:string,now=Date.now()):Promise<ReadResult>{
 if(!actorId||!isMarketplaceRequestReference(reference))return {ok:false,error:'NOT_FOUND'};
 const {data,error}=await supabase.from('marketplace_requests').select(fields).eq('request_reference',reference).eq('user_id',actorId).not('drive_offer_id','is',null).maybeSingle();
 if(error)return {ok:false,error:'UNAVAILABLE'};if(!data)return {ok:false,error:'NOT_FOUND'};
 const row=data as unknown as Row,c=row.drive_request_context;
 if(!c||!c.trip||!Number.isSafeInteger(c.version))return {ok:false,error:'UNAVAILABLE'};
 let operationsNotice:DriveNoticeState='not_queued';
 if(c.customer_accepted_at){const result=await supabase.rpc('read_owned_drive_accept_notice',{p_request_id:row.id});operationsNotice=!result.error&&typeof result.data==='string'&&notices.includes(result.data)?result.data as DriveNoticeState:'unknown';}
 const t=c.trip;
 const quote=typeof row.quote_amount==='number'&&Number.isFinite(row.quote_amount)&&row.quote_amount>0&&row.quote_currency&&c.confirmed_vehicle&&row.quote_expires_at&&Number.isFinite(Date.parse(row.quote_expires_at))
  ?{amount:row.quote_amount,currency:row.quote_currency,vehicle:c.confirmed_vehicle,vehicleYear:c.confirmed_vehicle_year,expiresAt:row.quote_expires_at}:null;
 return {ok:true,requestId:row.id,snapshot:{reference:row.request_reference,status:row.status,state:driveRequestState(row.status,row.quote_expires_at,now),version:c.version,acceptedAt:c.customer_accepted_at,
  trip:{pickup:t.pickup,dropoff:t.dropoff,pickupAt:t.pickupAt,returnAt:t.returnAt,mode:t.mode,passengers:t.passengers,luggage:t.luggage,...(t.customerBudget?{customerBudget:t.customerBudget}:{})},quote,operationsNotice}};
}
export type DriveAcceptResult={ok:true;snapshot:OwnedDriveSnapshot;replayed:boolean}|{ok:false;error:'INVALID'|'NOT_FOUND'|'STALE'|'FORBIDDEN'|'INVALID_OR_EXPIRED'|'UNAVAILABLE'};
/** The existing atomic owner/version/expiry RPC is the only approval and audit writer. */
export async function acceptOwnedDriveQuote(supabase:SupabaseClient,actorId:string,reference:string,version:number,acknowledged:boolean):Promise<DriveAcceptResult>{
 if(!acknowledged||!Number.isSafeInteger(version)||version<0)return {ok:false,error:'INVALID'};
 const owned=await readOwnedDriveRequest(supabase,actorId,reference);if(!owned.ok)return owned;
 const {data,error}=await supabase.rpc('accept_managed_drive_quote',{p_request_id:owned.requestId,p_version:version});
 if(error)return {ok:false,error:error.code==='40001'?'STALE':error.code==='42501'?'FORBIDDEN':error.code==='22023'?'INVALID_OR_EXPIRED':'UNAVAILABLE'};
 const current=await readOwnedDriveRequest(supabase,actorId,reference);if(!current.ok)return current;
 if(current.snapshot.state!=='ready_for_payment'||!current.snapshot.acceptedAt)return {ok:false,error:'UNAVAILABLE'};
 return {ok:true,snapshot:current.snapshot,replayed:data?.replayed===true};
}
