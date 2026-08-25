export type KnowledgeAuthorityStatus = 'CURRENT_CANONICAL' | 'CANONICAL_V2' | 'REAL_VERIFIED' | 'PARTNER_VERIFIED' | 'PROVIDER_SANDBOX' | 'SYNTHETIC_TEST' | 'PLACEHOLDER' | 'REFERENCE_ONLY' | 'LEGACY' | 'UNKNOWN' | 'CONFLICTING_OBSOLETE';
export type OrchestrationKnowledgeSource = { id: string; status: KnowledgeAuthorityStatus; canonical: boolean; safeForFutureIndexing: boolean; citation: string };

const ALLOWED = new Set<KnowledgeAuthorityStatus>(['CURRENT_CANONICAL', 'CANONICAL_V2', 'REAL_VERIFIED', 'PARTNER_VERIFIED', 'PROVIDER_SANDBOX']);
export function allowKnowledgeSource(source: OrchestrationKnowledgeSource): boolean {
  return source.canonical && source.safeForFutureIndexing && ALLOWED.has(source.status);
}
export function filterKnowledgeSources(sources: OrchestrationKnowledgeSource[]): OrchestrationKnowledgeSource[] {
  return sources.filter(allowKnowledgeSource);
}
