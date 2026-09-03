import {
  isCustomerSafeMarketplaceTruth,
  marketplacePrimaryAction,
  type MarketplaceTruth,
} from '@/lib/marketplace/truth';

// Presentation personas, NOT values of profiles.role or authorization grants.
export const DABRA_FAMILY_PERSONAS = [
  'DABRA Concierge',
  'DABRA Partner',
  'DABRA Admin',
  'DABRA CEO',
  'DABRA Mall Center',
  'DABRA Customer Service',
  'DABRA Travel Agent',
] as const;

export type DabraFamilyPersona = (typeof DABRA_FAMILY_PERSONAS)[number];
/** @deprecated Presentation-only alias retained for existing consumers. */
export const DABRA_FAMILY_ROLES = DABRA_FAMILY_PERSONAS;
export type DabraFamilyRole = DabraFamilyPersona;
export type DabraPlatformRole = 'anonymous' | 'customer' | 'partner' | 'staff' | 'admin';
export type DabraActionClass =
  | 'READ_ONLY'
  | 'REVERSIBLE_DRAFT'
  | 'REQUIRES_HUMAN_APPROVAL'
  | 'PROHIBITED_AUTONOMOUS';

export const DABRA_ACTIONS = [
  'discover_marketplace',
  'ask_travel_question',
  'compare_marketplace_options',
  'plan_trip',
  'view_marketplace_result',
  'view_pdp',
  'view_trip_guardian',
  'view_customer_context',
  'view_partner_workspace',
  'view_admin_workspace',
  'view_executive_workspace',
  'save_trip_draft',
  'shortlist_option',
  'request_human_support',
  'submit_request_to_confirm',
  'open_provider_checkout',
  'create_booking',
  'make_payment',
  'cancel_booking',
  'request_refund',
  'irreversible_supplier_action',
  'override_marketplace_truth',
  'publish_unverified_inventory',
  'expose_cross_user_context',
  'use_sandbox_as_production',
  'reveal_secret',
] as const;

export type DabraAction = (typeof DABRA_ACTIONS)[number];
export type DabraResourceKind =
  | 'public_marketplace'
  | 'customer_context'
  | 'trip_plan'
  | 'marketplace_request'
  | 'booking'
  | 'provider_offer'
  | 'partner_workspace'
  | 'admin_workspace'
  | 'executive_workspace';

export type TrustedDabraActor = {
  authenticated: boolean;
  userId: string | null;
  tenantId: string | null;
  platformRole: DabraPlatformRole;
  rawRole: string | null;
  executive?: boolean;
};

export type TrustedDabraResource = {
  kind: DabraResourceKind;
  id?: string;
  ownerId?: string;
  tenantId?: string;
  truth?: MarketplaceTruth;
  verifiedActions?: DabraAction[];
};

export type DabraActionDecision = {
  action: DabraAction;
  actionClass: DabraActionClass;
  familyRole: DabraFamilyPersona | null;
  allowed: boolean;
  autonomousExecution: false;
  requiresHumanApproval: boolean;
  reason:
    | 'ALLOWED_READ_ONLY'
    | 'ALLOWED_REVERSIBLE_DRAFT'
    | 'HUMAN_APPROVAL_REQUIRED'
    | 'READY_FOR_CANONICAL_FLOW'
    | 'AUTHENTICATION_REQUIRED'
    | 'ROLE_NOT_ALLOWED'
    | 'RESOURCE_TYPE_MISMATCH'
    | 'RESOURCE_OWNERSHIP_MISMATCH'
    | 'MARKETPLACE_TRUTH_BLOCKED'
    | 'PROHIBITED_AUTONOMOUS';
  handoff: 'none' | 'marketplace' | 'request_to_confirm' | 'provider_checkout' | 'booking' | 'support';
  message: string;
};

