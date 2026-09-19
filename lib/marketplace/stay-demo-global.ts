import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isStayDemoResult, type StayDemoQuery, type StayDemoResult } from './stay-demo';

type RpcClient = {
  rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export type StayDemoGlobalDecision =
  | { decision: 'provider'; queryHash: string; leaseToken: string }
  | { decision: 'cache'; queryHash: string; value: StayDemoResult }
  | { decision: 'rate_limited'; queryHash: string; retryAfterSeconds: number }
  | { decision: 'unavailable'; queryHash: string };

const validLeaseToken = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

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
  if (env.VERCEL !== '1' || !salt || salt.length < 32) return null;
  const forwarded = request.headers.get('x-vercel-forwarded-for');
  const address = forwarded?.split(',')[0]?.trim();
  if (!address || !isIP(address)) return null;
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
      if (payload.decision === 'provider' && validLeaseToken(payload.lease_token)) {
        return { decision: 'provider', queryHash, leaseToken: payload.lease_token };
      }
      if (['rate_limited', 'daily_limit', 'busy'].includes(String(payload.decision))
        && typeof payload.retry_after_seconds === 'number' && Number.isInteger(payload.retry_after_seconds)
        && payload.retry_after_seconds >= 1 && payload.retry_after_seconds <= 86400) {
        return { decision: 'rate_limited', queryHash, retryAfterSeconds: payload.retry_after_seconds };
      }
      return { decision: 'unavailable', queryHash };
    },
    async complete(queryHash: string, leaseToken: string, value: StayDemoResult): Promise<void> {
      if (!client || !/^[a-f0-9]{64}$/.test(queryHash) || !validLeaseToken(leaseToken) || !isStayDemoResult(value)
        || Buffer.byteLength(JSON.stringify(value), 'utf8') > 262144) {
        throw new Error('STAY_SANDBOX_CACHE_UNAVAILABLE');
      }
      const { data, error } = await client.rpc('complete_public_stay_sandbox_slot', {
        p_query_hash: queryHash, p_lease_token: leaseToken, p_payload: value,
      });
      if (error || data !== true) throw new Error('STAY_SANDBOX_CACHE_UNAVAILABLE');
    },
    async release(queryHash: string, leaseToken: string): Promise<void> {
      if (!client || !/^[a-f0-9]{64}$/.test(queryHash) || !validLeaseToken(leaseToken)) return;
      await client.rpc('release_public_stay_sandbox_slot', { p_query_hash: queryHash, p_lease_token: leaseToken });
    },
  };
}

export const stayDemoGlobalGate = createStayDemoGlobalGate();
