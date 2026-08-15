import { AI2_KNOWLEDGE_REGISTRY, type AI2KnowledgeRecord } from '@/lib/ai2/knowledge/registry';
import {
  AI2_DABRA_GLOBAL_WEB_PROMPT,
  AI2_DABRA_INTERNAL_SYSTEM_PROMPT,
  AI2_DABRA_PROMPT_VERSION,
} from '@/lib/ai2/prompt/contract';
import { buildAI2RagChunks, evaluateAI2InternalMatchGate, rankAI2RagMatches } from '@/lib/ai2/rag/index-design';
import { callAnthropicMessagesWeb, type AnthropicWebCallResult } from '@/lib/ai2/runtime/anthropic-web';
import { callDeepSeekWebSearch, type DeepSeekWebErrorCategory } from '@/lib/ai2/runtime/deepseek-web';
import { callGeminiGoogleSearch, type GeminiWebErrorCategory } from '@/lib/ai2/runtime/gemini-web';
import { callMistralWebSearch, type MistralWebErrorCategory } from '@/lib/ai2/runtime/mistral-web';
import { callOpenAIResponsesWebSearch, type OpenAIWebErrorCategory } from '@/lib/ai2/runtime/openai-web';
import { callQwenWebSearch, type QwenWebErrorCategory } from '@/lib/ai2/runtime/qwen-web';
import { callXAIWebSearch, type XAIWebErrorCategory } from '@/lib/ai2/runtime/xai-web';

export type AI2ChatLanguage = 'ar' | 'en';

export type AI2ChatGroundingStatus =
  | 'grounded'
  | 'grounded-global-web'
  | 'fallback-no-source'
  | 'fallback-provider-unavailable';

export type AI2Provider = 'local' | 'openai' | 'gemini' | 'anthropic' | 'xai' | 'deepseek' | 'qwen' | 'mistral';

export type AI2RetrievalMode =
  | 'internal-rag'
  | 'openai-web-search'
  | 'gemini-google-search'
  | 'anthropic-messages'
  | 'xai-chat-completions'
  | 'deepseek-chat-completions'
  | 'qwen-chat-completions'
  | 'mistral-chat-completions';

export type AI2ProviderErrorCategory =
  | OpenAIWebErrorCategory
  | GeminiWebErrorCategory
  | XAIWebErrorCategory
  | DeepSeekWebErrorCategory
  | QwenWebErrorCategory
  | MistralWebErrorCategory
  | NonNullable<AnthropicWebCallResult['errorCategory']>
  | 'configuration_error'
  | 'deadline_exceeded';

export type AI2ChatSource = {
  sourceId: string;
  sourceName: string;
  sourceType: 'internal' | 'web';
  url?: string;
  language?: AI2KnowledgeRecord['language'];
  updateState?: AI2KnowledgeRecord['updateState'];
  knowledgeVersion?: string;
};

export type AI2ChatResponse = {
  answer: string;
  sources: AI2ChatSource[];
  language: AI2ChatLanguage;
  groundingStatus: AI2ChatGroundingStatus;
  promptBound: true;
  promptVersion: typeof AI2_DABRA_PROMPT_VERSION;
  retrievalMode: AI2RetrievalMode;
  provider: AI2Provider;
  providerErrorCategory?: AI2ProviderErrorCategory;
  providerModel?: string;
  primaryProvider?: RemoteProvider;
  primaryProviderErrorCategory?: AI2ProviderErrorCategory;
  fallbackAttempts?: RemoteProvider[];
  finalProviderErrorCategory?: AI2ProviderErrorCategory;
};

type RemoteProvider = Exclude<AI2Provider, 'local'>;

type ProviderResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  provider: RemoteProvider;
  retrievalMode: AI2RetrievalMode;
  errorCategory?: AI2ProviderErrorCategory;
  model?: string;
};

const INFORMATIONAL_INTENT_PATTERNS = [
  /^(?:how (?:do|can|should|would) i|what (?:happens|would happen) if|what is|where (?:do|can) i|can you (?:explain|tell me))\b/,
  /^(?:كيف|ماذا يحدث اذا|ماذا لو|ما الذي يحدث اذا|ما هو|ما هي|هل يمكنك (?:شرح|توضيح))\b/,
] as const;