type ActionRule = {
  actionClass: DabraActionClass;
  authenticated: boolean;
  roles?: DabraPlatformRole[];
  scopedResource?: boolean;
  resourceKinds?: DabraResourceKind[];
  marketplaceAction?: ReturnType<typeof marketplacePrimaryAction>;
  handoff: DabraActionDecision['handoff'];
};

const publicRoles: DabraPlatformRole[] = ['anonymous', 'customer', 'partner', 'staff', 'admin'];
const authenticatedRoles: DabraPlatformRole[] = ['customer', 'partner', 'staff', 'admin'];

export const DABRA_ACTION_RULES: Record<DabraAction, ActionRule> = {
  discover_marketplace: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'marketplace' },
  ask_travel_question: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'none' },
  compare_marketplace_options: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'marketplace' },
  plan_trip: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'marketplace' },
  view_marketplace_result: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'marketplace' },
  view_pdp: { actionClass: 'READ_ONLY', authenticated: false, roles: publicRoles, handoff: 'marketplace' },
  view_trip_guardian: { actionClass: 'READ_ONLY', authenticated: true, roles: authenticatedRoles, scopedResource: true, resourceKinds: ['trip_plan', 'booking', 'marketplace_request'], handoff: 'none' },
  view_customer_context: { actionClass: 'READ_ONLY', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['customer_context'], handoff: 'none' },
  view_partner_workspace: { actionClass: 'READ_ONLY', authenticated: true, roles: ['partner'], scopedResource: true, resourceKinds: ['partner_workspace'], handoff: 'none' },
  view_admin_workspace: { actionClass: 'READ_ONLY', authenticated: true, roles: ['admin'], handoff: 'none' },
  view_executive_workspace: { actionClass: 'READ_ONLY', authenticated: true, roles: ['admin'], handoff: 'none' },
  save_trip_draft: { actionClass: 'REVERSIBLE_DRAFT', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['trip_plan'], handoff: 'none' },
  shortlist_option: { actionClass: 'REVERSIBLE_DRAFT', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['public_marketplace'], handoff: 'marketplace' },
  request_human_support: { actionClass: 'REVERSIBLE_DRAFT', authenticated: false, roles: publicRoles, handoff: 'support' },
  submit_request_to_confirm: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['public_marketplace'], marketplaceAction: 'request_to_confirm', handoff: 'request_to_confirm' },
  open_provider_checkout: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['provider_offer'], marketplaceAction: 'continue_to_provider', handoff: 'provider_checkout' },
  create_booking: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['public_marketplace'], marketplaceAction: 'continue_to_booking', handoff: 'booking' },
  make_payment: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['booking'], handoff: 'booking' },
  cancel_booking: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['booking'], handoff: 'support' },
  request_refund: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['customer'], scopedResource: true, resourceKinds: ['booking'], handoff: 'support' },
  irreversible_supplier_action: { actionClass: 'REQUIRES_HUMAN_APPROVAL', authenticated: true, roles: ['partner', 'admin'], scopedResource: true, resourceKinds: ['partner_workspace'], handoff: 'support' },
  override_marketplace_truth: { actionClass: 'PROHIBITED_AUTONOMOUS', authenticated: false, handoff: 'support' },
  publish_unverified_inventory: { actionClass: 'PROHIBITED_AUTONOMOUS', authenticated: false, handoff: 'support' },
  expose_cross_user_context: { actionClass: 'PROHIBITED_AUTONOMOUS', authenticated: false, handoff: 'support' },
  use_sandbox_as_production: { actionClass: 'PROHIBITED_AUTONOMOUS', authenticated: false, handoff: 'support' },
  reveal_secret: { actionClass: 'PROHIBITED_AUTONOMOUS', authenticated: false, handoff: 'support' },
};

export function isDabraAction(value: unknown): value is DabraAction {
  return typeof value === 'string' && (DABRA_ACTIONS as readonly string[]).includes(value);
}

