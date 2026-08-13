import { AI2_KNOWLEDGE_REGISTRY, type AI2KnowledgeRecord } from '@/lib/ai2/knowledge/registry';
import { AI2_DABRA_SYSTEM_PROMPT, AI2_DABRA_PROMPT_VERSION } from '@/lib/ai2/prompt/contract';
import { buildAI2RagChunks, evaluateAI2InternalMatchGate, rankAI2RagMatches } from '@/lib/ai2/rag/index-design';
import { callOpenAIResponsesWebSearch } from '@/lib/ai2/runtime/openai-web';

export type AI2ChatLanguage = 'ar' | 'en';

export type AI2ChatGroundingStatus =
  | 'grounded'
  | 'grounded-global-web'
  | 'fallback-no-source'
  | 'fallback-provider-unavailable';

export type AI2Provider = 'local' | 'openai';

export type AI2RetrievalMode = 'internal-rag' | 'openai-web-search';

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
  const openAIKey = (process.env.OPENAI_API_KEY ?? '').trim();
  const canUseOpenAI = globalWebEnabled && Boolean(openAIKey);

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
    if (canUseOpenAI) {
      const openAIResult = await callOpenAIResponsesWebSearch({
        message,
        language,
        prompt: AI2_DABRA_SYSTEM_PROMPT,
        model: process.env.DABRA_OPENAI_MODEL,
        apiKey: openAIKey,
      });

      if (openAIResult.ok && openAIResult.citations.length > 0) {
        return {
          answer: openAIResult.answer,
          sources: openAIResult.citations.map((url, index) => ({
            sourceId: `web-${index + 1}`,
            sourceName: url,
            sourceType: 'web',
            url,
          })),
          language,
          groundingStatus: 'grounded-global-web',
          promptBound: true,
          promptVersion: AI2_DABRA_PROMPT_VERSION,
          retrievalMode: 'openai-web-search',
          provider: 'openai',
        };
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
  const promptConstraint = AI2_DABRA_SYSTEM_PROMPT.toLowerCase();

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
