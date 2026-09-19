import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isStayDemoResult, type StayDemoQuery, type StayDemoResult } from './stay-demo';

type RpcClient = {
  rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export type StayDemoGlobalDecision =
  | { decision: 'provider'; queryHash: string }
  | { decision: 'cache'; queryHash: string; value: StayDemoResult }
  | { decision: 'rate_limited' | 'unavailable'; queryHash: string };

function canonicalQuery(query: StayDemoQuery): string {
  return JSON.stringify({
    destination: query.destination,
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    adults: query.adults,
    rooms: query.rooms,
    nationality: query.nationality,
    currency: query.currency,
  });
}

export function stayDemoQueryHash(query: StayDemoQuery): string {
  return createHash('sha256').update(canonicalQuery(query)).digest('hex');
}

export function stayDemoRequestSubject(request: Request, env: NodeJS.ProcessEnv = process.env): string | null {
  const salt = env.DIR3COM_STAY_SANDBOX_RATE_SALT?.trim();
  if (!salt || salt.length < 32) return null;
  const forwarded = request.headers.get('x-vercel-forwarded-for');
  const address = forwarded?.split(',')[0]?.trim();
  if (!address) return null;
  return createHmac('sha256', salt).update(address).digest('hex');
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function createStayDemoGlobalGate(client: RpcClient | null = supabaseAdmin as RpcClient | null) {
  return {
    async acquire(query: StayDemoQuery, subjectHash: string): Promise<StayDemoGlobalDecision> {
      const queryHash = stayDemoQueryHash(query);
      if (!client || !/^[a-f0-9]{64}$/.test(subjectHash)) return { decision: 'unavailable', queryHash };
      const { data, error } = await client.rpc('acquire_public_stay_sandbox_slot', {
        p_subject_hash: subjectHash,
        p_query_hash: queryHash,
      });
      const payload = record(data);
      if (error || !payload) return { decision: 'unavailable', queryHash };
      if (payload.decision === 'cache' && isStayDemoResult(payload.payload)) {
        return { decision: 'cache', queryHash, value: payload.payload };
      }
      if (payload.decision === 'provider') return { decision: 'provider', queryHash };
      if (['rate_limited', 'daily_limit', 'busy'].includes(String(payload.decision))) {
        return { decision: 'rate_limited', queryHash };
      }
      return { decision: 'unavailable', queryHash };
    },
    async complete(queryHash: string, value: StayDemoResult): Promise<void> {
      if (!client || !/^[a-f0-9]{64}$/.test(queryHash) || !isStayDemoResult(value)
        || Buffer.byteLength(JSON.stringify(value), 'utf8') > 262144) {
        throw new Error('STAY_SANDBOX_CACHE_UNAVAILABLE');
      }
      const { error } = await client.rpc('complete_public_stay_sandbox_slot', { p_query_hash: queryHash, p_payload: value });
      if (error) throw new Error('STAY_SANDBOX_CACHE_UNAVAILABLE');
    },
    async release(queryHash: string): Promise<void> {
      if (!client || !/^[a-f0-9]{64}$/.test(queryHash)) return;
      await client.rpc('release_public_stay_sandbox_slot', { p_query_hash: queryHash });
    },
  };
}

export const stayDemoGlobalGate = createStayDemoGlobalGate();
