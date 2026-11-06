import { parseCustomerCaseRead, parseCustomerCaseReference, type CustomerCaseRead } from './customer-cases';

type ReadyCases = Extract<CustomerCaseRead, { kind: 'ready' }>;
type SubmissionError = 'CONTACT_INVALID' | 'CONTACT_RATE_LIMITED' | 'CONTACT_KEY_CONFLICT' | 'CONTACT_DELIVERY_UNAVAILABLE';
export type CustomerCaseSubmissionResult =
  | Readonly<{ kind: 'saved'; reference: string; commit: () => boolean }>
  | Readonly<{ kind: 'error'; code: SubmissionError; commit: () => boolean }>
  | Readonly<{ kind: 'inactive'; canDisplay: () => boolean }>
  | Readonly<{ kind: 'busy'; canDisplay: () => boolean }>;
export type CustomerCaseSubmit = (request: Readonly<{ payload: string; signal: AbortSignal }>) => Promise<CustomerCaseSubmissionResult>;
export type CustomerCaseSnapshot = Readonly<{
  generation: number; identity: 'loading' | 'customer' | 'authentication_required' | 'unavailable';
  busy: boolean; cases: ReadyCases | null; error: boolean;
}>;
const initial: CustomerCaseSnapshot = Object.freeze({ generation: 0, identity: 'loading', busy: false, cases: null, error: false });
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function submissionError(value: unknown): SubmissionError {
  return value === 'CONTACT_INVALID' || value === 'CONTACT_RATE_LIMITED' || value === 'CONTACT_KEY_CONFLICT'
    ? value : 'CONTACT_DELIVERY_UNAVAILABLE';
}
/** Bounded listener/timer lifetime without requiring AbortSignal.any/timeout in the browser. */
function caseRequestSignal(sources: readonly AbortSignal[], timeoutMs?: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => { if (timer !== undefined) clearTimeout(timer); sources.forEach(signal => signal.removeEventListener('abort', abort)); };
  for (const signal of sources) {
    if (signal.aborted) { abort(); break; }
    signal.addEventListener('abort', abort, { once: true });
  }
  if (timeoutMs !== undefined && !controller.signal.aborted) timer = setTimeout(abort, timeoutMs);
  return { signal: controller.signal, dispose };
}
/** Memory-only display state. Server Auth and Case RPC still authorize every read/write. */
export class CustomerCaseSession {
  private state = initial;
  private actor: string | null = null;
  private identityRequest: AbortController | null = null;
  private caseRequest: AbortController | null = null;
  // One nonce/status only. No submitted body, body hash, receipt or persistent storage.
  private submission: Readonly<{ key: string; kind: 'pending' | 'unknown' }> | null = null;
  private submissionRequest: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args)) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: CustomerCaseSnapshot) {
    this.state = Object.freeze(next); for (const listener of this.listeners) listener();
  }
  private suspendSubmission() {
    const request = this.submissionRequest; this.submissionRequest = null;
    request?.abort();
    if (this.submission) this.submission = { key: this.submission.key, kind: 'unknown' };
  }
  clear(identity: CustomerCaseSnapshot['identity'] = 'loading') {
    this.identityRequest?.abort(); this.caseRequest?.abort(); this.suspendSubmission();
    this.submission = null; this.actor = null;
    this.publish({ generation: this.state.generation + 1, identity, busy: false, cases: null, error: identity === 'unavailable' });
  }
  async refreshIdentity(hint?: { sameAccountRefresh: boolean; userId: string | null }) {
    const preserve = Boolean(hint?.sameAccountRefresh && hint.userId && hint.userId === this.actor);
    if (preserve) {
      // Pending verification is distinct from failed/absent identity. Keep only
      // the nonce, hide private display state and prohibit writes meanwhile.
      this.caseRequest?.abort(); this.suspendSubmission();
      this.publish({ generation: this.state.generation, identity: 'loading', busy: false, cases: null, error: false });
    } else this.clear();
    this.identityRequest?.abort();
    const controller = new AbortController(); this.identityRequest = controller;
    const bounded = caseRequestSignal([controller.signal], 8000);
    const generation = this.state.generation;
    const current = () => this.identityRequest === controller && !controller.signal.aborted && generation === this.state.generation;
    try {
      const response = await this.transport('/api/dabra/session-identity', { cache: 'no-store', credentials: 'same-origin',
        signal: bounded.signal });
      if (!current()) return;
      if (bounded.signal.aborted) throw new Error('case_request_stopped');
      if (!response.ok) { this.clear('unavailable'); return; }
      const body: unknown = await response.json();
      if (!current()) return;
      if (bounded.signal.aborted) throw new Error('case_request_stopped');
      if (!record(body)) { this.clear('unavailable'); return; }
      if (body.identityState === 'anonymous_confirmed' && body.authenticated === false) { this.clear('authentication_required'); return; }
      if (body.identityState !== 'authenticated' || body.authenticated !== true || typeof body.userId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.userId)) { this.clear('unavailable'); return; }
      if (this.actor && this.actor !== body.userId) this.clear();
      this.actor = body.userId;
      // Auth identity alone does not establish the canonical Customer role.
      await this.readCases(true);
    } catch { if (current()) this.clear('unavailable'); }
    finally { bounded.dispose(); }
  }
  async reload() { await this.readCases(false); }
  private async readCases(verifyingCustomer: boolean) {
    if (!this.actor || (this.state.identity !== 'customer' && !(verifyingCustomer && this.state.identity === 'loading'))) return;
    this.caseRequest?.abort();
    const controller = new AbortController(); this.caseRequest = controller;
    const bounded = caseRequestSignal([controller.signal], 10000);
    const generation = this.state.generation;
    const current = () => this.caseRequest === controller && !controller.signal.aborted && generation === this.state.generation;
    this.publish({ ...this.state, busy: true, error: false });
    try {
      const response = await this.transport('/api/support/cases', { cache: 'no-store', credentials: 'same-origin',
        signal: bounded.signal });
      if (!current()) return;
      if (bounded.signal.aborted) throw new Error('case_request_stopped');
      if (response.status === 401 || response.status === 403) { this.clear('authentication_required'); return; }
      const body: unknown = await response.json();
      if (!current()) return;
      if (bounded.signal.aborted) throw new Error('case_request_stopped');
      const data = response.ok ? parseCustomerCaseRead(body) : null;
      if (verifyingCustomer && !data) { this.clear('unavailable'); return; }
      this.publish({ ...this.state, identity: 'customer', busy: false, cases: data, error: !data });
    } catch {
      if (current()) {
        if (verifyingCustomer) this.clear('unavailable');
        else this.publish({ ...this.state, busy: false, cases: null, error: true });
      }
    } finally { bounded.dispose(); }
  }

  async submitCase({ payload, generation, signal }: Readonly<{ payload: string; generation: number; signal: AbortSignal }>): Promise<CustomerCaseSubmissionResult> {
    const priorActor = this.actor, identityRequest = this.identityRequest, pendingRequest = this.submissionRequest;
    const sameView = () => !signal.aborted && priorActor !== null && this.actor === priorActor
      && generation === this.state.generation && this.state.identity === 'customer' && this.identityRequest === identityRequest;
    if (signal.aborted || !this.actor || this.state.identity !== 'customer' || !this.state.cases
      || generation !== this.state.generation) return { kind: 'inactive', canDisplay: () => sameView() && this.state.cases === null };
    if (this.submission?.kind === 'pending') return { kind: 'busy', canDisplay: () => sameView()
      && this.submission?.kind === 'pending' && this.submissionRequest === pendingRequest };
    const inactive = (): CustomerCaseSubmissionResult => ({ kind: 'inactive', canDisplay: () => false });
    const actor = this.actor, key = this.submission?.key ?? crypto.randomUUID();
    const controller = new AbortController(); this.submissionRequest = controller;
    const linked = caseRequestSignal([signal, controller.signal]), bounded = linked.signal;
    this.submission = { key, kind: 'pending' };
    // Request identity also matters: retries deliberately reuse the same nonce.
    const owns = () => this.actor === actor && this.state.generation === generation
      && this.submission?.key === key && this.submissionRequest === controller;
    const current = () => owns() && !bounded.aborted && this.state.identity === 'customer' && this.state.cases !== null;
    const stopListening = () => { bounded.removeEventListener('abort', markUnknown); linked.dispose(); };
    const markUnknown = () => {
      if (owns()) { this.submission = { key, kind: 'unknown' }; this.submissionRequest = null; }
      stopListening();
    };
    bounded.addEventListener('abort', markUnknown, { once: true });
    // The UI consumes the receipt synchronously after its await. Recheck the
    // actor/generation/nonce/request at that boundary too, before any UI update.
    const commit = (received: boolean) => () => {
      if (!current()) { markUnknown(); return false; }
      stopListening(); this.submissionRequest = null;
      this.submission = received ? null : { key, kind: 'unknown' };
      return true;
    };
    try {
      const response = await this.transport('/api/support/cases', { method: 'POST', cache: 'no-store', credentials: 'same-origin',
        signal: bounded, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: payload });
      if (!current()) { markUnknown(); return inactive(); }
      if (response.status === 401 || response.status === 403) {
        this.clear('authentication_required'); stopListening(); return inactive();
      }
      const body: unknown = await response.json();
      if (!current()) { markUnknown(); return inactive(); }
      const reference = record(body) ? parseCustomerCaseReference(body.reference) : null;
      if ((response.status === 200 || response.status === 201) && record(body) && Object.keys(body).length === 3
        && body.status === 'received' && body.externalDelivery === false && reference) {
        return { kind: 'saved', reference: reference.reference, commit: commit(true) };
      }
      // 409/400/429, malformed receipts and lost responses never prove that an
      // earlier unknown write did not commit. Only a valid receipt releases it.
      return { kind: 'error', code: submissionError(record(body) ? body.code : null), commit: commit(false) };
    } catch {
      if (!current()) { markUnknown(); return inactive(); }
      return { kind: 'error', code: 'CONTACT_DELIVERY_UNAVAILABLE', commit: commit(false) };
    }
  }
}
