import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.DABRA_MCP_URL || 'http://127.0.0.1:3003/api/dabra/mcp';
const client = new Client({ name: 'dabra-mcp-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

await client.connect(transport);
const listed = await client.listTools();
const expected = [
  'get_dir3com_services',
  'search_dir3com_marketplace',
  'get_dir3com_service',
  'create_dabra_trip_brief',
];

if (JSON.stringify(listed.tools.map((tool) => tool.name)) !== JSON.stringify(expected)) {
  throw new Error('Unexpected DABRA tool list.');
}

for (const tool of listed.tools) {
  const annotations = tool.annotations || {};
  if (annotations.readOnlyHint !== true || annotations.openWorldHint !== true || annotations.destructiveHint !== false) {
    throw new Error(`Invalid annotations for ${tool.name}.`);
  }
}

const calls = [
  ['get_dir3com_services', { language: 'ar' }],
  ['search_dir3com_marketplace', { query: 'hotel', language: 'en' }],
  ['get_dir3com_service', { id: 'stay', language: 'en' }],
  ['create_dabra_trip_brief', { destination: 'Riyadh', travelers: 2, language: 'ar' }],
];

for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} returned an MCP error.`);
}

const refused = await client.callTool({
  name: 'create_dabra_trip_brief',
  arguments: { destination: 'Riyadh', travelers: 2, notes: 'book, pay, cancel and refund', language: 'en' },
});
if (refused.structuredContent?.status !== 'refused_write_action') {
  throw new Error('Write-action refusal test failed.');
}

console.log(JSON.stringify({ endpoint, initialize: 'PASS', toolsList: 'PASS', calls: 'PASS', annotations: 'PASS', refusal: 'PASS' }));
await client.close();
