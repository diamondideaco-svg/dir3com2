import { AI2_KNOWLEDGE_REGISTRY, type AI2KnowledgeRecord } from '@/lib/ai2/knowledge/registry';
import { AI2_DABRA_SYSTEM_PROMPT, AI2_DABRA_PROMPT_VERSION } from '@/lib/ai2/prompt/contract';
import { buildAI2RagChunks, rankAI2RagMatches } from '@/lib/ai2/rag/index-design';
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

const REFUSAL_TERMS = [
  'book',
  'booking',
  'reserve',
  'reservation',
  'pay',
  'payment',
  'purchase',
  'checkout',
  'refund',
  'cancel my booking',
  'change my account',
  'change account',
  'account update',
  'database',
  'write to database',
  'charge card',
  'tool call',
  'احجز',
  'حجز',
  'احجز لي',
  'ادفع',
  'دفع',
  'شراء',
  'سداد',
  'حسابي',
  'تعديل الحساب',
  'اشتر',
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
  const globalWebEnabled = String(process.env.DABRA_GLOBAL_WEB_ENABLED ?? '').toLowerCase() === 'true';
  const openAIKey = (process.env.OPENAI_API_KEY ?? '').trim();

  if (globalWebEnabled && openAIKey) {
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

    if (openAIResult.ok && openAIResult.citations.length === 0 && internalSources.length > 0) {
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

    if (!openAIResult.ok && internalSources.length > 0) {
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

    if (!openAIResult.ok && internalSources.length === 0) {
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
  }

  if (internalSources.length === 0) {
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

  const answer = composeGroundedAnswer(matches, language);

  return {
    answer,
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
  const normalized = message.toLowerCase();
  return REFUSAL_TERMS.some((term) => normalized.includes(term));
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