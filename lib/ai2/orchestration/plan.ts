import { randomUUID } from 'node:crypto';
import { assertOwnerScope } from './security';
import type { NormalizedTravelOption, TravelCapability, TravelIntent, TripPlan, TripServicePlan } from './types';

export function createTripPlan(scope: { ownerId: string; tenantId: string }, intent: TravelIntent, now = new Date()): TripPlan {
  const timestamp = now.toISOString();
  const destination = intent.destination;
  return {
    id: randomUUID(),
    ownerId: scope.ownerId,
    tenantId: scope.tenantId,
    revision: 1,
    language: intent.language,
    destination,
    travelers: intent.travelers ?? { adults: 1, children: 0 },
    segments: destination ? [{ id: randomUUID(), origin: intent.origin, destination, startDate: intent.startDate, endDate: intent.endDate }] : [],
    services: intent.requestedCapabilities.map((capability) => ({ capability, status: 'pending', options: [] })),
    budget: intent.budget && intent.currency ? { amount: intent.budget, currency: intent.currency } : undefined,
    status: 'draft',
    approvalState: 'NOT_REQUESTED',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function applyIntentToPlan(plan: TripPlan, scope: { ownerId: string; tenantId: string }, intent: TravelIntent, now = new Date()): TripPlan {
  assertOwnerScope(scope, plan);
  const next = structuredClone(plan);
  if (intent.destination) {
    next.destination = intent.destination;
    if (next.segments[0]) next.segments[0].destination = intent.destination;
    else next.segments.push({ id: randomUUID(), destination: intent.destination, startDate: intent.startDate, endDate: intent.endDate });
  }
  if (intent.travelers) next.travelers = intent.travelers;
  if (intent.budget && intent.currency) next.budget = { amount: intent.budget, currency: intent.currency };
  for (const capability of intent.requestedCapabilities) {
    if (!next.services.some((service) => service.capability === capability)) next.services.push({ capability, status: 'pending', options: [] });
  }
  for (const modification of intent.modifications) {
    if (modification.field === 'destination' && typeof modification.value === 'string') next.destination = modification.value;
  }
  next.revision += 1;
  next.status = 'draft';
  next.approvalState = 'NOT_REQUESTED';
  next.updatedAt = now.toISOString();
  return next;
}

export function replaceServiceResult(plan: TripPlan, result: TripServicePlan, now = new Date()): TripPlan {
  const next = structuredClone(plan);
  const index = next.services.findIndex((service) => service.capability === result.capability);
  if (index >= 0) next.services[index] = result;
  else next.services.push(result);
  next.revision += 1;
  const hasBlocked = next.services.some((service) => service.status === 'blocked' || service.status === 'unavailable');
  const hasOptions = next.services.some((service) => service.options.length > 0);
  next.status = hasBlocked ? 'partially_blocked' : hasOptions ? 'options_ready' : 'draft';
  next.updatedAt = now.toISOString();
  next.estimatedTotal = calculateEstimatedTotal(next.services);
  return next;
}

function calculateEstimatedTotal(services: TripServicePlan[]): TripPlan['estimatedTotal'] {
  const selected = services.map((service) => service.options.find((option) => option.id === service.selectedOptionId) ?? service.options[0]).filter(Boolean) as NormalizedTravelOption[];
  if (!selected.length) return undefined;
  const currencies = [...new Set(selected.map((option) => option.currency).filter(Boolean))];
  if (currencies.length !== 1) return undefined;
  const amounts = selected.map((option) => Number(option.amount)).filter(Number.isFinite);
  return { amount: amounts.reduce((sum, amount) => sum + amount, 0).toFixed(2), currency: currencies[0]!, complete: selected.length === services.filter((service) => service.status !== 'removed').length };
}

export type ComparisonMode = 'cheapest' | 'fastest' | 'best_value' | 'premium' | 'family_friendly' | 'closest' | 'recommended';
export function compareOptions(options: NormalizedTravelOption[], mode: ComparisonMode): NormalizedTravelOption[] {
  const ranked = [...options];
  const amount = (option: NormalizedTravelOption) => Number.isFinite(Number(option.amount)) ? Number(option.amount) : Number.POSITIVE_INFINITY;
  if (mode === 'cheapest') return ranked.sort((a, b) => amount(a) - amount(b));
  if (mode === 'fastest') return ranked.sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity));
  if (mode === 'closest') return ranked.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  if (mode === 'premium') return ranked.sort((a, b) => Number(Boolean(b.premium)) - Number(Boolean(a.premium)) || amount(b) - amount(a));
  if (mode === 'family_friendly') return ranked.sort((a, b) => Number(Boolean(b.familyFriendly)) - Number(Boolean(a.familyFriendly)));
  if (mode === 'best_value') return ranked.sort((a, b) => (amount(a) / Math.max(1, a.evidence.length)) - (amount(b) / Math.max(1, b.evidence.length)));
  return ranked.sort((a, b) => b.evidence.length - a.evidence.length);
}

export function selectOption(plan: TripPlan, scope: { ownerId: string; tenantId: string }, capability: TravelCapability, optionId: string, now = new Date()): TripPlan {
  assertOwnerScope(scope, plan);
  const next = structuredClone(plan);
  const service = next.services.find((entry) => entry.capability === capability);
  if (!service?.options.some((option) => option.id === optionId)) throw new Error('OPTION_NOT_FOUND');
  service.selectedOptionId = optionId;
  service.status = 'selected';
  next.revision += 1;
  next.approvalState = next.services.filter((entry) => !['removed', 'blocked', 'unavailable'].includes(entry.status)).every((entry) => entry.selectedOptionId) ? 'READY_FOR_CONFIRMATION' : 'PROPOSED';
  next.status = 'awaiting_confirmation';
  next.updatedAt = now.toISOString();
  next.estimatedTotal = calculateEstimatedTotal(next.services);
  return next;
}
