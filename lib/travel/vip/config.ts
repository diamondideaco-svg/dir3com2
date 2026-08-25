import type { VipPartnerConfig } from "../contracts";

export const VIP_SYNTHETIC_SOURCE = "synthetic_test_placeholder" as const;
export const VIP_UNVERIFIED = "UNVERIFIED" as const;
export const VIP_LOCAL_PARTNER_ID = "vip-egypt-local-test-001";
export const syntheticVipPartnerConfig: VipPartnerConfig = Object.freeze<VipPartnerConfig>({
  partnerId: VIP_LOCAL_PARTNER_ID, legalName: "UNVERIFIED Egypt VIP Test Partner",
  displayName: "Egypt VIP Local Partner — TEST DATA", country: "EG",
  coverage: ["Cairo", "Giza", "Alexandria", "Sharm El Sheikh", "Hurghada", "Cairo International Airport", "Sphinx International Airport"],
  serviceCategories: ["DIR3 VIP"], operatingHours: "TEST PLACEHOLDER: daily 09:00-18:00 Africa/Cairo",
  responseSlaMinutes: 120, bookingMethod: "partner_portal_confirmation",
  cancellationPolicy: "TEST PLACEHOLDER: cancellation request requires partner confirmation; no commercial terms approved.",
  amendmentPolicy: "TEST PLACEHOLDER: amendments return to partner review and require reconfirmation.",
  pricingModel: "fixed_test_fixture", basePrice: 1000, perPassengerPrice: 125, settlementModel: "TEST PLACEHOLDER: no settlement or payment execution.",
  currency: "EGP", taxAndFees: "TEST PLACEHOLDER: fixture price includes synthetic fees; tax treatment unverified.",
  minimumLeadTimeHours: 24, quoteValidityMinutes: 30,
  operationalContact: "Alaa (identity provided; business details unverified)",
  escalationContact: "INTERNAL_TEST_ESCALATION_ONLY", status: "ACTIVE_TEST_ONLY",
  source: VIP_SYNTHETIC_SOURCE, verificationStatus: VIP_UNVERIFIED,
});
export function assertVipLocalTestMode(): void {
  const environment = process.env.VIP_LOCAL_ENV?.trim().toLowerCase();
  const productionSignals = Boolean(process.env.VIP_LOCAL_PRODUCTION_ENABLED || Object.keys(process.env).some((key) => key.startsWith("NEXT_PUBLIC_") && key.includes("VIP_LOCAL")));
  if (environment !== "local_test" || productionSignals) throw new Error("VIP_LOCAL_TEST_MODE_REQUIRED");
}
export function validateVipPartnerConfig(config: VipPartnerConfig): void {
  if (!config.partnerId || !config.displayName || config.country !== "EG" || !config.coverage.length || config.serviceCategories.some((category) => category !== "DIR3 VIP") || !Number.isFinite(config.basePrice) || !Number.isFinite(config.perPassengerPrice)) throw new Error("MALFORMED_VIP_PARTNER_DATA");
  if (config.source === VIP_SYNTHETIC_SOURCE && config.verificationStatus !== VIP_UNVERIFIED) throw new Error("SYNTHETIC_DATA_MUST_BE_UNVERIFIED");
}
