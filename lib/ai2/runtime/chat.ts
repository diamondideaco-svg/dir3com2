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
  | 'answered-general'
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
// Public floating DABRA must feel immediate: short deadline, at most one fallback hop (env-overridable for pilot/backend testing).
const DEFAULT_GLOBAL_DEADLINE_MS = 10_000;
const DEFAULT_MAX_FALLBACK_HOPS = 1;
const MIN_GLOBAL_DEADLINE_MS = 5_000;
const MAX_GLOBAL_DEADLINE_MS = 120_000;
const MIN_PROVIDER_ATTEMPT_BUDGET_MS = 250;

// Only genuinely time-sensitive/factual asks should pay the cost of live web grounding.
const FRESHNESS_INTENT_PATTERNS = [
  /\b(?:now|today|currently|current|latest|right now|as of today|this week)\b/,
  /(?:الان|الآن|اليوم|حاليا|حالياً|الحين|هذه اللحظة|آخر أخبار|أحدث مواعيد|احدث مواعيد)/,
] as const;

type DabraChatIntent = 'fresh-web' | 'general';
type DabraLatencyRoute = 'internal' | 'fast-chat' | 'web' | 'out-of-scope' | 'unavailable';

function classifyDabraIntent(message: string): DabraChatIntent {
  const normalized = normalizeIntentText(message);
  return FRESHNESS_INTENT_PATTERNS.some((pattern) => pattern.test(normalized)) ? 'fresh-web' : 'general';
}

const DETAIL_REQUEST_PATTERNS = [
  /\b(?:detail|detailed|elaborate|elaborated|in depth|comprehensive|full plan|long answer|explain in detail)\b/,
  /(?:بالتفصيل|تفصيلي|فصّل|فصل لي|بالتفاصيل|موسع|شرح مطول|شرح مفصل|خطة كاملة|اشرح.{0,15}بالتفصيل)/,
] as const;

