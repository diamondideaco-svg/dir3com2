import 'server-only';

type StandardPricingFields = Readonly<{
  provider: 'openai' | 'anthropic'; model: string; serviceTier: 'standard'; currency: 'USD';
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
]);
