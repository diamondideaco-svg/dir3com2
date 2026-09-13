import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// A randomly named disposable database inside a caller-selected LOCAL container.
// Never accepts a remote database URL or modifies an existing application's data.
const container = process.env.PARTNER_VIDEO_QA_CONTAINER || 'dir3com-partner-video-pg17';
assert.match(container, /^(dir3com-[a-z0-9-]+|v6-docs-[a-f0-9]+-db)$/);
const db = 'video_qa_' + randomBytes(8).toString('hex');
const args = database => ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = (query, database = db) => execFileSync('docker', args(database), { input: query, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const asyncSql = query => new Promise((resolve, reject) => {
  const child = execFile('docker', args(db), { encoding: 'utf8', timeout: 20000 }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
  child.stdin.end(query);
});
const owner = randomUUID(), actor = randomUUID();
const call = (id, action = 'APPROVE') => `select public.review_partner_portal_media('${id}','${action}','${actor}','QA review');`;
const denied = (query, message) => {
  assert.throws(() => sql(query), error => String(error.stderr).includes(message));
};
let created = false;
try {
  assert.match(sql('show server_version;', 'postgres'), /^17\./);
  sql(`create database ${db};`, 'postgres'); created = true;
  sql(`
    create table public.partner_portal_assets(id text primary key, owner_id uuid, owner_kind text, record jsonb, updated_at timestamptz);
    create table public.partner_portal_asset_media(id text primary key, asset_id text, owner_id uuid, owner_kind text, record jsonb, updated_at timestamptz);
    create table public.partner_portal_review_queue(id text primary key, asset_id text, media_id text, owner_id uuid, owner_kind text, record jsonb, updated_at timestamptz, created_at timestamptz default now());
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    insert into public.partner_portal_assets values('asset','${owner}','drive_partner','{"dataStatus":"pending_review"}',now());
    insert into public.partner_portal_asset_media
      select 'm'||n,'asset','${owner}','drive_partner','{"status":"pending_review"}',now() from generate_series(1,2) n;
    insert into public.partner_portal_review_queue(id,asset_id,media_id,owner_id,owner_kind,record)
      select 'q'||n,'asset','m'||n,'${owner}','drive_partner','{"status":"pending_review","technicalValidationStatus":"pass"}' from generate_series(1,2) n;
  `);
  sql(readFileSync(new URL('../supabase/migrations/20260913174922_partner_media_atomic_review.sql', import.meta.url), 'utf8'));
  for (const role of ['anon', 'authenticated']) denied(`set role ${role}; ${call('q1')}`, 'permission denied');
  await Promise.all([asyncSql('set role service_role; ' + call('q1')), asyncSql('set role service_role; ' + call('q2'))]);
  assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'needs_confirmation');
  sql(`insert into public.partner_portal_review_queue(id,asset_id,owner_id,owner_kind,record) values('initial-catalog','asset','${owner}','drive_partner','{"status":"pending_review","technicalValidationStatus":"pass"}');`);
  sql(call('initial-catalog'));
  assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'published');
  assert.equal(sql("select count(*) from public.partner_portal_asset_media where record->>'status'='published'"), '2');
  denied(call('q1'), 'REVIEW_ITEM_NOT_PENDING');
  for (const action of ['REJECT', 'REQUEST_REPLACEMENT']) {
    sql(`update public.partner_portal_review_queue set record='{"status":"pending_review","technicalValidationStatus":"pass"}' where id='q1'; update public.partner_portal_asset_media set record='{"status":"pending_review"}' where id='m1';`);
    sql(call('q1', action));
    assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'needs_confirmation');
  }
  sql(`update public.partner_portal_review_queue set record='{"status":"pending_review","technicalValidationStatus":"pass"}' where id='q1'; update public.partner_portal_asset_media set record='{"status":"archived"}' where id='m1';`);
  denied(call('q1'), 'REVIEW_ITEM_NOT_PENDING');
  sql(`update public.partner_portal_asset_media set record='{"status":"pending_review"}',owner_id='${randomUUID()}' where id='m1';`);
  denied(call('q1'), 'REVIEW_ASSOCIATION_INVALID');
  sql(`update public.partner_portal_asset_media set owner_id='${owner}' where id='m1'; insert into public.partner_portal_review_queue(id,asset_id,owner_id,owner_kind,record) values('catalog','asset','${owner}','drive_partner','{"status":"pending_review","technicalValidationStatus":"pass"}');`);
  sql(call('q1'));
  assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'needs_confirmation');
  sql(call('catalog'));
  assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'published');
  assert.equal(sql(`select count(*) from public.partner_portal_review_queue where record->>'actionBy'='${actor}' and record->>'actionAt' is not null`), '4');
  sql(`insert into public.partner_portal_review_queue(id,asset_id,owner_id,owner_kind,record,created_at) values('obsolete','asset','${owner}','drive_partner','{"status":"pending_review","technicalValidationStatus":"pass"}',now()-interval '1 day');`);
  denied(call('obsolete', 'REJECT'), 'REVIEW_ITEM_NOT_PENDING');
  assert.equal(sql("select record->>'dataStatus' from public.partner_portal_assets where id='asset'"), 'published');
  console.log('POSTGRESQL17 PASS: unauthorized roles, concurrent approvals, replay, reject, replacement, archived, tenant association, catalog gate, audit, obsolete catalog, missing catalog (11 checks)');
} finally {
  if (created) sql(`drop database ${db};`, 'postgres'); // Only the random DB created above.
}
