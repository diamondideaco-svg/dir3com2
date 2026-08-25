import type { VipBooking, VipPartnerConfig, VipQuote } from "../contracts";
export type VipAuditEvent = { event: string; entityId: string; at: string; source: "synthetic_test_placeholder" };
export interface VipRepository {
  getConfig(): Promise<VipPartnerConfig>; saveConfig(config: VipPartnerConfig): Promise<void>;
  getQuote(id: string): Promise<VipQuote | undefined>; saveQuote(quote: VipQuote): Promise<void>;
  getBooking(reference: string): Promise<VipBooking | undefined>; getBookingByIdempotencyKey(key: string): Promise<VipBooking | undefined>;
  saveBooking(booking: VipBooking): Promise<void>; appendAudit(event: VipAuditEvent): Promise<void>; getAuditTrail(): readonly VipAuditEvent[];
}
export class InMemoryVipRepository implements VipRepository {
  private config: VipPartnerConfig; private readonly quotes = new Map<string, VipQuote>();
  private readonly bookings = new Map<string, VipBooking>(); private readonly idempotency = new Map<string, string>();
  private readonly audit: VipAuditEvent[] = [];
  constructor(config: VipPartnerConfig) { this.config = structuredClone(config); }
  async getConfig() { return structuredClone(this.config); }
  async saveConfig(config: VipPartnerConfig) { this.config = structuredClone(config); }
  async getQuote(id: string) { const value = this.quotes.get(id); return value && structuredClone(value); }
  async saveQuote(quote: VipQuote) { this.quotes.set(quote.quoteId, structuredClone(quote)); }
  async getBooking(reference: string) { const value = this.bookings.get(reference); return value && structuredClone(value); }
  async getBookingByIdempotencyKey(key: string) { const reference = this.idempotency.get(key); return reference ? this.getBooking(reference) : undefined; }
  async saveBooking(booking: VipBooking) { this.bookings.set(booking.bookingReference, structuredClone(booking)); this.idempotency.set(booking.idempotencyKey, booking.bookingReference); }
  async appendAudit(event: VipAuditEvent) { this.audit.push(structuredClone(event)); }
  getAuditTrail() { return structuredClone(this.audit); }
}
