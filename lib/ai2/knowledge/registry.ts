export type AI2Language = 'ar' | 'en' | 'bilingual';

export type AI2UpdateState = 'approved' | 'reviewing' | 'archived';

export type AI2KnowledgeRecord = {
  sourceId: string;
  sourceName: string;
  language: AI2Language;
  updateState: AI2UpdateState;
  knowledgeVersion: string;
  lastReviewedAt: string;
  domain: 'core-policy' | 'pilot-operations' | 'service-catalog' | 'support-playbooks';
  tags: readonly string[];
  content: {
    ar?: string;
    en?: string;
  };
};

export const AI2_KNOWLEDGE_REGISTRY: readonly AI2KnowledgeRecord[] = [
  {
    sourceId: 'ai2-core-policy-001',
    sourceName: 'DIR3COM Central Reference',
    language: 'bilingual',
    updateState: 'approved',
    knowledgeVersion: '1.0.0',
    lastReviewedAt: '2026-08-05',
    domain: 'core-policy',
    tags: ['baseline', 'ai1', 'eo-055', 'scope', 'policy', 'dir3com', 'dabra', 'internal'],
    content: {
      ar: 'AI-1 baseline ثابت، وأعمال AI-2 تحضيرية فقط وبشكل forward-only.',
      en: 'AI-1 baseline is locked, and AI-2 work is preparation-only and forward-only.',
    },
  },
  {
    sourceId: 'ai2-pilot-ops-001',
    sourceName: 'Controlled Pilot Operations',
    language: 'bilingual',
    updateState: 'approved',
    knowledgeVersion: '1.0.0',
    lastReviewedAt: '2026-08-05',
    domain: 'pilot-operations',
    tags: ['controlled-pilot', 'auth', 'staging', 'internal', 'dir3com', 'dabra', 'pilot'],
    content: {
      ar: 'واجهة الـPilot تبقى محمية بالمصادقة ولا تُفتح للعامة.',
      en: 'Pilot UI remains authentication-gated and is not opened to public traffic.',
    },
  },
  {
    sourceId: 'ai2-support-playbook-001',
    sourceName: 'Fallback and Grounding Playbook',
    language: 'bilingual',
    updateState: 'approved',
    knowledgeVersion: '1.0.0',
    lastReviewedAt: '2026-08-05',
    domain: 'support-playbooks',
    tags: ['fallback', 'grounding', 'attribution', 'internal', 'dir3com', 'dabra', 'support'],
    content: {
      ar: 'عند غياب المصدر، يجب تقديم fallback واضح بدون أي مصدر مختلق.',
      en: 'When sources are missing, return explicit fallback behavior without fabricated attribution.',
    },
  },
];

export function getAI2KnowledgeByDomain(domain: AI2KnowledgeRecord['domain']): AI2KnowledgeRecord[] {
  return AI2_KNOWLEDGE_REGISTRY.filter((record) => record.domain === domain);
}