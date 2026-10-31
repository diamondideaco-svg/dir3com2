import 'server-only';

export type ApprovedDialogueStandardPricing = Readonly<{
  schema: 'reviewed-standard-pricing-v1'; provider: 'openai' | 'anthropic'; model: string;
  serviceTier: 'standard'; currency: 'USD'; inputMicrosPerMillion: number; outputMicrosPerMillion: number;
  observedAtMs: number; validFromMs: number; expiresAtMs: number; sourceUrl: string; sha256: string;
}>;

/**
 * Source-reviewed server authority, never populated by a request, environment value or URL fetch.
 * Empty until an independently reviewed exact-model Standard tariff and bounded window are approved.
 * Each fingerprint covers the ordered semantic fields verified by dialogue-funding.ts.
 * An entry authorizes pricing only; it grants neither credit, capability qualification nor admission.
 */
export const APPROVED_DIALOGUE_STANDARD_PRICING: readonly ApprovedDialogueStandardPricing[] = Object.freeze([]);
