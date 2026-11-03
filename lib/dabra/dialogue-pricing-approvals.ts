import 'server-only';
import type { AgentProviderId } from './agent-capabilities';

type StandardPricingFields = Readonly<{
  provider: AgentProviderId; model: string; serviceTier: 'standard'; currency: 'USD';
  inputMicrosPerMillion: number; outputMicrosPerMillion: number; sourceUrl: string; sha256: string;
}>;
export type ApprovedDialogueStandardPricing = StandardPricingFields & (
  | Readonly<{ schema: 'reviewed-standard-pricing-v1'; observedAtMs: number; validFromMs: number; expiresAtMs: number }>
  | Readonly<{ schema: 'reviewed-standard-pricing-v2' }>
);

/**
 * Compiled review authority only, never a caller/ENV/URL-fetched approval.
 * v1 keeps its original bounded historical window. v2 approves semantic tariff
 * data, not a runtime observation, credit grant, profile or permission to send.
 * A v2 quote additionally requires fresh evidenced verification in stored proof.
 */
export const APPROVED_DIALOGUE_STANDARD_PRICING: readonly ApprovedDialogueStandardPricing[] = Object.freeze([
  Object.freeze({
    schema: 'reviewed-standard-pricing-v2', provider: 'anthropic', model: 'claude-sonnet-5-5',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 2000000, outputMicrosPerMillion: 10000000,
    sourceUrl: 'https://platform.claude.com/docs/en/models/sonnet-5-5/overview',
    sha256: '97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4',
  }),
  // Current semantic references only. Gemini 2027 increases are not current prices; DeepSeek requires verification of the applicable peak or off-peak tariff.
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'openai', model: 'gpt-6-luna',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 100000, outputMicrosPerMillion: 500000,
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-luna', sha256: 'f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'gemini', model: 'gemini-3.8-flash',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 750000, outputMicrosPerMillion: 3750000,
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing', sha256: '3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'xai', model: 'grok-4.7',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 2000000, outputMicrosPerMillion: 6000000,
    sourceUrl: 'https://docs.x.ai/developers/models', sha256: '5185992e910f63b282384fdb4192f8937197af849c3eb6d99e006c70972b4651' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'xai', model: 'grok-4.20-0309-non-reasoning',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 1250000, outputMicrosPerMillion: 2500000,
    sourceUrl: 'https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning', sha256: 'fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'deepseek', model: 'deepseek-flash',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 300000, outputMicrosPerMillion: 1200000,
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/', sha256: '760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'deepseek', model: 'deepseek-flash',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 150000, outputMicrosPerMillion: 600000,
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/', sha256: 'c7c88ce9f8f681e8bb6de4645cb9f31007a0624aa659bcc8044c68667c4b3af7' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'qwen', model: 'qwen3.8-flash',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 150000, outputMicrosPerMillion: 470000,
    sourceUrl: 'https://www.alibabacloud.com/help/en/model-studio/models', sha256: '7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb' }),
  Object.freeze({ schema: 'reviewed-standard-pricing-v2', provider: 'mistral', model: 'mistral-small-2603',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 150000, outputMicrosPerMillion: 600000,
    sourceUrl: 'https://docs.mistral.ai/models', sha256: '72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3' }),
]);
