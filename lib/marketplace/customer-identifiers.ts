// Presentation only. Internal naming is never evidence of synthetic inventory.
const legacyMarker = /(?:^|[-\s])(?:phase[-\s]?\d+|phase\s*zero|seed(?:ed|ing)?)(?:[-\s]|$)/i;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const productId = new RegExp(`^${uuid}$`, 'i');
const productAlias = new RegExp(`^service-(${uuid})$`, 'i');

export function hasLegacyCustomerIdentifier(value: unknown): boolean {
  return typeof value === 'string' && legacyMarker.test(value);
}

export function customerProductSlug(id: unknown, slug: string): string {
  return hasLegacyCustomerIdentifier(slug) && typeof id === 'string' && productId.test(id)
    ? `service-${id.toLowerCase()}`
    : slug;
}

export function customerProductAliasId(slug: string): string | null {
  return productAlias.exec(slug)?.[1]?.toLowerCase() ?? null;
}
