import type { AIProviderAdapter } from '@/lib/ai/types';
import { buildScoredItems } from '@/lib/ai/providers/shared';

type OpenAIRerankOutput = {
  orderedIds?: string[];
  reasons?: Record<string, string>;
};

function clampTimeout(input: string | undefined) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 4500;
  }

  return Math.min(10000, Math.max(1000, Math.trunc(parsed)));
}

function sanitizeModel(input: string | undefined) {
  const model = (input ?? '').trim();
  return model || 'gpt-4o-mini';
}

function parseRerankOutput(payload: unknown): OpenAIRerankOutput {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const rawOrdered = (payload as { orderedIds?: unknown }).orderedIds;
  const orderedIds = Array.isArray(rawOrdered)
    ? rawOrdered.map((entry) => String(entry)).filter(Boolean)
    : undefined;

  const rawReasons = (payload as { reasons?: unknown }).reasons;
  const reasons = rawReasons && typeof rawReasons === 'object'
    ? Object.fromEntries(
        Object.entries(rawReasons as Record<string, unknown>).map(([id, reason]) => [id, String(reason ?? '')])
      )
    : undefined;

  return {
    orderedIds,
    reasons,
  };
}

function fallbackReasonForService(service: { categoryLabel: string; destination: string; tags: string[] }) {
  const tags = service.tags.slice(0, 2).join(' + ');
  const destinationHint = service.destination && service.destination !== 'all' ? `وجهة ${service.destination}` : 'وجهة مرنة';

  return `${service.categoryLabel} | ${destinationHint}${tags ? ` | ${tags}` : ''}`;
}

async function rerankWithOpenAI(context: Parameters<AIProviderAdapter['search']>[0], apiKey: string) {
  const timeoutMs = clampTimeout(process.env.AI_SEARCH_OPENAI_TIMEOUT_MS);
  const model = sanitizeModel(process.env.AI_SEARCH_OPENAI_MODEL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const catalog = context.services.slice(0, 60).map((service) => ({
      id: String(service.id),
      name_ar: service.name_ar,
      name_en: service.name_en ?? null,
      category: service.category,
      destination: service.destination,
      price: service.basePrice,
      currency: service.currency,
      tags: service.tags.slice(0, 4),
      featured: service.featured,
      popular: service.popular,
      recommended: service.recommended,
      availability: service.availability,
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict ranking engine for marketplace travel services. Return JSON only with keys orderedIds and reasons. orderedIds must contain known IDs only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: context.request,
              services: catalog,
              output: {
                orderedIds: ['string id in ranked order'],
                reasons: { 'id': 'short rationale' },
              },
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    let parsed: OpenAIRerankOutput;
    try {
      parsed = parseRerankOutput(JSON.parse(content));
    } catch {
      return null;
    }

    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const openAIProvider: AIProviderAdapter = {
  id: 'openai',
  isEnabled(config) {
    return config.aiEnabled && config.providers.openai.enabled && config.providers.openai.apiKey.length > 0;
  },
  async search(context) {
    const ranked = buildScoredItems(context);
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';

    if (!apiKey) {
      return null;
    }

    const rerank = await rerankWithOpenAI(context, apiKey);
    if (!rerank?.orderedIds?.length) {
      return null;
    }

    const byId = new Map(ranked.scoredItems.map((item) => [String(item.service.id), item]));
    const ordered = rerank.orderedIds
      .map((id) => byId.get(String(id)))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (!ordered.length) {
      return null;
    }

    const usedIds = new Set(ordered.map((item) => String(item.service.id)));
    const remaining = ranked.scoredItems.filter((item) => !usedIds.has(String(item.service.id)));
    const merged = [...ordered, ...remaining].slice(0, ranked.scoredItems.length);

    const rescored = merged.map((item, index, all) => {
      const positional = Number((Math.max(0, all.length - index) / Math.max(1, all.length)).toFixed(4));
      const reason = rerank.reasons?.[String(item.service.id)]?.trim() || item.rationale || fallbackReasonForService(item.service);

      return {
        service: item.service,
        score: positional,
        rationale: reason,
      };
    });

    return {
      provider: 'openai',
      items: rescored,
      usedAI: true,
    };
  },
};
