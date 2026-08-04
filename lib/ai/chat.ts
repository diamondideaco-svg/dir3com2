import { getAiSecretStatus } from '@/lib/ai/foundation';
import {
  APPROVED_KNOWLEDGE_REGISTRY,
  detectRequestLanguage,
  retrieveApprovedKnowledgeSources,
  type KnowledgeRegistrySource,
} from '@/lib/ai/knowledge-registry';

export type ControlledChatLanguage = 'ar' | 'en';

export type ControlledChatGroundingStatus = 'grounded' | 'fallback-no-source' | 'fallback-provider-unavailable';

export type ControlledChatSource = Pick<KnowledgeRegistrySource, 'sourceId' | 'sourceName' | 'language' | 'updateState'>;

export type ControlledChatResponse = {
  answer: string;
  sources: ControlledChatSource[];
  language: ControlledChatLanguage;
  groundingStatus: ControlledChatGroundingStatus;
};

const FALLBACK_MESSAGES: Record<ControlledChatLanguage, string> = {
  ar: 'لم أجد مصدرًا معتمدًا يجيب عن هذا الطلب. أعد صياغته ضمن سجل المعرفة المعتمد فقط، أو اطلب نطاقًا مدعومًا من DIR3COM.',
  en: 'I could not find an approved source for that request. Rephrase it against the approved DIR3COM knowledge registry, or ask about a supported scope.',
};

const PROVIDER_UNAVAILABLE_MESSAGES: Record<ControlledChatLanguage, string> = {
  ar: 'شريحة المحادثة جاهزة، لكن مزود AI غير مُعدّ حاليًا. أستطيع الإجابة فقط من المصادر المعتمدة، لذا أعد صياغة السؤال ضمن النطاق المعتمد.',
  en: 'The chat slice is ready, but no AI provider is configured. I can answer only from approved sources, so please narrow the request to the approved scope.',
};

export function buildControlledChatResponse(message: string): ControlledChatResponse {
  const language = detectRequestLanguage(message);
  const secretStatus = getAiSecretStatus();
  const sources = retrieveApprovedKnowledgeSources(message, language).map<ControlledChatSource>((source) => ({
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    language: source.language,
    updateState: source.updateState,
  }));

  if (sources.length === 0) {
    return {
      answer: secretStatus.providerConfigured ? FALLBACK_MESSAGES[language] : PROVIDER_UNAVAILABLE_MESSAGES[language],
      sources,
      language,
      groundingStatus: secretStatus.providerConfigured ? 'fallback-no-source' : 'fallback-provider-unavailable',
    };
  }

  return {
    answer: synthesizeAnswer(sources, language),
    sources,
    language,
    groundingStatus: 'grounded',
  };
}

function synthesizeAnswer(sources: ControlledChatSource[], language: ControlledChatLanguage): string {
  return sources
    .map((source) => {
      const registrySource = APPROVED_KNOWLEDGE_REGISTRY.find((candidate) => candidate.sourceId === source.sourceId);
      return registrySource?.answers[language] ?? '';
    })
    .filter(Boolean)
    .join(' ');
}
