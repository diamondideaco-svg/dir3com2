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

const INTERNAL_TOPIC_SIGNAL_PATTERNS = [
  /\b(?:dir3com|dabra|ai2|ai-2|pilot|baseline|policy|internal|auth|grounding|fallback|support|sandbox)\b/,
  /(?:الدرع|الدبرة|دابرا|اي2|آي2|البايلوت|الداخلي|السياسة|المصادقة|الاسترجاع|المرجع|المعرفة)/,
] as const;

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

  return {
    hasStrongMatch: maxScore >= AI2_INTERNAL_MATCH_THRESHOLD && hasInternalTopicSignal(query),
    maxScore,
    threshold: AI2_INTERNAL_MATCH_THRESHOLD,
    matchedSourceIds,
  };
}

function hasInternalTopicSignal(query: string): boolean {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  for (const pattern of INTERNAL_TOPIC_SIGNAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
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

  for (const term of query.split(/\s+/)) {
    if (!term) {
      continue;
    }

    if (chunk.text.toLowerCase().includes(term)) {
      score += 2;
    }

    if (chunk.tags.some((tag) => tag.toLowerCase().includes(term))) {
      score += 1;
    }
  }

  return score;
}