export function normalizeDabraActionRequest(value: unknown): {
  action: DabraAction;
  humanApproval: boolean;
  language: 'ar' | 'en';
  resourceType: DabraResourceKind | null;
  resourceId: string | null;
  provider: string | null;
  providerItemId: string | null;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isDabraAction(input.action)) return null;
  const resourceTypes: readonly DabraResourceKind[] = [
    'public_marketplace', 'customer_context', 'trip_plan', 'marketplace_request', 'booking',
    'provider_offer', 'partner_workspace', 'admin_workspace', 'executive_workspace',
  ];
  const resourceType = typeof input.resourceType === 'string' && resourceTypes.includes(input.resourceType as DabraResourceKind)
    ? input.resourceType as DabraResourceKind
    : null;
  const safeIdentifier = (candidate: unknown, maxLength = 160) => {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    return normalized && normalized.length <= maxLength && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
  };
  return {
    action: input.action,
    humanApproval: input.humanApproval === true,
    language: input.language === 'ar' ? 'ar' : 'en',
    resourceType,
    resourceId: safeIdentifier(input.resourceId),
    provider: safeIdentifier(input.provider, 40),
    providerItemId: safeIdentifier(input.providerItemId, 120),
  };
}

export function hasDabraExecutiveAccess(actor: TrustedDabraActor): boolean {
  // This flag is resolved only from the authenticated server-side CEO identity.
  // A display persona or caller-supplied role string can never grant authority.
  return actor.authenticated && !!actor.userId && actor.platformRole === 'admin' && actor.executive === true;
}

export function resolveDabraFamilyRole(actor: TrustedDabraActor): DabraFamilyPersona | null {
  if (!actor.authenticated || !actor.userId || actor.platformRole === 'anonymous') return null;
  if (hasDabraExecutiveAccess(actor)) return 'DABRA CEO';
  if (actor.platformRole === 'admin') return 'DABRA Admin';
  if (actor.platformRole === 'partner') return 'DABRA Partner';
  if (actor.platformRole === 'customer') return 'DABRA Concierge';
  // Specialist personas need a real server-resolved assignment before activation.
  return null;
}

function message(reason: DabraActionDecision['reason'], language: 'ar' | 'en') {
  const messages: Record<DabraActionDecision['reason'], { ar: string; en: string }> = {
    ALLOWED_READ_ONLY: { ar: 'أقدر أعرض المعلومات الموثقة بدون تنفيذ أي إجراء.', en: 'I can show verified information without executing an action.' },
    ALLOWED_REVERSIBLE_DRAFT: { ar: 'أقدر أجهز مسودة قابلة للمراجعة والتعديل.', en: 'I can prepare a reversible draft for review.' },
    HUMAN_APPROVAL_REQUIRED: { ar: 'أحتاج موافقتك الصريحة قبل المتابعة عبر المسار الرسمي.', en: 'Your explicit approval is required before continuing through the canonical flow.' },
    READY_FOR_CANONICAL_FLOW: { ar: 'تم التحقق من المتطلبات؛ المتابعة تكون عبر المسار الرسمي ولا تنفذها الدبرة تلقائيًا.', en: 'The requirements are verified; continue through the canonical flow. DABRA will not execute it automatically.' },
    AUTHENTICATION_REQUIRED: { ar: 'سجّل الدخول أولًا حتى نتحقق من الملكية بأمان.', en: 'Sign in first so ownership can be verified safely.' },
    ROLE_NOT_ALLOWED: { ar: 'هذا الإجراء غير متاح لهذا الدور.', en: 'This action is not available to this role.' },
    RESOURCE_TYPE_MISMATCH: { ar: 'نوع السجل لا يطابق هذا الإجراء، لذلك لن أتابع.', en: 'This resource type does not match the requested action, so it will not continue.' },
    RESOURCE_OWNERSHIP_MISMATCH: { ar: 'تعذر التحقق من ملكية هذا السجل، لذلك لن أعرضه أو أتابع الإجراء.', en: 'Ownership of this record could not be verified, so it will not be shown or acted on.' },
    MARKETPLACE_TRUTH_BLOCKED: { ar: 'حالة المزود أو التوفر أو مسار المعاملة لا تسمح بهذه الخطوة الآن.', en: 'The provider, availability, or transaction state does not allow this step.' },
    PROHIBITED_AUTONOMOUS: { ar: 'لا يمكن للدبرة تنفيذ هذا الإجراء ذاتيًا. سأنقلك إلى المسار البشري الآمن.', en: 'DABRA cannot perform this action autonomously. I will direct you to the safe human path.' },
  };
  return messages[reason][language];
}

