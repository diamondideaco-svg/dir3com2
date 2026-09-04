export type ProviderPricing = {
  provider: 'openai' | 'gemini' | 'anthropic' | 'xai' | 'deepseek' | 'qwen' | 'mistral';
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  effectiveDate: string;
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
    effectiveDate: '2025-04-14',
    source: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
    effectiveDate: '2026-07-21',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
] as const;

export function estimateProviderCostUsd(input: {
  provider: ProviderPricing['provider'];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}): { estimatedCostUsd: number | null; pricingVersion: string | null } {
  if (!input.model || input.inputTokens === null || input.outputTokens === null) {
    return { estimatedCostUsd: null, pricingVersion: null };
  }

  const pricing = OFFICIAL_PRICING.find((entry) => entry.provider === input.provider && entry.model === input.model);
  if (!pricing) return { estimatedCostUsd: null, pricingVersion: null };

  const estimatedCostUsd = (
    input.inputTokens * pricing.inputUsdPerMillion
    + input.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;

  return {
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(12)),
    pricingVersion: `${DABRA_PRICING_VERSION}:${pricing.effectiveDate}`,
  };
}

export function getOfficialProviderPricing(): readonly ProviderPricing[] {
  return OFFICIAL_PRICING;
}
