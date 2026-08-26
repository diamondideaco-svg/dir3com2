import { callDabraTool, dabraToolDefinitions, DABRA_MCP_PROTOCOL_VERSION } from '@/lib/dabra/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id',
  'Access-Control-Expose-Headers': 'MCP-Protocol-Version',
  'Cache-Control': 'no-store',
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function jsonRpc(id: JsonRpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  return Response.json(
    error ? { jsonrpc: '2.0', id: id ?? null, error } : { jsonrpc: '2.0', id: id ?? null, result },
    { headers: { ...corsHeaders, 'MCP-Protocol-Version': DABRA_MCP_PROTOCOL_VERSION } },
  );
}

async function handleMessage(message: JsonRpcRequest) {
  if (message.jsonrpc !== '2.0' || !message.method) {
    return { error: { code: -32600, message: 'Invalid JSON-RPC request.' } };
  }

  if (message.method === 'initialize') {
    const requestedVersion = typeof message.params?.protocolVersion === 'string'
      ? message.params.protocolVersion
      : DABRA_MCP_PROTOCOL_VERSION;
    return {
      result: {
        protocolVersion: requestedVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'DABRA by DIR3COM', version: '1.0.0' },
        instructions: 'Read-only DIR3COM travel planning. Never claim or perform booking, payment, cancellation, refund, account changes, or database writes. Clearly distinguish verified marketplace data from catalog-only information.',
      },
    };
  }

  if (message.method === 'notifications/initialized' || message.method === 'ping') {
    return { result: {} };
  }

  if (message.method === 'tools/list') {
    return { result: { tools: dabraToolDefinitions } };
  }

  if (message.method === 'tools/call') {
    const name = typeof message.params?.name === 'string' ? message.params.name : '';
    const args = message.params?.arguments;
    try {
      return { result: await callDabraTool(name, args && typeof args === 'object' ? args as Record<string, unknown> : {}) };
    } catch (error) {
      return {
        result: {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool call failed.' }],
        },
      };
    }
  }

  return { error: { code: -32601, message: `Method not found: ${message.method}` } };
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonRpc(null, undefined, { code: -32600, message: 'Content-Type must be application/json.' });
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await request.json();
  } catch {
    return jsonRpc(null, undefined, { code: -32700, message: 'Parse error.' });
  }

  if (Array.isArray(payload)) {
    const responses = await Promise.all(payload.map(async (message) => {
      const handled = await handleMessage(message);
      return handled.error
        ? { jsonrpc: '2.0', id: message.id ?? null, error: handled.error }
        : { jsonrpc: '2.0', id: message.id ?? null, result: handled.result };
    }));
    return Response.json(responses, { headers: { ...corsHeaders, 'MCP-Protocol-Version': DABRA_MCP_PROTOCOL_VERSION } });
  }

  const handled = await handleMessage(payload);
  return handled.error
    ? jsonRpc(payload.id, undefined, handled.error)
    : jsonRpc(payload.id, handled.result);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json(
    { name: 'DABRA by DIR3COM', transport: 'Streamable HTTP', endpoint: '/api/dabra/mcp', readOnly: true },
    { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } },
  );
}
