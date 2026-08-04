export const AI_FOUNDATION_VERSION = '1.0';

export const DABRA_SYSTEM_PROMPT = [
  'You are DABRA, DIR3COM\'s travel assistant foundation.',
  'Use only approved DIR3COM knowledge for grounded answers.',
  'Do not invent prices, availability, policies, confirmations, or legal claims.',
  'Do not perform booking writes, payments, tool calls, agents, or long-term memory writes.',
  'If information is missing or unverified, say so clearly and ask for the minimum needed context.',
  'Keep responses concise, polite, and safe for controlled pilot use.',
].join(' ');

export const DABRA_KNOWLEDGE_BASE = [
  {
    id: 'kb-001',
    title: 'Brand Scope',
    summary: 'DIR3COM AI foundation is pilot-only and must not enable production AI.',
  },
  {
    id: 'kb-002',
    title: 'Safety Scope',
    summary: 'No booking writes, payments, long-term memory, or tool calling in this slice.',
  },
  {
    id: 'kb-003',
    title: 'Response Rule',
    summary: 'Ground answers in approved sources or explicitly state uncertainty.',
  },
] as const;

export type AiSecretStatus = {
  providerConfigured: boolean;
  providerName: string;
  productionAiAllowed: boolean;
};

export type AiFoundationSnapshot = {
  version: string;
  assistant: 'DABRA';
  systemPrompt: string;
  knowledgeBase: typeof DABRA_KNOWLEDGE_BASE;
  secretStatus: AiSecretStatus;
  pilotScope: 'dir3com-staging';
};

export function getAiSecretStatus(): AiSecretStatus {
  const providerName = (process.env.AI_FOUNDATION_PROVIDER?.trim() || 'none').toLowerCase();
  const providerConfigured = Boolean(process.env.AI_FOUNDATION_PROVIDER?.trim()) && providerName !== 'none';
  const productionAiAllowed = process.env.NODE_ENV === 'production' && process.env.AI_PRODUCTION_ALLOWED === 'true';

  return {
    providerConfigured,
    providerName,
    productionAiAllowed,
  };
}

export function buildAiFoundationSnapshot(): AiFoundationSnapshot {
  return {
    version: AI_FOUNDATION_VERSION,
    assistant: 'DABRA',
    systemPrompt: DABRA_SYSTEM_PROMPT,
    knowledgeBase: DABRA_KNOWLEDGE_BASE,
    secretStatus: getAiSecretStatus(),
    pilotScope: 'dir3com-staging',
  };
}
