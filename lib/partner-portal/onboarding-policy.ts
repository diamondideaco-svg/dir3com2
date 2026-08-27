import type { PortalOwnerKind, ProductWorkflowStatus } from '@/lib/partner-portal/onboarding-types';

export function ownerFromDomain(domain: 'partner' | 'service_provider' | 'supplier' | null): PortalOwnerKind {
  if (domain === 'supplier' || domain === 'service_provider') return 'stay_supplier';
  return 'drive_partner';
}

export function transitionProductStatus(input: { current: ProductWorkflowStatus; submit: boolean; validationFailed: boolean }): ProductWorkflowStatus {
  if (input.validationFailed) return 'validation_failed';
  if (input.submit) return 'pending_review';
  if (input.current === 'published' || input.current === 'approved') return input.current;
  return 'needs_confirmation';
}
