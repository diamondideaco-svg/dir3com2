import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationRecord, type InAppNotificationInput } from '../lib/operations/operations-engine';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const profileId = '11111111-1111-4111-8111-111111111111';
function fixture(options: { missing?: boolean; recipientError?: boolean; insertError?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  const filters: unknown[] = [];
  const client = { from(table: string) {
    if (table === 'profiles') {
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        maybeSingle: async () => ({ data: options.missing ? null : { id: profileId }, error: options.recipientError ? { message: 'private schema detail' } : null }),
      };
      return chain;
    }
    assert.equal(table, 'notifications');
    return { insert(row: Record<string, unknown>) {
      writes.push(row);
      return { select: () => ({ single: async () => ({ data: options.insertError ? null : { id: 'notification', ...row }, error: options.insertError ? { message: 'private SQL detail' } : null }) }) };
    } };
  } } as unknown as SupabaseClient;
  return { client, writes, filters };
}

test('notification insertion uses canonical recipient/title/kind and in-app status only', async () => {
  const f = fixture();
  const input = { profileId, title: '  تحديث طلبك / Request update  ', body: 'Body', kind: 'booking', status: 'Sent', recipient_type: 'customer', provider: 'invented', metadata: {} };
  const result = await createNotificationRecord(f.client, input as InAppNotificationInput);
  assert.equal(result.success, true);
  assert.deepEqual(f.writes, [{ profile_id: profileId, title: 'تحديث طلبك / Request update', body: 'Body', kind: 'booking', status: 'active' }]);
  assert.deepEqual(f.filters, [['id', profileId], ['status', 'active'], ['deleted_at', null]]);
});

test('minimal in-app notification has non-null title and no invented delivery status', async () => {
  const f = fixture();
  assert.equal((await createNotificationRecord(f.client, { profileId, title: 'Title' })).success, true);
  assert.deepEqual(f.writes[0], { profile_id: profileId, title: 'Title', body: null, kind: 'info', status: 'active' });
});

test('invalid title, recipient, kind and malformed payload fail before writing', async () => {
  for (const input of [null, {}, { profileId, title: ' ' }, { profileId: 'bad', title: 'Title' }, { profileId, title: 'Title', kind: 'email' }, { profileId, title: 'Title', body: 42 }]) {
    const f = fixture();
    assert.equal((await createNotificationRecord(f.client, input as InAppNotificationInput)).success, false);
    assert.equal(f.writes.length, 0);
  }
});

test('missing/inactive/deleted recipient or lookup error cannot create a notification', async () => {
  for (const options of [{ missing: true }, { recipientError: true }]) {
    const f = fixture(options);
    const result = await createNotificationRecord(f.client, { profileId, title: 'Title' });
    assert.deepEqual(result, { success: false, error: 'NOTIFICATION_RECIPIENT_UNAVAILABLE' });
    assert.equal(f.writes.length, 0);
  }
});

test('insert error does not leak SQL or claim success', async () => {
  assert.deepEqual(await createNotificationRecord(fixture({ insertError: true }).client, { profileId, title: 'Title' }), { success: false, error: 'NOTIFICATION_CREATE_FAILED' });
});

test('notification server actions enforce admin guard and external delivery remains unavailable', async () => {
  const source = read('lib/actions/operations-actions.ts');
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  let allowed = false;
  let calls = 0;
  const guard = async () => { if (!allowed) throw new Error('Forbidden'); return { supabase: 'authorized-server-client' }; };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    require: (name: string) => {
      if (name === 'next/cache') return {};
      if (name === '@/lib/auth/admin') return { requireAdminActionAccess: guard, requireAdminReadAccess: guard };
      if (name === '@/lib/operations/operations-engine') return { createNotificationRecord: async (client: string) => { assert.equal(client, 'authorized-server-client'); calls++; return { success: true }; } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  await assert.rejects(exports.createNotification({ profileId, title: 'Title' }), /Forbidden/);
  await assert.rejects(exports.sendNotification(), /Forbidden/);
  assert.equal(calls, 0);
  allowed = true;
  await exports.createNotification({ profileId, title: 'Title' });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(await exports.sendNotification()), JSON.stringify({ success: false, error: 'NOTIFICATION_DELIVERY_UNAVAILABLE' }));
  assert.equal(calls, 1);
});

test('read consumers use title and do not manufacture a failed-delivery count', () => {
  assert.match(read('components/admin/NotificationTable.tsx'), /\{item.title\}/);
  const dashboard = read('lib/integration/dashboard-engine.ts');
  assert.match(dashboard, /failedNotifications: \{ status: 'unavailable' \}/);
  assert.doesNotMatch(dashboard, /from\('notifications'\)/);
  const notificationCode = read('lib/operations/operations-engine.ts').split('export interface InAppNotificationInput')[1];
  assert.doesNotMatch(notificationCode, /recipient_type|recipient_id|notification_logs|notification_templates|Pending|Queued|Sent|Delivered|provider|metadata|subject|channel/);
});

test('migration preserves notifications and limits operations access', () => {
  const sql = read('supabase/migrations/20260906013832_reconcile_pr93_operations_notifications.sql').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\bnotifications\b|notification_templates|notification_logs|dabra/i);
  for (const table of ['audit_logs', 'activity_timeline', 'system_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql, /performed_by=\(SELECT auth.uid\(\)\)::text/);
  assert.match(sql, /OPERATIONS_RECORD_APPEND_ONLY/);
  assert.match(sql, /PR93_OPERATIONS_SCHEMA_CONFLICT/);
});
