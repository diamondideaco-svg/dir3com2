import { createDefaultCapabilityAdapters } from './capabilities';
import { createHumanHandoff } from './handoff';
import { parseTravelIntent } from './intent';
import { applyIntentToPlan, createTripPlan, replaceServiceResult } from './plan';
import { sanitizeProviderError } from './security';
import type { OrchestrationResult, TravelCapabilityAdapter, TripPlan } from './types';

type Scope = { ownerId: string; tenantId: string };

export class DabraTravelOrchestrator {
  private readonly adapters: Map<string, TravelCapabilityAdapter>;

  constructor(adapters: TravelCapabilityAdapter[] = createDefaultCapabilityAdapters()) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.capability, adapter]));
  }

  async orchestrate(message: string, scope: Scope, existingPlan?: TripPlan): Promise<OrchestrationResult> {
    const intent = parseTravelIntent(message);
    let plan = existingPlan ? applyIntentToPlan(existingPlan, scope, intent) : createTripPlan(scope, intent);
    if (intent.kind === 'human_handoff') return { intent, plan, handoff: createHumanHandoff(scope, plan, 'customer_requested') };
    if (intent.confidence < 0.3 && intent.kind === 'unknown') return { intent, plan, handoff: createHumanHandoff(scope, plan, 'low_confidence') };
    if (intent.missingRequired.length) return { intent, plan };
    plan.status = 'searching';
    const results = await Promise.all(plan.services.filter((service) => service.status !== 'removed').map(async (service) => {
      const adapter = this.adapters.get(service.capability);
      if (!adapter) return { capability: service.capability, status: 'unavailable' as const, options: [], blockedReason: 'provider_unavailable' as const };
      try {
        return await adapter.search({ ownerId: scope.ownerId, tenantId: scope.tenantId, plan, intent });
      } catch (error) {
        return { capability: service.capability, status: 'unavailable' as const, options: [], blockedReason: 'provider_unavailable' as const, userMessage: sanitizeProviderError(error, intent.language) };
      }
    }));
    for (const result of results) plan = replaceServiceResult(plan, result);
    const allBlocked = plan.services.length > 0 && plan.services.every((service) => ['blocked', 'unavailable'].includes(service.status));
    return { intent, plan, handoff: allBlocked ? createHumanHandoff(scope, plan, 'provider_blocked') : undefined };
  }

  async revalidate(plan: TripPlan, scope: Scope): Promise<TripPlan> {
    const next = structuredClone(plan);
    for (const service of next.services) {
      const option = service.options.find((entry) => entry.id === service.selectedOptionId);
      const adapter = this.adapters.get(service.capability);
      if (!option || !adapter?.revalidate) continue;
      const refreshed = await adapter.revalidate(option, { ownerId: scope.ownerId, tenantId: scope.tenantId, plan: next, intent: { language: next.language, kind: 'modify_trip', preferences: {}, requestedCapabilities: [service.capability], constraints: [], modifications: [], missingRequired: [], confidence: 1 } });
      service.options = service.options.map((entry) => entry.id === option.id ? refreshed : entry);
    }
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    return next;
  }
}