const EXPLICIT_EXECUTION_CUES = [
  /\b(?:now|for me|on my behalf|go ahead|do it|execute it)\b/,
  /(?:الان|حالا|لي|نيابة عني|نفذ|قم بذلك)/,
] as const;

const EXECUTION_INTENT_PATTERNS = [
  // Booking, payment, and purchase execution.
  /\b(?:book|reserve|cancel|change|modify|reschedule)\b(?:\s+\S+){0,5}\s+\b(?:booking|reservation|appointment|service|trip|room|table|ticket)\b/,
  /\b(?:pay|refund|charge)\b(?:\s+\S+){0,5}\s+\b(?:invoice|bill|payment|card|order|booking|this|that)\b/,
  /\b(?:purchase|buy|checkout|order)\b(?:\s+\S+){0,5}\s+\b(?:this|that|item|product|service|order)\b/,
  /(?:^| )(?:احجز|احجز لي|الغي الحجز|الغ الحجز|عدل الحجز|غير الحجز|اجل الحجز)(?: |$)/,
  /(?:^| )(?:ادفع|سدد|حول المبلغ|استرد المبلغ)(?: |$)/,
  /(?:^| )(?:اشتر|اشتري|قم بشراء)(?: |$)/,

  // Database and record mutations.
  /\b(?:write|insert|update|delete|modify|save|change|add|remove)\b(?:\s+\S+){0,5}\s+\b(?:database|db|data|records?)\b/,
  /(?:^| )(?:اكتب|اضف|ادخل|حدث|عدل|احذف|امسح|ازل|غير|احفظ)(?:\s+\S+){0,5}\s+(?:قاعده البيانات|البيانات|السجلات?|سجلات?)(?: |$)/,

  // Account mutations.
  /\b(?:delete|remove|close|deactivate|disable|update|modify|change|edit)\b(?:\s+\S+){0,4}\s+\b(?:my account|the account|account)\b/,
  /(?:^| )(?:احذف|ازل|الغي|الغ|اغلق|عطل|حدث|عدل|غير|حرر)(?:\s+\S+){0,4}\s+(?:حسابي|حسابنا|الحساب|حساب المستخدم)(?: |$)/,

  // Profile mutations.
  /\b(?:update|modify|change|edit|delete|remove)\b(?:\s+\S+){0,4}\s+\b(?:my profile|the profile|profile)\b/,
  /(?:^| )(?:احذف|ازل|حدث|عدل|غير|حرر)(?:\s+\S+){0,4}\s+(?:ملفي الشخصي|الملف الشخصي|ملف المستخدم)(?: |$)/,

  /\btool call\b/,
] as const;

const NO_SOURCE_FALLBACK: Record<AI2ChatLanguage, string> = {
  ar: 'لا أملك مصدرًا معتمدًا كافيًا لهذا الطلب ضمن قاعدة المعرفة الداخلية. أعد الصياغة باستخدام نطاق DIR3COM المعتمد.',
  en: 'I do not have an approved internal source for that request. Please rephrase within the approved DIR3COM scope.',
};

const OUT_OF_SCOPE_FALLBACK: Record<AI2ChatLanguage, string> = {
  ar: 'لا أستطيع تنفيذ حجوزات أو مدفوعات أو إجراءات تشغيلية في هذه الشريحة. يمكنني تقديم إرشاد مبني على المصادر الداخلية فقط.',
  en: 'I cannot execute bookings, payments, or operational actions in this slice. I can provide guidance grounded in internal sources only.',
};

const PROVIDER_UNAVAILABLE_FALLBACK: Record<AI2ChatLanguage, string> = {
  ar: 'المزوّد الخارجي غير متاح حاليًا. يمكنني متابعة الإرشاد عبر مصادر DIR3COM الداخلية المتاحة فقط.',
  en: 'The external provider is currently unavailable. I can continue with available DIR3COM internal sources only.',
};

