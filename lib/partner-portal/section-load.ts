export type PortalSection = 'profile' | 'docs' | 'products' | 'bookings' | 'settlements' | 'compliance';
export type SectionRead = { state: 'ready'; data: unknown } | { state: 'error' };

const endpoints: Record<PortalSection, string> = {
  profile: 'profile', docs: 'documents', products: 'products',
  bookings: 'bookings', settlements: 'settlements', compliance: 'compliance',
};

// A failed financial/documents read must neither become an empty success nor
// prevent independent operational sections from loading.
export async function readPortalSections(request: typeof fetch = fetch): Promise<Record<PortalSection, SectionRead>> {
  const entries = await Promise.all(Object.entries(endpoints).map(async ([section, endpoint]) => {
    try {
      const response = await request(`/api/partner-portal/${endpoint}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('SECTION_READ_FAILED');
      const payload = await response.json();
      const data = section === 'profile' ? payload?.data?.partner : payload?.data;
      const valid = section === 'profile' ? typeof data?.id === 'string' && data.id.length > 0
        : section === 'compliance' ? !!data && Array.isArray(data.requiredDocuments)
          && Array.isArray(data.missingDocuments) && Array.isArray(data.expiredDocuments)
          && typeof data.pendingReviews === 'number'
        : Array.isArray(data);
      if (!valid) throw new Error('SECTION_PAYLOAD_INVALID');
      return [section, { state: 'ready', data }] as const;
    } catch {
      return [section, { state: 'error' }] as const;
    }
  }));
  return Object.fromEntries(entries) as Record<PortalSection, SectionRead>;
}
