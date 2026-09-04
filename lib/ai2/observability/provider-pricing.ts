export type ProviderPricing = {
  provider: 'openai' | 'gemini' | 'anthropic' | 'xai' | 'deepseek' | 'qwen' | 'mistral';
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  effectiveFrom: string;
  effectiveTo: string;
  verifiedAt: string;
  expiresAt: string;
  source: string;
};

export const DABRA_PRICING_VERSION = '2026-09-04';

// Only exact model identifiers with current, official, USD standard-token pricing belong here.
// Aliases whose backing model or regional currency can change intentionally return no estimate.
const OFFICIAL_PRICING: readonly ProviderPricing[] = [
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    effectiveFrom: '2025-04-14T00:00:00.000Z',
    effectiveTo: '2026-10-04T00:00:00.000Z',
    verifiedAt: '2026-09-04T00:00:00.000Z',
    expiresAt: '2026-10-04T00:00:00.000Z',
    source: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
    effectiveFrom: '2026-07-21T00:00:00.000Z',
    effectiveTo: '2026-10-04T00:00:00.000Z',
    verifiedAt: '2026-09-04T00:00:00.000Z',
    expiresAt: '2026-10-04T00:00:00.000Z',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
] as const;

export function estimateProviderCostUsd(input: {
  provider: ProviderPricing['provider'];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  attemptedAtMs: number;
  pricingCheckedAtMs: number;
}): { estimatedCostUsd: number | null; pricingVersion: string | null } {
  if (!input.model || input.inputTokens === null || input.outputTokens === null) {
    return { estimatedCostUsd: null, pricingVersion: null };
  }

  const pricing = OFFICIAL_PRICING.find((entry) => entry.provider === input.provider && entry.model === input.model);
  if (!pricing) return { estimatedCostUsd: null, pricingVersion: null };

  const effectiveFromMs = Date.parse(pricing.effectiveFrom);
  const effectiveToMs = Date.parse(pricing.effectiveTo);
  const verifiedAtMs = Date.parse(pricing.verifiedAt);
  const expiresAtMs = Date.parse(pricing.expiresAt);
  const attemptIsCovered = Number.isFinite(input.attemptedAtMs)
    && input.attemptedAtMs >= effectiveFromMs
    && input.attemptedAtMs < effectiveToMs;
  const snapshotIsCurrent = Number.isFinite(input.pricingCheckedAtMs)
    && input.pricingCheckedAtMs >= verifiedAtMs
    && input.pricingCheckedAtMs < expiresAtMs;
  if (!attemptIsCovered || !snapshotIsCurrent) {
    return { estimatedCostUsd: null, pricingVersion: null };
  }

  const estimatedCostUsd = (
    input.inputTokens * pricing.inputUsdPerMillion
    + input.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;

  return {
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(12)),
    pricingVersion: `${DABRA_PRICING_VERSION}:${pricing.provider}:${pricing.model}`,
  };
}

export function getOfficialProviderPricing(): readonly ProviderPricing[] {
  return OFFICIAL_PRICING;
}
