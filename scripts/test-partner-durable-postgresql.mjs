import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const target = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (!['localhost', '127.0.0.1', 'postgres'].includes(target.hostname) || !/(^|[_-])test($|[_-])/.test(target.pathname.slice(1))) throw new Error('Disposable local TEST_DATABASE_URL required');
const admin = new Client({ connectionString: target.href });
const name = `partner_test_${randomBytes(6).toString('hex')}`;
let db;
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  const testUrl = new URL(target); testUrl.pathname = `/${name}`;
  db = new Client({ connectionString: testUrl.href }); await db.connect();
  await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;`);
  const baseline = readFileSync(new URL('../supabase/migrations/20260903215959_production_schema_baseline.sql', import.meta.url), 'utf8');
  const tables = ['partner_portal_assets','partner_portal_asset_media','partner_portal_review_queue','partner_portal_contracts'];
  for (const table of tables) {
    const definition = baseline.match(new RegExp(`CREATE TABLE "public"\\."${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(definition); await db.query(definition);
    await db.query(`ALTER TABLE public.${table} ADD PRIMARY KEY(id); ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owned ON public.${table} TO authenticated USING(auth.uid()=owner_id) WITH CHECK(auth.uid()=owner_id);
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated; GRANT ALL ON public.${table} TO service_role;`);
  }
  const rpc = baseline.match(/CREATE OR REPLACE FUNCTION public.persist_partner_portal_state\([\s\S]*?\$function\$\s*;/)?.[0];
  assert.ok(rpc); await db.query(rpc);
  await db.query('REVOKE ALL ON FUNCTION public.persist_partner_portal_state(jsonb,jsonb,jsonb,jsonb) FROM public; GRANT EXECUTE ON FUNCTION public.persist_partner_portal_state(jsonb,jsonb,jsonb,jsonb) TO service_role;');
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const record = (id, ownerId) => ({id,ownerId,ownerKind:'drive_partner',dataStatus:'needs_confirmation'});
  await db.query('INSERT INTO partner_portal_assets(id,owner_id,owner_kind,record) VALUES($1,$2,$3,$4),($5,$6,$3,$7)', ['a',a,'drive_partner',record('a',a),'b',b,record('b',b)]);
  const before = await db.query('SELECT id,owner_id,record FROM partner_portal_assets ORDER BY id');
  const migration = readFileSync(new URL('../supabase/migrations/20260909064524_partner_durable_owner_boundary.sql', import.meta.url),'utf8');
  await db.query(migration);
  assert.deepEqual((await db.query('SELECT id,owner_id,record FROM partner_portal_assets ORDER BY id')).rows, before.rows);
  await db.query('SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  assert.deepEqual((await db.query('SELECT id FROM partner_portal_assets')).rows,[{id:'a'}]);
  for (const table of tables) {
    assert.equal((await db.query("SELECT has_table_privilege(current_user,$1,'UPDATE') AS allowed",[table])).rows[0].allowed,false);
    await assert.rejects(db.query(`UPDATE ${table} SET record=record`), /permission denied/);
    await assert.rejects(db.query(`DELETE FROM ${table}`), /permission denied/);
    await assert.rejects(db.query(`INSERT INTO ${table}(id,owner_id,owner_kind,record) VALUES('forged',$1,'drive_partner',$2)`,[a,record('b',a)]), /permission denied/);
  }
  await assert.rejects(db.query('SELECT public.persist_partner_portal_state()'), /permission denied/);
  await db.query('RESET ROLE; SET ROLE anon'); await assert.rejects(db.query('SELECT * FROM partner_portal_assets'),/permission denied/);
  await db.query('RESET ROLE; SET ROLE service_role');
  const asset = (id, ownerId) => ({id,owner_id:ownerId,owner_kind:'drive_partner',record:record(id,ownerId),updated_at:new Date().toISOString()});
  await db.query('SELECT public.persist_partner_portal_state($1)',[JSON.stringify([asset('a',a)])]);
  await assert.rejects(db.query('SELECT public.persist_partner_portal_state($1)',[JSON.stringify([asset('b',a)])]), /IMMUTABLE_OWNER/);
  await assert.rejects(db.query("UPDATE partner_portal_assets SET record=jsonb_set(record,'{id}','\"b\"') WHERE id='a'"), /IDENTITY_CONFLICT/);
  await db.query(`INSERT INTO partner_portal_asset_media(id,owner_id,asset_id,owner_kind,storage_path,record) VALUES('media',$1,'a','drive_partner','safe/path',$2)`,[a,{...record('media',a),assetId:'a',url:'safe/path'}]);
  await assert.rejects(db.query("UPDATE partner_portal_asset_media SET storage_path='foreign/path' WHERE id='media'"), /STORAGE_CONFLICT/);
  await assert.rejects(db.query("UPDATE partner_portal_asset_media SET asset_id='b',record=jsonb_set(record,'{assetId}','\"b\"') WHERE id='media'"), /ASSOCIATION_CONFLICT/);
  const review = (id, mediaId, patch = {}) => ({...record(id,a),assetId:'a',mediaId,technicalValidationStatus:'fail',status:'needs_supplier_action',oldImageUrl:'',newImageUrl:'',...patch});
  const insertReview = (id, mediaId, patch = {}) => db.query('INSERT INTO partner_portal_review_queue(id,owner_id,owner_kind,asset_id,media_id,record) VALUES($1,$2,$3,$4,$5,$6)',[id,a,'drive_partner','a',mediaId,review(id,mediaId,patch)]);
  await insertReview('rejected-attempt','attempt-without-stored-media');
  await insertReview('real-media-review','media',{technicalValidationStatus:'pass',status:'pending_review'});
  await assert.rejects(insertReview('invented-success','missing',{technicalValidationStatus:'pass',status:'pending_review'}), /MEDIA_ASSOCIATION_CONFLICT/);
  await db.query("INSERT INTO partner_portal_asset_media(id,owner_id,owner_kind,asset_id,storage_path,record) VALUES('foreign-media',$1,'drive_partner','b','b/path',$2)",[b,{...record('foreign-media',b),assetId:'b',url:'b/path'}]);
  await assert.rejects(insertReview('foreign-review','foreign-media'), /MEDIA_ASSOCIATION_CONFLICT/);
  await db.query('RESET ROLE');
  assert.equal((await db.query("SELECT owner_id FROM partner_portal_assets WHERE id='b'")).rows[0].owner_id,b);
  for (const table of tables) assert.equal((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
  console.log('PARTNER_DURABLE_POSTGRESQL=PASS own_read=PASS cross_read_denied=PASS direct_forgery_denied=PASS service_write=PASS owner_immutable=PASS JSON_identity=PASS associations=PASS storage_path=PASS rows_preserved=PASS RLS_preserved=PASS');
} finally {
  if (db) await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