function wantsDetailedAnswer(message: string): boolean {
  const normalized = normalizeIntentText(message);
  return DETAIL_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

const MEMORY_OR_ACCOUNT_QUESTION_PATTERNS = [
  /\b(?:memory|remember|conversation history|account access|access (?:my|your) account|my account|my bookings?|access (?:my|your) bookings?|my data)\b/,
  /(?:تتذكر|ذاكرة|ذاكرتك|حسابي|بياناتي|محادثاتي السابقة|تاريخ المحادثة|تتذكرين|حجوزاتي|الوصول (?:إلى|الى) حسابي|الوصول (?:إلى|الى) حجوزاتي)/,
] as const;

function userAskedAboutMemoryOrAccount(message: string): boolean {
  const normalized = normalizeIntentText(message);
  return MEMORY_OR_ACCOUNT_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Provider output may still contain markdown syntax; the floating panel renders plain text only.
function stripMarkdownFormatting(text: string): string {
  let out = text;
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2');
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1$2');
  out = out.replace(/`{1,3}([^`]+)`{1,3}/g, '$1');
  out = out.replace(/^\s{0,3}[-*+]\s+/gm, '• ');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');
  out = out.replace(/^\s{0,3}\|.*\|\s*$/gm, '');
  out = out.replace(/^\s{0,3}-{3,}\s*$/gm, '');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

const UNSOLICITED_MEMORY_DISCLAIMER_PATTERNS = [
  /[^.!؟\n]*\bi (?:have|don't have|do not have) (?:no |any )?memory\b[^.!؟\n]*[.!؟]?/gi,
  /[^.!؟\n]*\bi cannot access your account\b[^.!؟\n]*[.!؟]?/gi,
  /[^.!؟\n]*\bevery conversation starts from (?:zero|scratch)\b[^.!؟\n]*[.!؟]?/gi,
  /[^.!؟\n]*لا (?:أملك|امتلك) ذاكرة[^.!؟\n]*[.!؟]?/g,
  /[^.!؟\n]*لا (?:يمكنني|أستطيع) الوصول (?:إلى|الى) حسابك[^.!؟\n]*[.!؟]?/g,
  /[^.!؟\n]*كل محادثة تبدأ من (?:الصفر|جديد)[^.!؟\n]*[.!؟]?/g,
] as const;

function stripUnsolicitedMemoryDisclaimer(text: string, message: string): string {
  if (userAskedAboutMemoryOrAccount(message)) return text;
  let out = text;
  for (const pattern of UNSOLICITED_MEMORY_DISCLAIMER_PATTERNS) {
    out = out.replace(pattern, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

const CONCISE_DEFAULT_MAX_LINES = 6;

function enforceConciseDefault(text: string, message: string): string {
  if (wantsDetailedAnswer(message)) return text;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length <= CONCISE_DEFAULT_MAX_LINES) return text;
  return lines.slice(0, CONCISE_DEFAULT_MAX_LINES).join('\n');
}

function finalizeDabraAnswer(rawAnswer: string, message: string): string {
  const plain = stripMarkdownFormatting(rawAnswer);
  const withoutUnsolicitedDisclaimer = stripUnsolicitedMemoryDisclaimer(plain, message);
  return enforceConciseDefault(withoutUnsolicitedDisclaimer, message);
}

const CONCISE_ANSWER_HINT: Record<AI2ChatLanguage, string> = {
  ar: 'تعليمة تنسيق لواجهة الدردشة العائمة فقط: أجب بإيجاز شديد (من ٣ إلى ٦ أسطر أو نقاط قصيرة) بنص عادي بدون رموز تنسيق مثل ** أو ###، ولا تكتب مقالاً طويلاً إلا إذا طلب المستخدم تفصيلاً صريحاً. عرّف عن نفسك كالدَّبْرَة، مساعد السفر الذكي والحارس السياحي في dir3com، لا كباحث ويب عام. لا تذكر عدم امتلاك ذاكرة أو عدم الوصول للحساب إلا إذا سأل المستخدم عن ذلك تحديدًا. وإذا احتجت لمزيد من المعلومات فاطرح سؤالاً واحداً مفيداً.',
  en: 'Floating-chat formatting instruction only: answer concisely (3-6 short lines/points) in plain text with no markdown symbols like ** or ###, and avoid long essay-style output unless explicit detail is requested. Introduce yourself as DABRA, the dir3com travel guardian and smart travel assistant, never as a generic web researcher. Do not mention lacking memory or account access unless the user specifically asks about that. Ask at most one useful follow-up question if needed.',
};

function logDabraLatency(input: {
  totalMs: number;
  route: DabraLatencyRoute;
  provider?: AI2Provider;
  providerMs?: number;
  fallbackCount?: number;
  grounded: boolean;
}) {
  // No message/answer content is logged, only timing/routing metadata.
  console.log('DABRA_LATENCY', JSON.stringify({
    totalMs: input.totalMs,
    route: input.route,
    provider: input.provider ?? 'local',
    providerMs: input.providerMs ?? 0,
    fallbackCount: input.fallbackCount ?? 0,
    grounded: input.grounded,
  }));
}

export async function buildAI2ChatResponse(message: string): Promise<AI2ChatResponse> {
  const requestStartedAt = Date.now();
  const language = detectLanguage(message);
  const intent = classifyDabraIntent(message);

  if (isOutOfScopeIntent(message)) {
    logDabraLatency({ totalMs: Date.now() - requestStartedAt, route: 'out-of-scope', grounded: false });
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
    logDabraLatency({ totalMs: Date.now() - requestStartedAt, route: 'internal', provider: 'local', grounded: true });
    return {
      answer: finalizeDabraAnswer(composeGroundedAnswer(matches, language), message),
      sources: internalSources,
      language,
      groundingStatus: 'grounded',
      promptBound: true,
      promptVersion: AI2_DABRA_PROMPT_VERSION,
      retrievalMode: 'internal-rag',
      provider: 'local',
    };
  }

  const latencyRoute: DabraLatencyRoute = intent === 'fresh-web' ? 'web' : 'fast-chat';

  if (internalSources.length === 0 || !internalMatchGate.hasStrongMatch) {
    const providerPlan = buildProviderOrder();
    if (!providerPlan.ok) {
      logDabraLatency({ totalMs: Date.now() - requestStartedAt, route: 'unavailable', grounded: false });
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
    // Conversational asks skip forced citation grounding; the model still answers with the same canonical persona/prompt.
    const outgoingMessage = `${CONCISE_ANSWER_HINT[language]}\n\n${message}`;
    if (globalWebEnabled && configuredProviders.length > 0) {
      const globalDeadlineMs = normalizeBoundedInteger(process.env.DABRA_AI_GLOBAL_DEADLINE_MS, DEFAULT_GLOBAL_DEADLINE_MS, MIN_GLOBAL_DEADLINE_MS, MAX_GLOBAL_DEADLINE_MS);
      const attemptedProviders: RemoteProvider[] = [];
      let primaryError: AI2ProviderErrorCategory | undefined;
      let finalError: AI2ProviderErrorCategory | undefined;

      for (const provider of configuredProviders) {
        const remainingMs = globalDeadlineMs - (Date.now() - requestStartedAt);
        if (remainingMs < MIN_PROVIDER_ATTEMPT_BUDGET_MS) {
          finalError = 'deadline_exceeded';
          break;
        }
        attemptedProviders.push(provider);
        // Split the remaining budget across only the attempts actually left (not a fixed /3), so a
        // short public deadline with max one fallback doesn't starve every attempt.
        const remainingProviderCount = configuredProviders.length - attemptedProviders.length + 1;
        const perAttemptTimeoutMs = Math.max(MIN_PROVIDER_ATTEMPT_BUDGET_MS, Math.min(remainingMs, Math.floor(remainingMs / remainingProviderCount) || remainingMs));
        const attemptStartedAt = Date.now();
        const result = await callProvider(provider, outgoingMessage, language, perAttemptTimeoutMs);
        const attemptMs = Date.now() - attemptStartedAt;
        const hasCitations = result.citations.length > 0;
        const isGroundedResult = hasCitations || providerAcceptsNoCitations(result.provider);
        if (result.ok && (isGroundedResult || intent === 'general')) {
          logDabraLatency({
            totalMs: Date.now() - requestStartedAt,
            route: latencyRoute,
            provider: result.provider,
            providerMs: attemptMs,
            fallbackCount: attemptedProviders.length - 1,
            grounded: isGroundedResult,
          });
          return {
            answer: finalizeDabraAnswer(result.answer, message),
            sources: result.citations.map((url, index) => ({
              sourceId: `web-${index + 1}`,
              sourceName: url,
              sourceType: 'web',
              url,
            })),
            language,
            groundingStatus: isGroundedResult ? 'grounded-global-web' : 'answered-general',
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

      logDabraLatency({
        totalMs: Date.now() - requestStartedAt,
        route: latencyRoute,
        provider: 'local',
        fallbackCount: Math.max(0, attemptedProviders.length - 1),
        grounded: false,
      });
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

    logDabraLatency({ totalMs: Date.now() - requestStartedAt, route: latencyRoute, grounded: false });
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

  logDabraLatency({ totalMs: Date.now() - requestStartedAt, route: 'internal', provider: 'local', grounded: true });
  return {
    answer: finalizeDabraAnswer(composeGroundedAnswer(matches, language), message),
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
