// Isolated embedded PostgreSQL only. Never accepts a remote connection string.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
if (!process.env.CONTACT_QA_PGLITE_MODULE) throw new Error('Provide path to isolated @electric-sql/pglite module');
const { PGlite } = await import(pathToFileURL(process.env.CONTACT_QA_PGLITE_MODULE));
const db = new PGlite();
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20260928234244_contact_durable_inbox.sql',import.meta.url),'utf8'));
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.contact_enquiries'));checks++;
    await assert.rejects(db.query('select public.receive_contact_enquiry($1,$2,$3,$4)',[randomUUID(),'a'.repeat(64),'b'.repeat(64),{}]));checks++;
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const key=randomUUID(), actor=randomUUID(), fingerprint='a'.repeat(64), sender='b'.repeat(64);
  const input={name:'QA',email:'qa@example.invalid',phone:'',subject:'service',message:'QA isolated only',country:'EG'};
  const submit=async(k=key,f=fingerprint,s=sender)=> (await db.query('select public.receive_contact_enquiry($1,$2,$3,$4) as result',[k,f,s,input])).rows[0].result;
  const first=await submit();check(first.kind,'saved');check(first.replay,false);
  const retry=await submit();check(retry.reference,first.reference);check(retry.replay,true);
  check((await submit(key,'c'.repeat(64))).kind,'conflict');
  check((await db.query('select count(*)::int as n from public.contact_enquiry_events')).rows[0].n,1);
  const progress=(countries,expected,status)=>db.query('select public.progress_contact_enquiry($1,$2,$3,$4,$5,$6) as changed',[first.reference,actor,countries,expected,status,'Internal QA note']);
  await assert.rejects(progress(['SA'],'received','in_progress'));checks++;
  check((await progress(['EG'],'received','in_progress')).rows[0].changed,true);
  check((await progress(['EG'],'received','in_progress')).rows[0].changed,false);
  await assert.rejects(progress(['EG'],'received','closed'));checks++;
  check((await progress(['EG'],'in_progress','closed')).rows[0].changed,true);
  check((await db.query('select count(*)::int as n from public.contact_enquiry_events')).rows[0].n,3);
  await submit(randomUUID());await submit(randomUUID());check((await submit(randomUUID())).kind,'limited');
  for(let i=3;i<100;i++) check((await submit(randomUUID(),fingerprint,i.toString(16).padStart(64,'0'))).kind,'saved');
  check((await submit(randomUUID(),fingerprint,'f'.repeat(64))).kind,'limited');
  check((await submit()).replay,true); // Retry survives global limit.
  await assert.rejects(db.query('delete from public.contact_enquiry_events'));checks++;
  console.log(`ISOLATED_POSTGRES_ASSERTIONS=${checks} PASS; no remote database used`);
} finally { await db.close(); }
