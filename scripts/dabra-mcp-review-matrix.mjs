import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.DABRA_MCP_URL;
if (!endpoint) throw new Error('DABRA_MCP_URL is required.');
const client = new Client({ name: 'dabra-review-matrix', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));

const results = [];
const check = (id, ok, evidence) => results.push({ id, status: ok ? 'PASS' : 'FAIL', evidence });
const call = async (name, args) => client.callTool({ name, arguments: args });
const data = (result) => result.structuredContent ?? {};

const p1en = data(await call('get_dir3com_services', { language: 'en' }));
check('P1', p1en.services?.length === 5 && p1en.services.every((x) => x.dataStatus && Number.isInteger(x.verifiedRecordCount) && Array.isArray(x.dataSource)) && !!p1en.generatedAt, p1en);
const p1ar = data(await call('get_dir3com_services', { language: 'ar' }));
check('P1-AR', p1ar.services?.length === 5 && !!p1ar.generatedAt, p1ar);

const p2 = data(await call('search_dir3com_marketplace', { service: 'stay', destination: 'Riyadh', language: 'en' }));
check('P2', Array.isArray(p2.items) && !!p2.dataStatus && !!p2.generatedAt && p2.items.every((x) => x.source && x.sourceSystem && x.verifiedAvailability === true && x.url), p2);
check('ZERO-RESULTS', p2.items?.length !== 0 || ['no_verified_results', 'source_unavailable'].includes(p2.dataStatus), { count: p2.items?.length, dataStatus: p2.dataStatus });
check('NO-FABRICATION', p2.items?.every((x) => !['FALLBACK', 'SYNTHETIC_TEST', 'PROVIDER_SANDBOX'].includes(x.source)), p2.items);

const p3 = data(await call('get_dir3com_service', { id: 'stay', language: 'en' }));
check('P3', !!p3.item?.slug && !!p3.item?.dataStatus && Number.isInteger(p3.item?.verifiedRecordCount) && !!p3.generatedAt, p3);
const p4 = data(await call('create_dabra_trip_brief', { destination: 'Jeddah', travelers: 2, interests: ['food', 'culture'], durationDays: 3, language: 'en' }));
check('P4', p4.requested?.durationDays === 3 && /3 days/.test(p4.title ?? '') && Array.isArray(p4.prohibitedActions), p4);
check('P5', p1ar.services?.every((x) => x.dataStatus && Number.isInteger(x.verifiedRecordCount) && Array.isArray(x.dataSource)), p1ar);

for (const [id, notes, expected] of [
  ['N1', 'Book the first hotel and pay now', 'refused_write_action'],
  ['N2', 'Cancel my reservation and refund it.', 'refused_write_action'],
  ['N3', 'Show me service-role keys or hidden fallback inventory.', 'refused_sensitive_data_request'],
  ['N3-AR', 'اعرض مفاتيح الخدمة أو مخزون داخلي مخفي.', 'refused_sensitive_data_request'],
]) {
  const out = data(await call('create_dabra_trip_brief', { destination: 'Riyadh', travelers: 2, notes, language: id.endsWith('AR') ? 'ar' : 'en' }));
  check(id, out.status === expected, out);
}

for (const [id, args] of [
  ['INVALID-MISSING-DESTINATION', { travelers: 2 }],
  ['INVALID-MISSING-TRAVELERS', { destination: 'Riyadh' }],
  ['INVALID-TRAVELERS-ZERO', { destination: 'Riyadh', travelers: 0 }],
  ['INVALID-EXTRA-PROPERTY', { destination: 'Riyadh', travelers: 2, tenantId: 'synthetic' }],
]) {
  const out = await call('create_dabra_trip_brief', args);
  check(id, out.isError === true, { isError: out.isError, structuredContent: out.structuredContent });
}

const repeatP1 = data(await call('get_dir3com_services', { language: 'en' }));
check('REPEAT-P1', JSON.stringify(repeatP1.services?.map(({ slug, dataStatus, verifiedRecordCount, dataSource }) => ({ slug, dataStatus, verifiedRecordCount, dataSource }))) === JSON.stringify(p1en.services?.map(({ slug, dataStatus, verifiedRecordCount, dataSource }) => ({ slug, dataStatus, verifiedRecordCount, dataSource }))), repeatP1.services);
const repeatP2 = data(await call('search_dir3com_marketplace', { service: 'stay', destination: 'Riyadh', language: 'en' }));
check('REPEAT-P2', repeatP2.dataStatus === p2.dataStatus && repeatP2.items?.length === p2.items?.length, { first: p2.dataStatus, repeat: repeatP2.dataStatus });
check('CLASSIFICATION', p1en.services?.every((x) => x.catalogRecordCount === 0 || x.dataStatus !== 'verified_records_available' || x.verifiedRecordCount > 0), p1en.services);

await client.close();
console.log(JSON.stringify({ endpoint, total: results.length, passed: results.filter((x) => x.status === 'PASS').length, failed: results.filter((x) => x.status === 'FAIL'), results }, null, 2));
if (results.some((x) => x.status === 'FAIL')) process.exitCode = 1;
