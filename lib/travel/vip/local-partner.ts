import type { VipBooking, VipOffer, VipProvider, VipProviderStatus, VipQuote, VipSearchInput, VipSearchResult } from "../contracts";
import { assertVipLocalTestMode, validateVipPartnerConfig, VIP_SYNTHETIC_SOURCE, VIP_UNVERIFIED } from "./config";
import type { VipRepository } from "./repository";

type AdapterOptions = { now?: () => Date; simulatePriceChange?: boolean; simulateNoResponse?: boolean };
const PROVIDER = "vip-local-egypt";

function normalize(value: string) { return value.trim().toLocaleLowerCase("en"); }
function idPart(value: string) { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function assertSearchInput(input: VipSearchInput, now: Date) {
  if (!input.cityOrLocation?.trim() || !Number.isInteger(input.passengerCount) || input.passengerCount < 1) throw new Error("INVALID_VIP_REQUEST");
  const date = new Date(input.dateTime);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) throw new Error("INVALID_VIP_DATE");
  if (input.serviceType && input.serviceType !== "DIR3 VIP") throw new Error("UNSUPPORTED_VIP_SERVICE");
}

export class LocalEgyptVipPartnerAdapter implements VipProvider {
  private readonly offers = new Map<string, VipOffer>();
  private readonly now: () => Date;
  constructor(private readonly repository: VipRepository, private readonly options: AdapterOptions = {}) { this.now = options.now ?? (() => new Date()); }

  async searchVipServices(input: VipSearchInput): Promise<VipSearchResult> {
    const config = await this.repository.getConfig(); validateVipPartnerConfig(config); assertSearchInput(input, this.now());
    if (config.status !== "ACTIVE_TEST_ONLY") return { provider: PROVIDER, status: "blocked", offers: [] };
    const location = config.coverage.find((item) => normalize(item) === normalize(input.cityOrLocation));
    if (!location) return { provider: PROVIDER, status: "no_results", offers: [] };
    const date = new Date(input.dateTime); const leadTime = (date.getTime() - this.now().getTime()) / 3_600_000;
    if (leadTime < config.minimumLeadTimeHours) return { provider: PROVIDER, status: "no_results", offers: [] };
    const price = config.basePrice + input.passengerCount * config.perPassengerPrice;
    const id = `vip-offer-${idPart(location)}-${date.getTime()}-${input.passengerCount}`;
    const offer: VipOffer = {
      id, partnerId: config.partnerId, serviceType: "DIR3 VIP", cityOrLocation: location,
      airport: location.toLowerCase().includes("airport") ? location : undefined, dateTime: date.toISOString(),
      passengerCount: input.passengerCount, inclusions: ["TEST PLACEHOLDER: local VIP request coordination"],
      exclusions: ["TEST PLACEHOLDER: no unlisted service or payment included"], currency: "EGP", price: price.toFixed(2),
      taxAndFees: config.taxAndFees, cancellationTerms: config.cancellationPolicy,
      minimumLeadTimeHours: config.minimumLeadTimeHours, providerReference: `TEST-${id}`,
      availabilityStatus: "available", source: VIP_SYNTHETIC_SOURCE, verificationStatus: VIP_UNVERIFIED,
    };
    this.offers.set(id, structuredClone(offer));
    await this.repository.appendAudit({ event: "vip.search.offer_created", entityId: id, at: this.now().toISOString(), source: VIP_SYNTHETIC_SOURCE });
    return { provider: PROVIDER, status: "ok", offers: [offer] };
  }

  async getVipQuote(offerId: string): Promise<VipQuote> {
    const offer = this.offers.get(offerId); if (!offer) throw new Error("VIP_OFFER_UNAVAILABLE");
    const config = await this.repository.getConfig(); validateVipPartnerConfig(config);
    const quote: VipQuote = { ...structuredClone(offer), quoteId: `vip-quote-${offer.id}`, version: 1,
      expiresAt: new Date(this.now().getTime() + config.quoteValidityMinutes * 60_000).toISOString(), changed: false };
    await this.repository.saveQuote(quote);
    await this.repository.appendAudit({ event: "vip.quote.created", entityId: quote.quoteId, at: this.now().toISOString(), source: VIP_SYNTHETIC_SOURCE });
    return quote;
  }