const AI2_CHUNKS = buildAI2RagChunks(AI2_KNOWLEDGE_REGISTRY);
const REMOTE_PROVIDERS = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'] as const;
const AUTO_PROVIDER_ORDER: RemoteProvider[] = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'];
const DEFAULT_GLOBAL_DEADLINE_MS = 60_000;
const DEFAULT_MAX_FALLBACK_HOPS = 3;
const MIN_GLOBAL_DEADLINE_MS = 5_000;
const MAX_GLOBAL_DEADLINE_MS = 120_000;
const MIN_PROVIDER_ATTEMPT_BUDGET_MS = 250;

export async function buildAI2ChatResponse(message: string): Promise<AI2ChatResponse> {
  const language = detectLanguage(message);

  if (isOutOfScopeIntent(message)) {
    return {
      answer: OUT_OF_SCOPE_FALLBACK[language],
      sources: [],
      language,
      groundingStatus: 'fallback-no-source',
      promptBound: true,
      promptVersion: AI2_DABRA_PROMPT_VERSION,
      retrievalMode: 'internal-rag',
      provider: 'local',
    };
  }

  const matches = rankAI2RagMatches(message, AI2_CHUNKS, 3);
  const internalSources = uniqueSourcesFromMatches(matches);
  const internalMatchGate = evaluateAI2InternalMatchGate(message, matches);
  const globalWebEnabled = String(process.env.DABRA_GLOBAL_WEB_ENABLED ?? '').toLowerCase() === 'true';

  if (internalMatchGate.hasStrongMatch && internalSources.length > 0) {
    return {
      answer: composeGroundedAnswer(matches, language),
      sources: internalSources,
      language,
      groundingStatus: 'grounded',
      promptBound: true,
      promptVersion: AI2_DABRA_PROMPT_VERSION,
      retrievalMode: 'internal-rag',
      provider: 'local',
    };
  }

  if (internalSources.length === 0 || !internalMatchGate.hasStrongMatch) {
    const providerPlan = buildProviderOrder();
    if (!providerPlan.ok) {
      return {
        answer: PROVIDER_UNAVAILABLE_FALLBACK[language],
        sources: [],
        language,
        groundingStatus: 'fallback-provider-unavailable',
        promptBound: true,
        promptVersion: AI2_DABRA_PROMPT_VERSION,
        retrievalMode: 'internal-rag',
        provider: 'local',
        providerErrorCategory: 'configuration_error',
        finalProviderErrorCategory: 'configuration_error',
        fallbackAttempts: [],
      };
    }
    const configuredProviders = providerPlan.providers;
    if (globalWebEnabled && configuredProviders.length > 0) {
      const startedAt = Date.now();
      const globalDeadlineMs = normalizeBoundedInteger(process.env.DABRA_AI_GLOBAL_DEADLINE_MS, DEFAULT_GLOBAL_DEADLINE_MS, MIN_GLOBAL_DEADLINE_MS, MAX_GLOBAL_DEADLINE_MS);
      const attemptedProviders: RemoteProvider[] = [];
      let primaryError: AI2ProviderErrorCategory | undefined;
      let finalError: AI2ProviderErrorCategory | undefined;

      for (const provider of configuredProviders) {
        const remainingMs = globalDeadlineMs - (Date.now() - startedAt);
        if (remainingMs < MIN_PROVIDER_ATTEMPT_BUDGET_MS) {
          finalError = 'deadline_exceeded';
          break;
        }
        attemptedProviders.push(provider);
        const perAttemptTimeoutMs = Math.max(1, Math.min(remainingMs, Math.floor(remainingMs / 3) || remainingMs));
        const result = await callProvider(provider, message, language, perAttemptTimeoutMs);
        if (result.ok && (result.citations.length > 0 || providerAcceptsNoCitations(result.provider))) {
          return {
            answer: result.answer,
            sources: result.citations.map((url, index) => ({
              sourceId: `web-${index + 1}`,
              sourceName: url,
              sourceType: 'web',
              url,
            })),
            language,
            groundingStatus: 'grounded-global-web',
            promptBound: true,
            promptVersion: AI2_DABRA_PROMPT_VERSION,
            retrievalMode: result.retrievalMode,
            provider: result.provider,
            providerModel: result.model,
            primaryProvider: configuredProviders[0],
            primaryProviderErrorCategory: primaryError,
            fallbackAttempts: attemptedProviders.slice(1),
          };
        }

        finalError = result.errorCategory ?? 'upstream_error';
        primaryError ??= finalError;
        if (!isTransientFallbackError(finalError)) break;
      }

      return {
        answer: PROVIDER_UNAVAILABLE_FALLBACK[language],
        sources: [],
        language,
        groundingStatus: 'fallback-provider-unavailable',
        promptBound: true,
        promptVersion: AI2_DABRA_PROMPT_VERSION,
        retrievalMode: 'internal-rag',
        provider: 'local',
        providerErrorCategory: primaryError ?? finalError,
        primaryProvider: configuredProviders[0],
        primaryProviderErrorCategory: primaryError,
        fallbackAttempts: attemptedProviders.slice(1),
        finalProviderErrorCategory: finalError,
      };
    }

    return {
      answer: NO_SOURCE_FALLBACK[language],
      sources: [],
      language,
      groundingStatus: 'fallback-no-source',
      promptBound: true,
      promptVersion: AI2_DABRA_PROMPT_VERSION,
      retrievalMode: 'internal-rag',
      provider: 'local',
    };
  }

  return {
    answer: composeGroundedAnswer(matches, language),
    sources: internalSources,
    language,
    groundingStatus: 'grounded',
    promptBound: true,
    promptVersion: AI2_DABRA_PROMPT_VERSION,
    retrievalMode: 'internal-rag',
    provider: 'local',
  };
}

