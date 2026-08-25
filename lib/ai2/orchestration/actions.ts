import { randomUUID } from 'node:crypto';
import { assertOwnerScope, sanitizeProviderError } from './security';
import type { ActionState, TravelAction, TripPlan } from './types';

type Scope = { ownerId: string; tenantId: string };
const transitions: Record<ActionState, ActionState[]> = {
  PROPOSED: ['READY_FOR_CONFIRMATION', 'CANCELLED'],
  READY_FOR_CONFIRMATION: ['CONFIRMED_BY_USER', 'CANCELLED'],
  CONFIRMED_BY_USER: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: [], FAILED: [], CANCELLED: [],
};

export class TravelActionGate {
  private readonly byIdempotencyKey = new Map<string, TravelAction>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  prepare(scope: Scope, plan: TripPlan, input: Pick<TravelAction, 'capability' | 'kind' | 'idempotencyKey'>): TravelAction {
    assertOwnerScope(scope, plan);
    if (!/^[A-Za-z0-9._:-]{8,255}$/.test(input.idempotencyKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
    const replay = this.byIdempotencyKey.get(input.idempotencyKey);
    if (replay) {
      assertOwnerScope(scope, replay);
      return structuredClone(replay);
    }
    const timestamp = this.now().toISOString();
    const action: TravelAction = { id: randomUUID(), ownerId: scope.ownerId, tenantId: scope.tenantId, planId: plan.id, capability: input.capability, kind: input.kind, state: 'PROPOSED', idempotencyKey: input.idempotencyKey, confirmationNonce: randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    this.byIdempotencyKey.set(input.idempotencyKey, action);
    return structuredClone(action);
  }

  transition(scope: Scope, idempotencyKey: string, nextState: ActionState, confirmationNonce?: string): TravelAction {
    const action = this.byIdempotencyKey.get(idempotencyKey);
    if (!action) throw new Error('ACTION_NOT_FOUND');
    assertOwnerScope(scope, action);
    if (!transitions[action.state].includes(nextState)) throw new Error('INVALID_ACTION_TRANSITION');
    if (nextState === 'CONFIRMED_BY_USER' && confirmationNonce !== action.confirmationNonce) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
    if (nextState === 'EXECUTING' && action.state !== 'CONFIRMED_BY_USER') throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
    action.state = nextState;
    action.updatedAt = this.now().toISOString();
    return structuredClone(action);
  }

  async executeSandbox<T>(scope: Scope, idempotencyKey: string, executor: () => Promise<T>): Promise<{ action: TravelAction; result?: T }> {
    const action = this.byIdempotencyKey.get(idempotencyKey);
    if (!action) throw new Error('ACTION_NOT_FOUND');
    assertOwnerScope(scope, action);
    if (action.state !== 'CONFIRMED_BY_USER') throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
    if (process.env.TRAVEL_PROVIDER_ENV !== 'test' && process.env.TRAVEL_PROVIDER_ENV !== 'sandbox') throw new Error('LIVE_MUTATION_FORBIDDEN');
    this.transition(scope, idempotencyKey, 'EXECUTING');
    try {
      const result = await executor();
      return { action: this.transition(scope, idempotencyKey, 'CONFIRMED'), result };
    } catch (error) {
      action.state = 'FAILED';
      action.sanitizedError = sanitizeProviderError(error);
      action.updatedAt = this.now().toISOString();
      return { action: structuredClone(action) };
    }
  }
}

export type PaymentPreparation = { status: 'BOUNDARY_ONLY'; requiresExplicitApproval: true; productionPaymentAllowed: false; amount: string; currency: string; planId: string };
export function preparePaymentBoundary(scope: Scope, plan: TripPlan, amount: string, currency: string): PaymentPreparation {
  assertOwnerScope(scope, plan);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) throw new Error('INVALID_PAYMENT_PREPARATION');
  return { status: 'BOUNDARY_ONLY', requiresExplicitApproval: true, productionPaymentAllowed: false, amount, currency, planId: plan.id };
}