function decision(
  actor: TrustedDabraActor,
  action: DabraAction,
  language: 'ar' | 'en',
  reason: DabraActionDecision['reason'],
  allowed: boolean,
): DabraActionDecision {
  const rule = DABRA_ACTION_RULES[action];
  return {
    action,
    actionClass: rule.actionClass,
    familyRole: resolveDabraFamilyRole(actor),
    allowed,
    autonomousExecution: false,
    requiresHumanApproval: rule.actionClass === 'REQUIRES_HUMAN_APPROVAL',
    reason,
    handoff: rule.handoff,
    message: message(reason, language),
  };
}

export function evaluateDabraAction(input: {
  actor: TrustedDabraActor;
  action: DabraAction;
  resource?: TrustedDabraResource;
  humanApproval?: boolean;
  language?: 'ar' | 'en';
}): DabraActionDecision {
  const { actor, action, resource, humanApproval = false, language = 'en' } = input;
  const rule = DABRA_ACTION_RULES[action];

  if (rule.actionClass === 'PROHIBITED_AUTONOMOUS') {
    return decision(actor, action, language, 'PROHIBITED_AUTONOMOUS', false);
  }
  if (rule.authenticated && (!actor.authenticated || !actor.userId)) {
    return decision(actor, action, language, 'AUTHENTICATION_REQUIRED', false);
  }
  if (rule.roles && !rule.roles.includes(actor.platformRole)) {
    return decision(actor, action, language, 'ROLE_NOT_ALLOWED', false);
  }
  if (action === 'view_executive_workspace' && !hasDabraExecutiveAccess(actor)) {
    return decision(actor, action, language, 'ROLE_NOT_ALLOWED', false);
  }
  if (rule.scopedResource) {
    if (!resource || (rule.resourceKinds && !rule.resourceKinds.includes(resource.kind))) {
      return decision(actor, action, language, 'RESOURCE_TYPE_MISMATCH', false);
    }
    if (!resource?.ownerId || resource.ownerId !== actor.userId) {
      return decision(actor, action, language, 'RESOURCE_OWNERSHIP_MISMATCH', false);
    }
    if (resource.tenantId && (!actor.tenantId || resource.tenantId !== actor.tenantId)) {
      return decision(actor, action, language, 'RESOURCE_OWNERSHIP_MISMATCH', false);
    }
  }
  if (rule.marketplaceAction) {
    const truth = resource?.truth;
    if (!truth || !isCustomerSafeMarketplaceTruth(truth) || marketplacePrimaryAction(truth) !== rule.marketplaceAction) {
      return decision(actor, action, language, 'MARKETPLACE_TRUTH_BLOCKED', false);
    }
  }
  if (rule.actionClass === 'REQUIRES_HUMAN_APPROVAL') {
    if (!humanApproval) {
      return decision(actor, action, language, 'HUMAN_APPROVAL_REQUIRED', false);
    }
    if (
      ['make_payment', 'cancel_booking', 'request_refund', 'irreversible_supplier_action'].includes(action)
      && !resource?.verifiedActions?.includes(action)
    ) {
      return decision(actor, action, language, 'MARKETPLACE_TRUTH_BLOCKED', false);
    }
    return decision(actor, action, language, 'READY_FOR_CANONICAL_FLOW', true);
  }
  return decision(actor, action, language, rule.actionClass === 'READ_ONLY' ? 'ALLOWED_READ_ONLY' : 'ALLOWED_REVERSIBLE_DRAFT', true);
}