function providerKey(provider: RemoteProvider): string {
  if (provider === 'gemini') {
    return (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim();
  }

  if (provider === 'openai') {
    return (process.env.OPENAI_API_KEY ?? '').trim();
  }

  if (provider === 'anthropic') {
    return (process.env.ANTHROPIC_API_KEY ?? '').trim();
  }

  if (provider === 'xai') {
    return (process.env.XAI_API_KEY ?? '').trim();
  }

  if (provider === 'deepseek') {
    return (process.env.DEEPSEEK_API_KEY ?? '').trim();
  }

  if (provider === 'qwen') {
    return (process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? '').trim();
  }

  return (process.env.MISTRAL_API_KEY ?? '').trim();
}

function providerAcceptsNoCitations(provider: RemoteProvider): boolean {
  return provider !== 'openai' && provider !== 'gemini';
}

type ProviderPlan = { ok: true; providers: RemoteProvider[] } | { ok: false };

function isRemoteProvider(value: string): value is RemoteProvider {
  return (REMOTE_PROVIDERS as readonly string[]).includes(value);
}

function normalizeBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function isTransientFallbackError(error: AI2ProviderErrorCategory): boolean {
  return error === 'timeout' || error === 'upstream_error' || error === 'deadline_exceeded';
}

function buildProviderOrder(): ProviderPlan {
  const rawRequested = process.env.DABRA_AI_PROVIDER;
  const requested = rawRequested === undefined || rawRequested.trim() === '' ? 'openai' : rawRequested.trim().toLowerCase();
  const fallbackEnabled = String(process.env.DABRA_PROVIDER_FALLBACK_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  if (requested !== 'auto' && !isRemoteProvider(requested)) return { ok: false };
  const preferred = requested === 'auto'
    ? AUTO_PROVIDER_ORDER
    : [requested, ...AUTO_PROVIDER_ORDER.filter((provider) => provider !== requested)];

  const available = preferred.filter((provider) => Boolean(providerKey(provider)));
  const configuredMaxHops = normalizeBoundedInteger(process.env.DABRA_AI_MAX_FALLBACK_HOPS, DEFAULT_MAX_FALLBACK_HOPS, 0, REMOTE_PROVIDERS.length - 1);
  const maxProviders = fallbackEnabled ? Math.min(available.length, configuredMaxHops + 1) : 1;
  return { ok: true, providers: available.slice(0, maxProviders) };
}

async function callProvider(provider: RemoteProvider, message: string, language: AI2ChatLanguage, timeoutMs: number): Promise<ProviderResult> {
  if (provider === 'gemini') {
    const result = await callGeminiGoogleSearch({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_GEMINI_MODEL,
      apiKey: providerKey('gemini'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'gemini-google-search',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  if (provider === 'openai') {
    const result = await callOpenAIResponsesWebSearch({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_OPENAI_MODEL,
      apiKey: providerKey('openai'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'openai-web-search',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  if (provider === 'anthropic') {
    const result = await callAnthropicMessagesWeb({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_ANTHROPIC_MODEL,
      apiKey: providerKey('anthropic'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'anthropic-messages',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  if (provider === 'xai') {
    const result = await callXAIWebSearch({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_XAI_MODEL,
      apiKey: providerKey('xai'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'xai-chat-completions',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  if (provider === 'deepseek') {
    const result = await callDeepSeekWebSearch({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_DEEPSEEK_MODEL,
      apiKey: providerKey('deepseek'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'deepseek-chat-completions',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  if (provider === 'qwen') {
    const result = await callQwenWebSearch({
      message,
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      model: process.env.DABRA_QWEN_MODEL,
      apiKey: providerKey('qwen'),
      timeoutMs,
    });

    return {
      ok: result.ok,
      answer: result.answer,
      citations: result.citations,
      provider,
      retrievalMode: 'qwen-chat-completions',
      errorCategory: result.errorCategory,
      model: result.model,
    };
  }

  const result = await callMistralWebSearch({
    message,
    language,
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    model: process.env.DABRA_MISTRAL_MODEL,
    apiKey: providerKey('mistral'),
    timeoutMs,
  });

  return {
    ok: result.ok,
    answer: result.answer,
    citations: result.citations,
    provider,
    retrievalMode: 'mistral-chat-completions',
    errorCategory: result.errorCategory,
    model: result.model,
  };
}

function detectLanguage(message: string): AI2ChatLanguage {
  return /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';
}

export function isOutOfScopeIntent(message: string): boolean {
  const normalized = normalizeIntentText(message);
  const informational = INFORMATIONAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
  const explicitExecution = EXPLICIT_EXECUTION_CUES.some((pattern) => pattern.test(normalized));

  if (informational && !explicitExecution) {
    return false;
  }

  return EXECUTION_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeIntentText(message: string): string {
  return message
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueSourcesFromMatches(matches: ReturnType<typeof rankAI2RagMatches>): AI2ChatSource[] {
  const uniqueSourceIds = [...new Set(matches.map((match) => match.sourceId))];

  return uniqueSourceIds
    .map((sourceId) => AI2_KNOWLEDGE_REGISTRY.find((record) => record.sourceId === sourceId))
    .filter((record): record is AI2KnowledgeRecord => Boolean(record))
    .map((record) => ({
      sourceId: record.sourceId,
      sourceName: record.sourceName,
      sourceType: 'internal',
      language: record.language,
      updateState: record.updateState,
      knowledgeVersion: record.knowledgeVersion,
    }));
}

function composeGroundedAnswer(matches: ReturnType<typeof rankAI2RagMatches>, language: AI2ChatLanguage): string {
  const promptConstraint = AI2_DABRA_INTERNAL_SYSTEM_PROMPT.toLowerCase();

  const snippets = matches
    .map((match) => {
      const chunk = AI2_CHUNKS.find((candidate) => candidate.chunkId === match.chunkId);
      return chunk?.text;
    })
    .filter((text): text is string => Boolean(text));

  const groundedText = snippets.join(' ');

  // Bind output behavior to prompt policy without exposing prompt content.
  const strictMode = promptConstraint.includes('use only approved dir3com knowledge');

  if (language === 'ar') {
    return strictMode ? `${groundedText} (إجابة مقيدة بنطاق المصادر المعتمدة فقط)` : groundedText;
  }

  return strictMode ? `${groundedText} (Answer constrained to approved internal sources only)` : groundedText;
}
