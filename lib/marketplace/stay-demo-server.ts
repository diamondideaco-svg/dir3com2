import 'server-only';
import { searchLiteApiHotels } from '../travel/liteapi/stays';
import { stayDemoEnabled } from './stay-demo-mode';
import { stayDemoCards, stayDemoProviderInput, type StayDemoQuery, type StayDemoResult } from './stay-demo';
import { stayDemoGlobalGate, type StayDemoGlobalDecision } from './stay-demo-global';

type GlobalGate = {
  acquire(query: StayDemoQuery, subjectHash: string): Promise<StayDemoGlobalDecision>;
  complete(queryHash: string, leaseToken: string, value: StayDemoResult): Promise<void>;
  release(queryHash: string, leaseToken: string): Promise<void>;
};

// Bounded process cache/coalescing, never a claim of distributed account quota.
// Provider still enforces its account-wide limit; see release controls in docs.
export function createStayDemoSearch(search = searchLiteApiHotels, clock = Date.now, globalGate: GlobalGate = stayDemoGlobalGate) {
  const cache = new Map<string, { until: number; value: StayDemoResult }>();
  const pending = new Map<string, Promise<StayDemoResult>>();
  let lastStart = -Infinity;
  return async function run(query: StayDemoQuery, env: NodeJS.ProcessEnv = process.env, subjectHash?: string): Promise<StayDemoResult> {
    const empty = (status: StayDemoResult['status']): StayDemoResult => ({ status, cards: [], retrievedAt: new Date(clock()).toISOString() });
    if (!stayDemoEnabled(env)) return empty('unavailable');
    if (env.VERCEL_ENV === 'production') {
      if (!subjectHash) return empty('unavailable');
      let access: StayDemoGlobalDecision;
      try { access = await globalGate.acquire(query, subjectHash); }
      catch { return empty('unavailable'); }
      if (access.decision === 'cache') return access.value;
      if (access.decision === 'rate_limited') return { ...empty('rate_limited'), retryAfterSeconds: access.retryAfterSeconds };
      if (access.decision !== 'provider') return empty('unavailable');
      try {
        const result = await search(stayDemoProviderInput(query), { timeoutMs: 12000, singleAttempt: true });
        const retrievedAt = new Date(clock()).toISOString();
        const cards = stayDemoCards(result, retrievedAt, query.rooms);
        const value: StayDemoResult = { status: result.status === 'ok' ? (result.sandbox !== true || result.provider !== 'liteapi' ? 'unavailable' : cards.length ? 'ok' : 'no_results') : result.status === 'no_results' ? 'no_results' : 'unavailable', cards, retrievedAt };
        await globalGate.complete(access.queryHash, access.leaseToken, value);
        return value;
      } catch {
        // Cleanup is best effort: a database outage must not escape as an error
        // containing provider/connection details. The bounded lease expires.
        try { await globalGate.release(access.queryHash, access.leaseToken); } catch { /* fail closed */ }
        return empty('unavailable');
      }
    }
    const key = JSON.stringify(query);
    const cached = cache.get(key);
    if (cached && cached.until > clock()) return cached.value;
    const existing = pending.get(key); if (existing) return existing;
    if (pending.size >= 1 || clock() - lastStart < 1000) {
      return { ...empty('rate_limited'), retryAfterSeconds: pending.size >= 1 ? 12 : 1 };
    }
    lastStart = clock();
    const work = (async () => {
      try {
        const result = await search(stayDemoProviderInput(query), { timeoutMs: 12000, singleAttempt: true });
        const retrievedAt = new Date(clock()).toISOString();
        const cards = stayDemoCards(result, retrievedAt, query.rooms);
        const value: StayDemoResult = { status: result.status === 'ok' ? (result.sandbox !== true || result.provider !== 'liteapi' ? 'unavailable' : cards.length ? 'ok' : 'no_results') : result.status === 'no_results' ? 'no_results' : 'unavailable', cards, retrievedAt };
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { until: clock() + (value.status === 'unavailable' ? 10000 : 60000), value });
        return value;
      } catch { return empty('unavailable'); }
      finally { pending.delete(key); }
    })();
    pending.set(key, work);
    return work;
  };
}
export const searchStayDemo = createStayDemoSearch();
