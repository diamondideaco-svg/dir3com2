import { assertOwnerScope } from './security';
import type { TravelMemoryRecord, TravelParty, TravelPreferences } from './types';

type Scope = { ownerId: string; tenantId: string; sessionId: string };
type MemoryPatch = {
  preferences?: Partial<TravelPreferences>;
  preferredCities?: string[];
  budgetTendency?: TravelMemoryRecord['budgetTendency'];
  travelParty?: TravelParty;
  currentPlanId?: string;
};

function key(scope: Scope) {
  return `${scope.tenantId}:${scope.ownerId}:${scope.sessionId}`;
}

export class TravelMemoryStore {
  private readonly records = new Map<string, TravelMemoryRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  inspect(scope: Scope): TravelMemoryRecord | null {
    const record = this.records.get(key(scope));
    if (!record) return null;
    assertOwnerScope(scope, record);
    return structuredClone(record);
  }

  update(scope: Scope, patch: MemoryPatch): TravelMemoryRecord {
    if (!scope.ownerId || !scope.tenantId || !scope.sessionId) throw new Error('MEMORY_SCOPE_REQUIRED');
    const existing = this.records.get(key(scope));
    if (existing) assertOwnerScope(scope, existing);
    const timestamp = this.now().toISOString();
    const record: TravelMemoryRecord = {
      ownerId: scope.ownerId,
      tenantId: scope.tenantId,
      sessionId: scope.sessionId,
      revision: (existing?.revision ?? 0) + 1,
      preferences: { ...(existing?.preferences ?? {}), ...(patch.preferences ?? {}) },
      preferredCities: [...new Set([...(existing?.preferredCities ?? []), ...(patch.preferredCities ?? [])])].slice(0, 20),
      budgetTendency: patch.budgetTendency ?? existing?.budgetTendency,
      travelParty: patch.travelParty ?? existing?.travelParty,
      currentPlanId: patch.currentPlanId ?? existing?.currentPlanId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.records.set(key(scope), record);
    return structuredClone(record);
  }

  revoke(scope: Scope): boolean {
    const existing = this.records.get(key(scope));
    if (existing) assertOwnerScope(scope, existing);
    return this.records.delete(key(scope));
  }

  inspectForOwner(requester: Scope, target: Scope): TravelMemoryRecord | null {
    assertOwnerScope(requester, target);
    return this.inspect(target);
  }
}
