import assert from 'node:assert/strict';
import test from 'node:test';

import { callDabraTool, dabraToolDefinitions } from '../lib/dabra/mcp';

test('DABRA exposes exactly four read-only tools with required annotations', () => {
  assert.deepEqual(dabraToolDefinitions.map((tool) => tool.name), [
    'get_dir3com_services',
    'search_dir3com_marketplace',
    'get_dir3com_service',
    'create_dabra_trip_brief',
  ]);
  for (const tool of dabraToolDefinitions) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: true, destructiveHint: false });
  }
});

test('Arabic and English service discovery identifies data status', async () => {
  for (const language of ['ar', 'en'] as const) {
    const result = await callDabraTool('get_dir3com_services', { language });
    const data = result.structuredContent as { services: Array<{ dataStatus: string }> };
    assert.equal(data.services.length, 5);
    assert.ok(data.services.every((service) => service.dataStatus.length > 0));
  }
});

test('marketplace search never returns fallback as verified availability', async () => {
  const result = await callDabraTool('search_dir3com_marketplace', { query: 'hotel', language: 'en' });
  const data = result.structuredContent as { items: Array<{ source: string; verifiedAvailability: boolean }> };
  assert.ok(data.items.every((item) => item.source !== 'FALLBACK' && item.verifiedAvailability === true));
});

test('trip brief rejects booking, payment, cancellation, and refund requests', async () => {
  for (const notes of ['book and pay now', 'cancel and refund', 'احجز وادفع الآن', 'ألغ الحجز واسترد المبلغ']) {
    const result = await callDabraTool('create_dabra_trip_brief', { destination: 'Riyadh', travelers: 2, notes, language: 'en' });
    const data = result.structuredContent as { status: string };
    assert.equal(data.status, 'refused_write_action');
  }
});

test('tool output does not expose privileged secrets', async () => {
  const result = await callDabraTool('get_dir3com_service', { id: 'stay', language: 'en' });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /service[_ -]?role|supabase[_ -]?key|authorization|bearer\s/i);
});