  async revalidateVipQuote(quoteId: string): Promise<VipQuote> {
    const quote = await this.repository.getQuote(quoteId); if (!quote) throw new Error("VIP_QUOTE_NOT_FOUND");
    if (new Date(quote.expiresAt).getTime() <= this.now().getTime()) throw new Error("VIP_QUOTE_EXPIRED");
    const revalidated = this.options.simulatePriceChange
      ? { ...quote, price: (Number(quote.price) + 100).toFixed(2), version: quote.version + 1, changed: true }
      : { ...quote, changed: false };
    await this.repository.saveQuote(revalidated);
    await this.repository.appendAudit({ event: revalidated.changed ? "vip.quote.price_changed" : "vip.quote.revalidated", entityId: quoteId, at: this.now().toISOString(), source: VIP_SYNTHETIC_SOURCE });
    return revalidated;
  }

  async createVipBooking(input: { quoteId: string; customerMetadata: Record<string, string>; serviceMetadata?: Record<string, string>; idempotencyKey: string }): Promise<VipBooking> {
    assertVipLocalTestMode();
    if (!input.idempotencyKey?.trim()) throw new Error("VIP_IDEMPOTENCY_REQUIRED");
    const existing = await this.repository.getBookingByIdempotencyKey(input.idempotencyKey); if (existing) return existing;
    const quote = await this.repository.getQuote(input.quoteId); if (!quote) throw new Error("VIP_QUOTE_NOT_FOUND");
    if (new Date(quote.expiresAt).getTime() <= this.now().getTime()) throw new Error("VIP_QUOTE_EXPIRED");
    const config = await this.repository.getConfig(); if (config.status !== "ACTIVE_TEST_ONLY") throw new Error("VIP_PARTNER_INACTIVE");
    const createdAt = this.now().toISOString(); const suffix = idPart(input.idempotencyKey).slice(0, 24) || "request";
    const booking: VipBooking = {
      quoteId: quote.quoteId, bookingReference: `VIP-TEST-${suffix}`, customerMetadata: structuredClone(input.customerMetadata),
      serviceMetadata: structuredClone(input.serviceMetadata ?? {}), partnerReference: `LOCAL-QUEUE-${suffix}`,
      status: this.options.simulateNoResponse ? "no_response" : "pending_partner_review", createdAt, updatedAt: createdAt,
      idempotencyKey: input.idempotencyKey, source: VIP_SYNTHETIC_SOURCE, verificationStatus: VIP_UNVERIFIED,
    };
    await this.repository.saveBooking(booking);
    await this.repository.appendAudit({ event: "vip.booking.requested", entityId: booking.bookingReference, at: createdAt, source: VIP_SYNTHETIC_SOURCE });
    return booking;
  }

  async getVipBooking(reference: string) { const booking = await this.repository.getBooking(reference); if (!booking) throw new Error("VIP_BOOKING_NOT_FOUND"); return booking; }
  async confirmVipBooking(reference: string, confirmation: string) {
    assertVipLocalTestMode(); const booking = await this.getVipBooking(reference);
    if (!confirmation.trim() || booking.status !== "pending_partner_review") throw new Error("VIP_CONFIRMATION_FAILED");
    const updated = { ...booking, status: "confirmed" as const, confirmation, updatedAt: this.now().toISOString() };
    await this.repository.saveBooking(updated); await this.repository.appendAudit({ event: "vip.booking.confirmed", entityId: reference, at: updated.updatedAt, source: VIP_SYNTHETIC_SOURCE }); return updated;
  }
  async cancelVipBooking(reference: string, reason: string) {
    assertVipLocalTestMode(); const booking = await this.getVipBooking(reference); if (!reason.trim()) throw new Error("VIP_CANCELLATION_REASON_REQUIRED");
    if (booking.status === "cancelled") return booking;
    const updated = { ...booking, status: "cancelled" as const, cancellation: reason, updatedAt: this.now().toISOString() };
    await this.repository.saveBooking(updated); await this.repository.appendAudit({ event: "vip.booking.cancelled", entityId: reference, at: updated.updatedAt, source: VIP_SYNTHETIC_SOURCE }); return updated;
  }
  async getVipProviderStatus(): Promise<VipProviderStatus> {
    try { const config = await this.repository.getConfig(); validateVipPartnerConfig(config); return { provider: PROVIDER, status: config.status === "ACTIVE_TEST_ONLY" ? "ok" : "inactive", mode: "local_test", synthetic: config.source === VIP_SYNTHETIC_SOURCE }; }
    catch { return { provider: PROVIDER, status: "blocked", mode: "local_test", synthetic: true }; }
  }
}
