import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeOptionalUuid } from '@/lib/marketplace/optional-uuid';
import { resolveStoredMarketplaceFamily } from '@/lib/marketplace/data';

const publicPdp = readFileSync('app/api/public/marketplace/items/[slug]/route.ts', 'utf8');
const operationsAction = readFileSync('lib/actions/operations-actions.ts', 'utf8');
const operationsTable = readFileSync('components/admin/MarketplaceRequestOperationsTable.tsx', 'utf8');
const baseMigration = readFileSync('supabase/migrations/20260829234937_dir120_revenue_request_transition_safety.sql', 'utf8');
const correctiveMigration = readFileSync('supabase/migrations/20260830033103_dir120_marketplace_request_audit_logs.sql', 'utf8');
const workflow = readFileSync('.github/workflows/pr-master-sandbox-validation.yml', 'utf8');
const postgresRunner = readFileSync('scripts/run-dir120-postgresql.mjs', 'utf8');
const postgresSuite = readFileSync('tests/postgresql/dir120-revenue-safety.sql', 'utf8');

test('nullable and malformed category ids never become UUID equality filters', () => {
  assert.equal(normalizeOptionalUuid(null), null);
  assert.equal(normalizeOptionalUuid(undefined), null);
  assert.equal(normalizeOptionalUuid('null'), null);
  assert.equal(normalizeOptionalUuid(''), null);
  assert.equal(normalizeOptionalUuid('86ed339b-8945-40fa-bc04-4a142c5d755e'), '86ed339b-8945-40fa-bc04-4a142c5d755e');
  assert.doesNotMatch(publicPdp, /\.eq\('id', product\.category_id\)/);
  assert.match(publicPdp, /if \(categoryId\) \{[\s\S]*?\.eq\('id', categoryId\)/);
  assert.equal(resolveStoredMarketplaceFamily('drive')?.key, 'dir3-drive');
  assert.deepEqual(resolveStoredMarketplaceFamily('drive')?.label, { ar: 'التنقّل', en: 'Drive' });
  assert.equal(resolveStoredMarketplaceFamily('unknown'), null);
});

test('missing category relation remains fail closed', () => {
  assert.match(publicPdp, /if \(!category\) \{[\s\S]*?return buildUnavailableResponse\(\)/);
  assert.match(publicPdp, /applyPublicCategoryFilters/);
});

test('request transition and audit are one atomic database operation', () => {
  assert.match(operationsAction, /rpc\('transition_marketplace_request'/);
  assert.doesNotMatch(operationsAction, /\.from\('marketplace_requests'\)[\s\S]*?\.update\(/);
  assert.match(correctiveMigration, /FOR UPDATE/);
  assert.match(correctiveMigration, /UPDATE public\.marketplace_requests[\s\S]*?INSERT INTO public\.marketplace_request_audit_logs/);
  assert.doesNotMatch(correctiveMigration, /INSERT INTO public\.audit_logs/);
  assert.match(correctiveMigration, /SECURITY INVOKER/);
  assert.match(correctiveMigration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(correctiveMigration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
});

test('canonical request audit ledger is append only and client-write closed', () => {
  assert.match(correctiveMigration, /CREATE TABLE public\.marketplace_request_audit_logs/);
  assert.match(correctiveMigration, /request_id uuid NOT NULL REFERENCES public\.marketplace_requests\(id\) ON DELETE RESTRICT/);
  assert.match(correctiveMigration, /actor_user_id uuid NOT NULL/);
  assert.doesNotMatch(correctiveMigration, /actor_user_id uuid[^\n]*REFERENCES/);
  assert.match(correctiveMigration, /actor_identity text NOT NULL/);
  assert.match(correctiveMigration, /previous_status text NOT NULL/);
  assert.match(correctiveMigration, /new_status text NOT NULL/);
  assert.match(correctiveMigration, /metadata jsonb NOT NULL/);
  assert.match(correctiveMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(correctiveMigration, /REVOKE ALL ON TABLE public\.marketplace_request_audit_logs FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(correctiveMigration, /GRANT SELECT, INSERT ON TABLE public\.marketplace_request_audit_logs TO service_role/);
  assert.match(correctiveMigration, /BEFORE UPDATE OR DELETE ON public\.marketplace_request_audit_logs/);
  assert.match(correctiveMigration, /BEFORE TRUNCATE ON public\.marketplace_request_audit_logs/);
  assert.match(correctiveMigration, /DIR120_REQUEST_AUDIT_APPEND_ONLY/);
  assert.match(correctiveMigration, /DIR120_ACTOR_NOT_AUTHORIZED/);
  assert.match(correctiveMigration, /AND status = 'active'/);
  assert.match(correctiveMigration, /AND deleted_at IS NULL/);
  assert.match(correctiveMigration, /idx_marketplace_request_audit_logs_request_created/);
  assert.match(correctiveMigration, /idx_marketplace_request_audit_logs_created/);
});

test('stale and unsafe confirmation transitions fail closed', () => {
  assert.match(operationsTable, /name="expectedStatus" value=\{request\.status\}/);
  assert.match(operationsTable, /defaultValue=\{request\.status\}/);
  assert.doesNotMatch(operationsTable, /defaultValue="under_review"/);
  assert.match(correctiveMigration, /DIR120_STALE_REQUEST_STATE/);
  assert.match(correctiveMigration, /DIR120_TRANSITION_NOT_ALLOWED/);
  assert.match(baseMigration, /DIR120_CONFIRMATION_EVIDENCE_REQUIRED/);
  assert.match(correctiveMigration, /DIR120_LEGACY_CONFIRMED_REQUIRES_RECONCILIATION/);
  assert.match(baseMigration, /DIR120_QUOTE_EVIDENCE_REQUIRED/);
  assert.match(baseMigration, /CREATE TABLE IF NOT EXISTS public\.marketplace_request_evidence/);
  assert.match(baseMigration, /request_id = current_request\.id/);
  assert.match(baseMigration, /user_id = current_request\.user_id/);
  assert.match(baseMigration, /product_id = current_request\.product_id/);
  assert.match(baseMigration, /supplier_context = current_request\.supplier_name/);
  assert.match(baseMigration, /status IN \('verified', 'captured', 'settled'\)/);
  assert.match(baseMigration, /status = 'accepted'/);
  assert.match(baseMigration, /evidence_type = 'quote'[\s\S]*expires_at IS NOT NULL/);
  assert.match(baseMigration, /source_type IN \('supplier', 'provider', 'operations'\)/);
  assert.match(baseMigration, /current_request\.quote_expires_at IS NOT NULL/);
  assert.match(correctiveMigration, /authoritative_evidence := public\.resolve_marketplace_request_confirmation_evidence/);
  assert.doesNotMatch(correctiveMigration, /confirmation_evidence = CASE WHEN p_new_status = 'confirmed' THEN evidence/);
  assert.match(baseMigration, /REVOKE ALL ON TABLE public\.marketplace_request_evidence FROM PUBLIC, anon, authenticated/);
});

test('unsupported transaction modes fail closed without canonical evidence', () => {
  assert.match(baseMigration, /transaction_mode NOT IN \('request_to_confirm', 'request_quote'\)/);
  assert.match(baseMigration, /DIR120_CANONICAL_EVIDENCE_UNAVAILABLE/);
  assert.match(correctiveMigration, /transaction_method, ''\), current_request\.request_type\) = 'request_quote'/);
  assert.match(correctiveMigration, /current_request\.status <> 'payment_verification'/);
});

test('terminal states cannot be reopened by the DIR-120 transition function', () => {
  for (const terminal of ['confirmed', 'declined', 'cancelled', 'completed', 'refunded']) {
    assert.doesNotMatch(correctiveMigration, new RegExp(`current_request\\.status = '${terminal}' AND p_new_status`));
  }
});

test('normal PR validation executes the real disposable PostgreSQL safety suite', () => {
  assert.match(workflow, /name: DIR-120 PostgreSQL Safety[\s\S]*?npm run test:dir120-postgresql/);
  assert.match(postgresRunner, /CREATE DATABASE/);
  assert.match(postgresRunner, /DROP DATABASE IF EXISTS/);
  assert.match(postgresRunner, /DIR120 refuses non-disposable database target/);
  assert.match(postgresRunner, /testClient\.query\(suite\)/);
  assert.match(postgresRunner, /20260829234937_dir120_revenue_request_transition_safety\.sql/);
  assert.match(postgresRunner, /20260830033103_dir120_marketplace_request_audit_logs\.sql/);
  assert.match(postgresSuite, /DIR120_BASE_MIGRATION_INCLUDE/);
  assert.match(postgresSuite, /DIR120_CORRECTIVE_MIGRATION_INCLUDE/);
  assert.doesNotMatch(postgresSuite, /CREATE TABLE public\.audit_logs/);
  assert.match(postgresSuite, /public\.marketplace_request_audit_logs/);
  assert.match(postgresSuite, /DIR120_POSTGRESQL=PASS cases=20/);
  assert.match(postgresSuite, /count\(\*\) FROM dir120_case_results\) <> 20/);
});
