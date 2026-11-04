import { parseCustomerCaseRead, type CustomerCaseRead } from './customer-cases';

type ReadyCases = Extract<CustomerCaseRead, { kind: 'ready' }>;
export type CustomerCaseSnapshot = Readonly<{
  generation: number; identity: 'loading' | 'customer' | 'authentication_required' | 'unavailable';
  busy: boolean; cases: ReadyCases | null; error: boolean;
}>;
const initial: CustomerCaseSnapshot = Object.freeze({ generation: 0, identity: 'loading', busy: false, cases: null, error: false });
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Memory-only display state. The existing server Auth and Case RPC authorize every read/write. */
export class CustomerCaseSession {
  private state = initial;
  private actor: string | null = null;
  private identityRequest: AbortController | null = null;
  private caseRequest: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args)) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: CustomerCaseSnapshot) {
    this.state = Object.freeze(next); for (const listener of this.listeners) listener();
  }
  clear(identity: CustomerCaseSnapshot['identity'] = 'loading') {
    this.identityRequest?.abort(); this.caseRequest?.abort(); this.actor = null;
    this.publish({ generation: this.state.generation + 1, identity, busy: false, cases: null, error: false });
  }
  async refreshIdentity(hint?: { sameAccountRefresh: boolean; userId: string | null }) {
    // SDK identity is a refresh hint, never permission. A changed/absent actor
    // invalidates forms and outstanding responses before the first await.
    const preserve = Boolean(hint?.sameAccountRefresh && hint.userId && hint.userId === this.actor);
    if (!preserve) this.clear();
    this.identityRequest?.abort();
    const controller = new AbortController(); this.identityRequest = controller;
    const generation = this.state.generation;
    const current = () => this.identityRequest === controller && !controller.signal.aborted && generation === this.state.generation;
    try {
      const response = await this.transport('/api/dabra/session-identity', { cache: 'no-store', credentials: 'same-origin',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      const body: unknown = await response.json();
      if (!current()) return;
      if (!response.ok || !record(body)) { this.clear('unavailable'); return; }
      if (body.identityState === 'anonymous_confirmed' && body.authenticated === false) { this.clear('authentication_required'); return; }
      if (body.identityState !== 'authenticated' || body.authenticated !== true || typeof body.userId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.userId)) { this.clear('unavailable'); return; }
      if (this.actor && this.actor !== body.userId) this.clear();
      this.actor = body.userId;
      if (preserve && generation === this.state.generation) return;
      this.publish({ ...this.state, identity: 'customer' });
      await this.reload();
    } catch { if (current()) this.clear('unavailable'); }
  }
  async reload() {
    if (!this.actor || this.state.identity !== 'customer') return;
    this.caseRequest?.abort();
    const controller = new AbortController(); this.caseRequest = controller;
    const generation = this.state.generation;
    const current = () => this.caseRequest === controller && !controller.signal.aborted && generation === this.state.generation;
    this.publish({ ...this.state, busy: true, error: false });
    try {
      const response = await this.transport('/api/support/cases', { cache: 'no-store', credentials: 'same-origin',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      const body: unknown = await response.json();
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { this.clear('authentication_required'); return; }
      const data = response.ok ? parseCustomerCaseRead(body) : null;
      this.publish({ ...this.state, busy: false, cases: data, error: !data });
    } catch { if (current()) this.publish({ ...this.state, busy: false, cases: null, error: true }); }
  }
}
