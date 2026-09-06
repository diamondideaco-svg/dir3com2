import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Disposable database in the existing local PG17 container only. No env URLs.
const container = 'dir3com-pr93-pg17';
const database = `partner_activation_test_${randomBytes(8).toString('hex')}`;
assert.match(database,/^partner_activation_test_[a-f0-9]{16}$/);
const read = (path) => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const literal = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'","''")}'`;
function sql(query, db=database) {
  return execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq'],
    { input:query,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe'] }).trim();
}
function denied(query, code) {
  try { sql(query); } catch (error) { assert.match(String(error.stderr),new RegExp(code)); return; }
  assert.fail(`Expected ${code}`);
}
const actor = randomUUID(), partner = randomUUID(), other = randomUUID(), staff = randomUUID(), customer = randomUUID();
function as(role,user,query) {
  assert.ok(['authenticated','anon','service_role'].includes(role));
  return `SET ROLE ${role}; SET request.jwt.claim.sub=${literal(user || '')}; ${query}`;
}
const snapshot = () => sql(`SELECT jsonb_build_object('partners',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.partners p), 'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_logs a))`);
function call({ user=actor,role='authenticated',target=partner,expected='approved',time,confirmed=true,reason='Administrator reviewed eligibility' }={}) {
  const timestamp=time === undefined ? sql(`SELECT updated_at::text FROM public.partners WHERE id=${literal(target)}::uuid`) : time;
  return as(role,user,`SELECT public.activate_partner_with_attestation(${literal(target)}::uuid,${literal(expected)},${literal(timestamp)}::timestamptz,${confirmed === null ? 'NULL' : confirmed},${literal(reason)},'approval-ref-1')`);
}
let created=false;
try {
  assert.match(sql('SHOW server_version','postgres'),/^17\./);
  sql(`CREATE DATABASE "${database}"`,'postgres'); created=true;
  // Reuse the established PR93 baseline fixture, not live schema or data.
  const bootstrap=read('scripts/run-admin-partner-lifecycle-postgresql.mjs').match(/const bootstrap = `([\s\S]*?)`;/)?.[1];
  assert.ok(bootstrap); sql(bootstrap);
  sql(`ALTER TABLE public.partners ADD COLUMN deleted_at timestamptz,ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(); GRANT USAGE ON SCHEMA auth TO authenticated,service_role,anon;`);
  const migrations=[
    '20260906013832_reconcile_pr93_operations_notifications.sql',
    '20260903234500_admin_product_lifecycle_and_request_handoff.sql',
    '20260903234600_partner_request_handoff.sql',
    '20260903234700_drop_legacy_admin_handoff_rpc.sql',
    '20260904004000_harden_admin_partner_authorization.sql',
    '20260905160435_reconcile_admin_partner_lifecycle_safety.sql',
    '20260905161554_reconcile_phase0_lifecycle_insert.sql',
    '20260906034500_partner_trusted_activation.sql',
  ];
  for(const migration of migrations) sql(read(`supabase/${migration.startsWith('20260906034500_') ? 'migrations' : 'migrations-archive'}/${migration}`));
  sql(`INSERT INTO public.profiles(id,role) VALUES(${literal(actor)},'admin'),(${literal(partner)},'partner'),(${literal(other)},'partner'),(${literal(staff)},'staff'),(${literal(customer)},'customer');
    INSERT INTO public.partners(id,status) VALUES(${literal(partner)},'approved'),(${literal(other)},'active');
    INSERT INTO public.team_access_grants(invited_user_id,country_scope,permissions) VALUES(${literal(staff)},ARRAY['EG'],ARRAY['partners:write','admin:full']);`);
  denied(as('service_role',null,`SELECT * FROM public.get_partner_marketplace_requests(${literal(partner)},NULL)`),'PARTNER_REQUEST_ACTOR_DENIED');
  for(const user of [partner,other,staff,customer,null]) {
    const before=snapshot(); denied(call({user}),'PARTNER_ACTIVATION_FORBIDDEN'); assert.equal(snapshot(),before);
  }
  for(const role of ['anon','service_role']) {
    const before=snapshot(); denied(call({role,user:actor}),'permission denied for function'); assert.equal(snapshot(),before);
  }
  for(const status of ['inactive','pending']) {
    sql(`UPDATE public.profiles SET status=${literal(status)} WHERE id=${literal(actor)}`);
    const before=snapshot(); denied(call(),'PARTNER_ACTIVATION_FORBIDDEN'); assert.equal(snapshot(),before);
  }
  sql(`UPDATE public.profiles SET status='active',deleted_at=now() WHERE id=${literal(actor)}`);
  denied(call(),'PARTNER_ACTIVATION_FORBIDDEN');
  sql(`UPDATE public.profiles SET deleted_at=NULL WHERE id=${literal(actor)}`);
  for(const input of [{confirmed:false},{confirmed:null},{reason:''},{reason:'  '},{reason:'x'.repeat(1001)}]) {
    const before=snapshot(); denied(call(input),'PARTNER_ACTIVATION_ATTESTATION_REQUIRED'); assert.equal(snapshot(),before);
  }
  for(const status of ['pending','under_review','rejected','suspended','archived','inactive','active']) {
    sql(`UPDATE public.partners SET status=${literal(status)} WHERE id=${literal(partner)}`);
    const before=snapshot(); denied(call(),'PARTNER_ACTIVATION_STATE_CONFLICT'); assert.equal(snapshot(),before);
    denied(call({expected:status}),'PARTNER_ACTIVATION_STATE_CONFLICT');
  }
  sql(`UPDATE public.partners SET status='approved' WHERE id=${literal(partner)}`);
  for(const input of [{time:null},{time:'2000-01-01T00:00:00Z'},{expected:null}]) denied(call(input),'PARTNER_ACTIVATION_STATE_CONFLICT');
  for(const table of ['profiles','partners']) {
    sql(`UPDATE public.${table} SET deleted_at=now() WHERE id=${literal(partner)}`);
    const before=snapshot(); denied(call(),'PARTNER_ACTIVATION_TARGET_DENIED'); assert.equal(snapshot(),before);
    sql(`UPDATE public.${table} SET deleted_at=NULL WHERE id=${literal(partner)}`);
  }
  sql(`UPDATE public.profiles SET status='inactive' WHERE id=${literal(partner)}`);
  denied(call(),'PARTNER_ACTIVATION_TARGET_DENIED');
  sql(`UPDATE public.profiles SET status='active' WHERE id=${literal(partner)}`);
  denied(call({target:randomUUID(),time:'2026-01-01'}),'PARTNER_ACTIVATION_TARGET_DENIED');
  denied(call({target:customer,time:'2026-01-01'}),'PARTNER_ACTIVATION_TARGET_DENIED');
  // Inject an isolated audit insert failure after the UPDATE statement.
  sql("ALTER TABLE public.audit_logs ADD CONSTRAINT test_audit_failure CHECK(action <> 'partner.activated')");
  const beforeFailure=snapshot();
  denied(call(),'test_audit_failure');
  assert.equal(snapshot(),beforeFailure,'audit failure must roll back both status and audit');
  sql('ALTER TABLE public.audit_logs DROP CONSTRAINT test_audit_failure');
  const staleCall=call();
  assert.equal(sql(staleCall),'active');
  const audit=JSON.parse(sql(`SELECT to_jsonb(a) FROM public.audit_logs a WHERE action='partner.activated'`));
  assert.equal(audit.performed_by,actor); assert.equal(audit.entity_id,partner);
  assert.equal(audit.old_values.status,'approved'); assert.equal(audit.new_values.status,'active');
  assert.equal(audit.new_values.confirmed,true); assert.equal(audit.new_values.evidence_type,'admin_attestation');
  assert.equal(audit.new_values.approval_reference,'approval-ref-1'); assert.ok(audit.timestamp);
  const after=snapshot(); denied(staleCall,'PARTNER_ACTIVATION_STATE_CONFLICT'); assert.equal(snapshot(),after);
  for(const mutation of ["UPDATE public.audit_logs SET action='forged'",'DELETE FROM public.audit_logs','TRUNCATE public.audit_logs']) denied(mutation,'OPERATIONS_RECORD_APPEND_ONLY');
  assert.equal(sql(as('service_role',null,`SELECT count(*) FROM public.get_partner_marketplace_requests(${literal(partner)},NULL)`)),'0');
  // Two real fixture requests prove own-read and foreign-id denial, not nonexistent UUIDs.
  const productA=randomUUID(),productB=randomUUID(),requestA=randomUUID(),requestB=randomUUID();
  sql(`INSERT INTO public.products(id,slug) VALUES(${literal(productA)},'qa-a'),(${literal(productB)},'qa-b');
    INSERT INTO public.product_availability(product_id,partner_id) VALUES(${literal(productA)},${literal(partner)}),(${literal(productB)},${literal(other)});
    INSERT INTO public.marketplace_requests(id,request_reference,product_id) VALUES(${literal(requestA)},'QA-A',${literal(productA)}),(${literal(requestB)},'QA-B',${literal(productB)});`);
  for(const [owner,own,foreign] of [[partner,requestA,requestB],[other,requestB,requestA]]) {
    assert.equal(sql(as('service_role',null,`SELECT count(*) FROM public.get_partner_marketplace_requests(${literal(owner)},${literal(own)})`)),'1');
    assert.equal(sql(as('service_role',null,`SELECT count(*) FROM public.get_partner_marketplace_requests(${literal(owner)},${literal(foreign)})`)),'0');
    denied(as('service_role',null,`SELECT * FROM public.start_partner_marketplace_request_handoff(${literal(owner)},${literal(foreign)},NULL)`),'REQUEST_PARTNER_SCOPE_DENIED');
  }
  assert.equal(sql('SELECT count(*) FROM public.marketplace_request_handoff_events'),'0');
  assert.equal(sql("SELECT count(*) FROM public.audit_logs WHERE action='partner.activated'"),'1');
  console.log('POSTGRESQL17=PASS PR93_CHAIN=PASS ADMIN_ATTESTATION=PASS DENIAL_MATRIX=PASS STALE=PASS ATOMIC_ROLLBACK=PASS APPEND_ONLY=PASS PARTNER_ISOLATION=PASS');
} finally {
  if(created) sql(`DROP DATABASE "${database}"`,'postgres'); // Only this run's random disposable DB.
}
