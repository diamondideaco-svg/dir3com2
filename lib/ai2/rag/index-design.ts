import type { AI2KnowledgeRecord } from '@/lib/ai2/knowledge/registry';

export type AI2RagIndexMode = 'lexical-only' | 'hybrid-prepared';

export type AI2RagChunk = {
  chunkId: string;
  sourceId: string;
  knowledgeVersion: string;
  language: 'ar' | 'en' | 'bilingual';
  text: string;
  tags: readonly string[];
};

export type AI2RagMatch = {
  chunkId: string;
  sourceId: string;
  score: number;
  reason: 'keyword' | 'tag' | 'language-match';
};

export type AI2RagIndexBlueprint = {
  mode: AI2RagIndexMode;
  maxMatches: number;
  sourceAllowList: readonly string[];
};

export type AI2InternalMatchGate = {
  hasStrongMatch: boolean;
  maxScore: number;
  threshold: number;
  matchedSourceIds: readonly string[];
};

export const AI2_INTERNAL_MATCH_THRESHOLD = 1;

const INTERNAL_ANCHOR_TOKEN_LIST = [
  'dir3com',
  'dabra',
  'ai2',
  'ai-2',
  'internal',
  'pilot',
  'baseline',
  'support',
  'sandbox',
  'الدرع',
  'الدبرة',
  'دابرا',
  'الداخلي',
  'الداخلية',
  'البايلوت',
  'الاساسي',
];

const INTERNAL_SUPPORT_TOKEN_LIST = [
  'auth',
  'authentication',
  'policy',
  'سياسة',
  'مصادقة',
  'معرفة',
  'مرجع',
  'استرجاع',
  'grounding',
  'fallback',
  'scope',
  'knowledge',
  'reference',
  'pilot',
  'ops',
  'operations',
  'المصادقة',
  'السياسة',
  'الاسترجاع',
  'المرجع',
  'المعرفة',
  'التشغيل',
];

const QUERY_STOPWORD_LIST = [
  'what',
  'is',
  'the',
  'a',
  'an',
  'latest',
  'today',
  'news',
  'global',
  'worldwide',
  'current',
  'recent',
  'trustworthy',
  'update',
  'trends',
  'support',
  'customer',
  'travel',
  'openai',
  'technology',
  'electronically',
  'electronic',
  'ما',
  'هي',
  'ماهي',
  'ماذا',
  'احدث',
  'آخر',
  'اخبار',
  'أخبار',
  'عالمي',
  'عالمية',
  'العالمية',
];

const INTERNAL_ANCHOR_TOKENS = new Set(INTERNAL_ANCHOR_TOKEN_LIST.flatMap((token) => tokenizeIntentTokens(token)));
const INTERNAL_SUPPORT_TOKENS = new Set(INTERNAL_SUPPORT_TOKEN_LIST.flatMap((token) => tokenizeIntentTokens(token)));
const QUERY_STOPWORDS = new Set(QUERY_STOPWORD_LIST.flatMap((token) => tokenizeIntentTokens(token)));

export const AI2_RAG_INDEX_BLUEPRINT: AI2RagIndexBlueprint = {
  mode: 'lexical-only',
  maxMatches: 8,
  sourceAllowList: [],
};

export function buildAI2RagChunks(registry: readonly AI2KnowledgeRecord[]): AI2RagChunk[] {
  return registry.flatMap((record) => {
    const chunks: AI2RagChunk[] = [];

    if (record.content.ar) {
      chunks.push({
        chunkId: `${record.sourceId}:ar:${record.knowledgeVersion}`,
        sourceId: record.sourceId,
        knowledgeVersion: record.knowledgeVersion,
        language: 'ar',
        text: record.content.ar,
        tags: record.tags,
      });
    }

    if (record.content.en) {
      chunks.push({
        chunkId: `${record.sourceId}:en:${record.knowledgeVersion}`,
        sourceId: record.sourceId,
        knowledgeVersion: record.knowledgeVersion,
        language: 'en',
        text: record.content.en,
        tags: record.tags,
      });
    }

    return chunks;
  });
}

export function evaluateAI2InternalMatchGate(query: string, matches: readonly AI2RagMatch[]): AI2InternalMatchGate {
  const maxScore = matches.reduce((currentMax, match) => Math.max(currentMax, match.score), 0);
  const matchedSourceIds = [...new Set(matches.map((match) => match.sourceId))];
  const queryTokens = tokenizeIntentTokens(query);
  const hasAnchor = queryTokens.some((token) => INTERNAL_ANCHOR_TOKENS.has(token));
  const hasSupportingSignal = queryTokens.some((token) => INTERNAL_SUPPORT_TOKENS.has(token));

  return {
    hasStrongMatch: maxScore >= AI2_INTERNAL_MATCH_THRESHOLD && hasAnchor && hasSupportingSignal,
    maxScore,
    threshold: AI2_INTERNAL_MATCH_THRESHOLD,
    matchedSourceIds,
  };
}

export function rankAI2RagMatches(query: string, chunks: readonly AI2RagChunk[], maxMatches = 5): AI2RagMatch[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(normalized, chunk),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxMatches)
    .map((entry) => ({
      chunkId: entry.chunk.chunkId,
      sourceId: entry.chunk.sourceId,
      score: entry.score,
      reason: 'keyword' as const,
    }));
}

function scoreChunk(query: string, chunk: AI2RagChunk): number {
  let score = 0;
  const queryTokens = tokenizeIntentTokens(query).filter((token) => !QUERY_STOPWORDS.has(token));
  const chunkTokens = new Set(tokenizeIntentTokens(chunk.text));
  const chunkTagTokens = new Set(chunk.tags.flatMap((tag) => tokenizeIntentTokens(tag)));

  for (const term of queryTokens) {
    if (!term) {
      continue;
    }

    if (chunkTokens.has(term)) {
      score += 2;
    }

    if (chunkTagTokens.has(term)) {
      score += 1;
    }
  }

  return score;
}

function tokenizeIntentTokens(input: string): string[] {
  return input
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
    .split(/\s+/)
    .filter(Boolean);
}