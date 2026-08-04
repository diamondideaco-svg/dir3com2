import { AI2_KNOWLEDGE_REGISTRY, type AI2KnowledgeRecord } from '@/lib/ai2/knowledge/registry';
import { AI2_DABRA_SYSTEM_PROMPT, AI2_DABRA_PROMPT_VERSION } from '@/lib/ai2/prompt/contract';
import { buildAI2RagChunks, rankAI2RagMatches } from '@/lib/ai2/rag/index-design';

export type AI2ChatLanguage = 'ar' | 'en';

export type AI2ChatGroundingStatus = 'grounded' | 'fallback-no-source';

export type AI2ChatSource = {
  sourceId: string;
  sourceName: string;
  language: AI2KnowledgeRecord['language'];
  updateState: AI2KnowledgeRecord['updateState'];
  knowledgeVersion: string;
};

export type AI2ChatResponse = {
  answer: string;
  sources: AI2ChatSource[];
  language: AI2ChatLanguage;
  groundingStatus: AI2ChatGroundingStatus;
  promptBound: true;
  promptVersion: typeof AI2_DABRA_PROMPT_VERSION;
  retrievalMode: 'internal-rag';
};

const REFUSAL_TERMS = [
  'book',
  'booking',
  'pay',
  'payment',
  'purchase',
  'tool',
  'checkout',
  'احجز',
  'حجز',
  'ادفع',
  'دفع',
  'شراء',
] as const;

const NO_SOURCE_FALLBACK: Record<AI2ChatLanguage, string> = {
  ar: 'لا أملك مصدرًا معتمدًا كافيًا لهذا الطلب ضمن قاعدة المعرفة الداخلية. أعد الصياغة باستخدام نطاق DIR3COM المعتمد.',
  en: 'I do not have an approved internal source for that request. Please rephrase within the approved DIR3COM scope.',
};

const OUT_OF_SCOPE_FALLBACK: Record<AI2ChatLanguage, string> = {
  ar: 'لا أستطيع تنفيذ حجوزات أو مدفوعات أو إجراءات تشغيلية في هذه الشريحة. يمكنني تقديم إرشاد مبني على المصادر الداخلية فقط.',
  en: 'I cannot execute bookings, payments, or operational actions in this slice. I can provide guidance grounded in internal sources only.',
};

const AI2_CHUNKS = buildAI2RagChunks(AI2_KNOWLEDGE_REGISTRY);

export function buildAI2ChatResponse(message: string): AI2ChatResponse {
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
    };
  }

  const matches = rankAI2RagMatches(message, AI2_CHUNKS, 3);

  if (matches.length === 0) {
    return {
      answer: NO_SOURCE_FALLBACK[language],
      sources: [],
      language,
      groundingStatus: 'fallback-no-source',
      promptBound: true,
      promptVersion: AI2_DABRA_PROMPT_VERSION,
      retrievalMode: 'internal-rag',
    };
  }

  const sources = uniqueSourcesFromMatches(matches);
  const answer = composeGroundedAnswer(matches, language);

  return {
    answer,
    sources,
    language,
    groundingStatus: 'grounded',
    promptBound: true,
    promptVersion: AI2_DABRA_PROMPT_VERSION,
    retrievalMode: 'internal-rag',
  };
}

function detectLanguage(message: string): AI2ChatLanguage {
  return /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';
}

function isOutOfScopeIntent(message: string): boolean {
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