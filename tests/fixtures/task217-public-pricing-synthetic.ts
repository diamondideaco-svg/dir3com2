import type { AgentProviderId } from '../../lib/dabra/agent-capabilities';
// Synthetic public documents; never customer-facing fallback data.
export const SYNTHETIC_PUBLIC_PRICING_BODIES: Readonly<Record<AgentProviderId, string>> = {
  openai: 'Model ID: \x60gpt-6-luna\x60\n## Pricing\n### Text tokens\n| Input | $0.1 | 1M tokens |\n| Output | $0.5 | 1M tokens |\n## Endpoints\n',
  anthropic: 'Model ID: \x60claude-sonnet-5-5\x60\n### Pricing\n| Input | $2 / MTok |\n| Output | $10 / MTok |\n### Capabilities\n',
  gemini: '## Gemini 3.8 Flash  {% id="gemini-3.8-flash" %}\n*[\x60gemini-3.8-flash\x60](/docs/models/gemini-3.8-flash)*\n{% tab title="Standard" %}\nPaid Tier, per 1M tokens in USD\nInput price $0.75\nOutput price (including thinking tokens) $3.75\n{% /tab %}\n## Other\n',
  xai: '<h1>Grok 4.20 (Non-Reasoning)</h1>grok-4.20-0309-non-reasoning<h2>Pricing</h2>Input $1.25 / 1M tokens Output $2.50 / 1M tokens<h2>Details</h2>',
  deepseek: '<table><tr><td>MODEL</td><td>deepseek-flash</td><td>deepseek-v4-pro</td></tr><tr><td>1M INPUT TOKENS CACHE MISS PEAK $0.3 $1.32</td></tr><tr><td>OUTPUT PEAK $1.2 $3.96</td></tr></table><h2>Other</h2>',
  qwen: '<h2>Singapore</h2><table><thead><tr><th>Model ID</th><th>Input per 1 million tokens</th><th>Output per 1 million tokens</th></tr></thead><tbody><tr><td><p>qwen3.8-flash</p></td><td>International 0&lt;Token≤1M</td><td>$0.15</td><td>$0.47</td></tr></tbody></table>',
  mistral: '<label><button role="checkbox" aria-checked="false"></button>Regional inference</label><div role="group" aria-label="Pricing mode"><button aria-pressed="true">Standard</button><button aria-pressed="false">Batch</button></div><div role="group" aria-label="Pricing currency"><button aria-pressed="true">USD</button><button aria-pressed="false">EUR</button></div><table><tr><th>Model</th><th>Input</th><th>Cached input</th><th>Output</th></tr><tr><td><a href="/models/mistral-small-4-0-26-03">Mistral Small 4</a></td><td>$0.15</td><td>$0.015</td><td>$0.6</td></tr></table><p>Prices /M Tokens</p>',
};
