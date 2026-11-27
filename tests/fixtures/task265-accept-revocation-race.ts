import assert from 'node:assert/strict';
import {Client} from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {DRIVE_CATALOG_VERSION} from '../../lib/drive/catalog';
type Fixture={sql:(query:string)=>string;actors:Record<string,{id:string;client:SupabaseClient}>;password:string;baseline:boolean};
/** Caller supplies a freshly owned loopback-only Task265 cluster and real synthetic password Auth clients. Never a shared database. */
export async function revocationRace({sql,actors,password,baseline}:Fixture){
 const owner=actors.en1440,ops=actors.ops;
 const trip={pickup:'Cairo synthetic pickup',dropoff:'Cairo synthetic return',pickupAt:'2099-12-08T21:00',returnAt:'2099-12-11T21:00',mode:'chauffeur',currency:'SAR',passengers:3,luggage:2,name:'Synthetic Revocation Lock',phone:'+201000000000',flightNumber:'',flightArrival:'',notes:'',specialRequest:'',acknowledged:true,minimumModelYear:null,acceptableModelYears:null};
 const made=await owner.client.rpc('create_managed_drive_request',{p_offer_id:'safeerat-eg-nissan-sunny',p_key:'task265-approval-revoke-lock',p_trip:trip,p_catalog_version:DRIVE_CATALOG_VERSION});assert.equal(made.error,null);
 const id=sql("SELECT id FROM public.marketplace_requests WHERE request_reference='"+made.data.reference+"'");assert.match(id,/^[a-f0-9-]{36}$/);
 assert.equal((await ops.client.rpc('review_managed_drive_request',{p_request_id:id,p_version:0,p_action:'review'})).error,null);
 assert.equal((await ops.client.rpc('review_managed_drive_request',{p_request_id:id,p_version:1,p_action:'confirm',p_vehicle:'Synthetic revocation car',p_vehicle_year:2026,p_amount:750,p_currency:'SAR',p_expires:'2099-12-07T12:00:00Z',p_note:''})).error,null);
 const lock=new Client({host:'127.0.0.1',port:31483,database:'postgres',user:'postgres',password,connectionTimeoutMillis:2000});let observed=false;
 await lock.connect();try{
  await lock.query('BEGIN');await lock.query('SELECT 1 FROM public.drive_request_context WHERE request_id=$1 FOR UPDATE',[id]);
  const pending=Promise.resolve(owner.client.rpc('accept_managed_drive_quote',{p_request_id:id,p_version:2}));
  for(let i=0;i<35;i++){if(sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND position('accept_managed_drive_quote' in query)>0)")==='t'){observed=true;break;}await new Promise(r=>setTimeout(r,50));}
  assert.ok(observed);sql("UPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id='"+owner.id+"'");await lock.query('COMMIT');const result=await pending;
  const approvals=sql("SELECT count(*) FROM public.drive_request_events WHERE request_id='"+id+"' AND action='customer_accept'"),notices=sql("SELECT count(*) FROM drive_notification_private.outbox WHERE request_id='"+id+"'");
  if(baseline){assert.equal(result.error,null);assert.equal(approvals,'1');return {status:'BASELINE_REPRODUCED',observedBlocked:true,acceptedAfterProfileRevoked:true,approvalAudits:1,notices:Number(notices)};}
  assert.equal(result.error?.code,'42501');assert.equal(approvals,'0');assert.equal(notices,'0');return {status:'PASS',observedBlocked:true,revocationRejected:true,noApprovalAudit:true,noNotice:true};
 }finally{try{await lock.query('ROLLBACK');}catch{}await lock.end();sql("UPDATE public.profiles SET deleted_at=NULL WHERE id='"+owner.id+"'");}
}
