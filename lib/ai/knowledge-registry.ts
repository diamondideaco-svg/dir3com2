export type KnowledgeRegistryLanguage = 'ar' | 'en' | 'bilingual';

export type KnowledgeRegistryUpdateState = 'approved';

export type KnowledgeRegistrySource = {
  sourceId: string;
  sourceName: string;
  language: KnowledgeRegistryLanguage;
  updateState: KnowledgeRegistryUpdateState;
  keywords: readonly string[];
  answers: {
    ar: string;
    en: string;
  };
};

export const APPROVED_KNOWLEDGE_REGISTRY = [
  {
    sourceId: 'dir3com-central-reference',
    sourceName: 'DIR3COM Central Reference',
    language: 'bilingual',
    updateState: 'approved',
    keywords: ['central reference', 'contract', 'approved', 'dgr-054', 'next engineering slice', 'اعتماد', 'العقد'],
    answers: {
      ar: 'DIR3COM Central Reference يثبت أن AI-1 معتمد للشريحة الهندسية التالية مع بقاء Foundation Scaffold محفوظًا وعدم توسيع النطاق.',
      en: 'DIR3COM Central Reference confirms that AI-1 is approved for the next engineering slice while the Foundation Scaffold remains preserved and the scope stays narrow.',
    },
  },
  {
    sourceId: 'ai-safety-guardrails',
    sourceName: 'AI Safety Guardrails',
    language: 'bilingual',
    updateState: 'approved',
    keywords: [
      'booking',
      'payments',
      'memory',
      'agents',
      'tool calling',
      'production ai',
      'vector',
      'open web',
      'حجوزات',
      'مدفوعات',
      'ذاكرة',
      'وكلاء',
    ],
    answers: {
      ar: 'هذه الشريحة تسمح بالإجابات المعتمدة فقط، وتبقي Booking Writes وPayments والذاكرة طويلة المدى والوكلاء وProduction AI خارج النطاق.',
      en: 'This slice allows only grounded answers and keeps Booking Writes, Payments, long-term memory, agents, and Production AI out of scope.',
    },
  },
  {
    sourceId: 'approved-knowledge-registry',
    sourceName: 'Approved Knowledge Registry',
    language: 'bilingual',
    updateState: 'approved',
    keywords: ['registry', 'approved sources', 'knowledge', 'sources', 'sourcing', 'سجل', 'مصادر'],
    answers: {
      ar: 'المحرك يعتمد على سجل المعرفة المعتمد فقط، بدون Vector DB وبدون Open-Web Retrieval.',
      en: 'The chat engine relies on the approved knowledge registry only, with no Vector DB and no Open-Web Retrieval.',
    },
  },
  {
    sourceId: 'language-behaviour',
    sourceName: 'Arabic-English Behaviour',
    language: 'bilingual',
    updateState: 'approved',
    keywords: ['arabic', 'english', 'language', 'arabic quality', 'english quality', 'عربي', 'إنجليزي', 'لغة'],
    answers: {
      ar: 'أجيب بالعربية أو الإنجليزية بحسب لغة السؤال، مع الحفاظ على الصياغة الطبيعية وعدم الاعتماد على ترجمة حرفية.',
      en: 'I answer in Arabic or English according to the request language, keeping the phrasing natural rather than literal.',
    },
  },
] as const satisfies readonly KnowledgeRegistrySource[];

export type KnowledgeRegistryMatch = {
  source: KnowledgeRegistrySource;
  score: number;
};

export function detectRequestLanguage(message: string): 'ar' | 'en' {
  return /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';
}

export function retrieveApprovedKnowledgeSources(message: string, language: 'ar' | 'en'): KnowledgeRegistrySource[] {
  const normalizedMessage = message.trim().toLowerCase();

  if (!normalizedMessage) {
    return [];
  }

  return APPROVED_KNOWLEDGE_REGISTRY.map((source) => ({
    source,
    score: scoreSource(source, normalizedMessage, language),
  }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((match) => match.source);
}

function scoreSource(source: KnowledgeRegistrySource, normalizedMessage: string, language: 'ar' | 'en'): number {
  if (source.language !== 'bilingual' && source.language !== language) {
    return 0;
  }

  let score = 0;

  for (const keyword of source.keywords) {
    if (normalizedMessage.includes(keyword.toLowerCase())) {
      score += keyword.length > 8 ? 2 : 1;
    }
  }

  return score;
}