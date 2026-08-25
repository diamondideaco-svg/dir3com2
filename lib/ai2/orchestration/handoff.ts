import { randomUUID } from 'node:crypto';
import { assertOwnerScope } from './security';
import type { HumanHandoff, TripPlan } from './types';

export function createHumanHandoff(scope: { ownerId: string; tenantId: string }, plan: TripPlan, reason: HumanHandoff['reason'], now = new Date()): HumanHandoff {
  assertOwnerScope(scope, plan);
  const blockedCapabilities = plan.services.filter((service) => service.status === 'blocked' || service.status === 'unavailable').map((service) => service.capability);
  return {
    id: randomUUID(), ownerId: scope.ownerId, tenantId: scope.tenantId, planId: plan.id, reason, status: 'requested',
    context: {
      destination: plan.destination,
      dates: plan.segments[0] ? [plan.segments[0].startDate, plan.segments[0].endDate].filter(Boolean).join(' — ') : undefined,
      travelers: plan.travelers,
      requestedCapabilities: plan.services.map((service) => service.capability),
      blockedCapabilities,
    },
    createdAt: now.toISOString(),
  };
}
