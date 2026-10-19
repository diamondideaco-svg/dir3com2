import { ContinuityContext } from './continuity-context';
import type { ContinuitySnapshot } from './continuity-service';
import type { ContinuityPreferences } from './continuity-contract';
import type { DabraPersistenceContext } from './travel-commerce-state';

export type ConversationMessage = { id: string; role: 'user' | 'assistant'; text: string };
type Update<T> = T | ((current: T) => T);
export type ConversationJob = { readonly id: string; readonly generation: number; readonly signal: AbortSignal };
export type ConversationState = {
  generation: number; boundary: string; ready: boolean; persistence: DabraPersistenceContext | null;
  messages: ConversationMessage[]; draft: string; pending: boolean; error: string | null;
  preferences: ContinuityPreferences | null; continuityDraft: string | null;
};

// One instance per mounted root, never a server/process singleton or a storage-backed conversation.
// View unmounts only unsubscribe; identity changes own cancellation and private-state disposal.
export class ConversationSession {
  readonly context = new ContinuityContext();
  continuitySnapshot: ContinuitySnapshot | null = null;
  continuityCurrency: { before: ContinuityPreferences['displayCurrency']; applied: ContinuityPreferences['displayCurrency'] } | null = null;
  privateConversation = false;
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private active: ConversationJob | null = null;
  private state: ConversationState = { generation: 0, boundary: '', ready: false, persistence: null,
    messages: [], draft: '', pending: false, error: null, preferences: null, continuityDraft: null };
  readonly emptySnapshot = this.state;
  setContinuitySnapshot(snapshot: ContinuitySnapshot | null) { this.continuitySnapshot = snapshot; }
  setContinuityCurrency(value: typeof this.continuityCurrency) { this.continuityCurrency = value; }
  private currencyRestorer: ((applied: NonNullable<ConversationSession['continuityCurrency']>) => void) | null = null;
  setCurrencyRestorer(restore: typeof this.currencyRestorer) { this.currencyRestorer = restore; }
  restoreContinuityCurrency() {
    const applied = this.continuityCurrency; this.continuityCurrency = null;
    if (applied) this.currencyRestorer?.(applied);
  }
  markPrivate() { this.privateConversation = true; }
  // Private text remains in this actor's live history, but never enters browser storage.
  cachedMessages(messages: ConversationMessage[]) { return this.privateConversation ? [] : this.context.cachedMessages(messages); }
  getSnapshot = () => this.state;
  getServerSnapshot = () => this.emptySnapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<ConversationState>) {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  invalidate(boundary: string) {
    if (this.active) this.context.finishAnswer(`assistant-${this.active.id}`);
    this.controller?.abort(); this.controller = null; this.active = null;
    this.context.clear([]); this.continuitySnapshot = null; this.continuityCurrency = null; this.privateConversation = false;
    this.publish({ generation: this.state.generation + 1, boundary, ready: false, persistence: null,
      messages: [], draft: '', pending: false, error: null, preferences: null, continuityDraft: null });
    return this.state.generation;
  }
  resolve(generation: number, persistence: DabraPersistenceContext | null) {
    if (generation !== this.state.generation) return;
    this.publish({ persistence, ready: persistence !== null });
  }
  setMessages = (update: Update<ConversationMessage[]>) => {
    this.publish({ messages: typeof update === 'function' ? update(this.state.messages) : update });
  };
  setMessagesFor(generation: number, update: Update<ConversationMessage[]>) {
    if (this.state.ready && generation === this.state.generation) this.setMessages(update);
  }
  setDraftFor(generation: number, update: Update<string>) {
    if (this.state.ready && generation === this.state.generation) this.setDraft(update);
  }
  hydrateMessages(messages: ConversationMessage[]) {
    if (this.state.ready && this.state.messages.length === 0 && !this.state.pending) this.setMessages(messages);
  }
  setDraft = (update: Update<string>) => { this.publish({ draft: typeof update === 'function' ? update(this.state.draft) : update }); };
  setError = (error: string | null) => { this.publish({ error }); };
  setPreferences = (preferences: ContinuityPreferences | null) => { this.publish({ preferences }); };
  setContinuityDraft = (continuityDraft: string | null) => { this.context.draft = continuityDraft; this.publish({ continuityDraft }); };
  begin(): ConversationJob | null {
    if (!this.state.ready || this.active) return null;
    const controller = new AbortController();
    const job = { id: crypto.randomUUID(), generation: this.state.generation, signal: controller.signal };
    this.controller = controller; this.active = job;
    this.publish({ pending: true, error: null });
    return job;
  }
  isCurrent(job: ConversationJob) { return this.active === job && !job.signal.aborted && job.generation === this.state.generation; }
  update(job: ConversationJob, update: Update<ConversationMessage[]>) {
    if (this.isCurrent(job)) this.setMessages(update);
  }
  fail(job: ConversationJob, error: string) { if (this.isCurrent(job)) this.setError(error); }
  finish(job: ConversationJob) {
    if (!this.isCurrent(job)) return;
    this.active = null; this.controller = null; this.publish({ pending: false });
  }
  cancel() {
    const job = this.active;
    this.controller?.abort(); this.controller = null; this.active = null;
    if (job) this.context.finishAnswer(`assistant-${job.id}`);
    this.publish({ pending: false, messages: job ? this.state.messages.filter(m => m.id !== `assistant-${job.id}`) : this.state.messages });
  }
  forgetContext(keepJob?: ConversationJob) {
    this.restoreContinuityCurrency();
    if (!keepJob || !this.isCurrent(keepJob)) this.cancel();
    const independent = this.context.forget();
    this.publish({ messages: independent(this.state.messages), preferences: null, continuityDraft: null });
  }
}
