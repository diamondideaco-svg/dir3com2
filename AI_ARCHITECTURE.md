# AI Search Architecture (DEV-020 Foundation)

## Objective
Establish a provider-agnostic AI search foundation for marketplace discovery without changing authentication, OAuth, database schema, or existing UI behavior.

## Architecture Layers

### 1) Search Request Normalization
Location: lib/ai/types.ts

All incoming search traffic is normalized to a single schema:
- destination
- serviceType
- dates (checkIn/checkOut)
- travelers
- budget
- language
- userIntent

Additional operational fields are supported for compatibility:
- family
- collection
- sort
- availability
- page
- pageSize
- query

### 2) Provider Configuration + Feature Flags
Location: lib/ai/config.ts

Controls:
- AI_SEARCH_ENABLED
- NEXT_PUBLIC_AI_SEARCH_ENABLED
- AI_SEARCH_PROVIDER
- AI_SEARCH_OPENAI_ENABLED
- AI_SEARCH_ANTHROPIC_ENABLED
- AI_SEARCH_GEMINI_ENABLED
- AI_SEARCH_AZURE_OPENAI_ENABLED

Provider credentials:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GOOGLE_GEMINI_API_KEY
- AZURE_OPENAI_API_KEY

### 3) Provider Adapter Abstraction
Location: lib/ai/providers/

Adapters implemented:
- OpenAI
- Anthropic Claude
- Google Gemini
- Azure OpenAI
- Local fallback

Each adapter implements a common interface:
- isEnabled(config)
- search(context)

Current behavior:
- No live external API calls.
- Provider adapters return deterministic mock-ranked responses.
- Local adapter is always available.

### 4) Orchestration Layer
Location: lib/ai/orchestrator.ts

Responsibilities:
- Select provider based on feature flags + key presence.
- Run normalized request through chosen adapter.
- Fallback automatically to local deterministic search if:
  - AI disabled
  - provider unavailable
  - key missing
  - adapter returns no result
- Normalize all outputs to one MarketplaceSearchResult model.

### 5) API Boundary
Location: app/api/search/marketplace/route.ts

Server route behavior:
- Accept normalized search payload.
- Fetch marketplace snapshot via existing server layer.
- Execute orchestration.
- Return unified payload: services + meta + search diagnostics.

### 6) UI Integration
Location: components/public/useMarketplaceServices.ts

Behavior:
- If NEXT_PUBLIC_AI_SEARCH_ENABLED=true, UI calls AI orchestration route.
- If AI route fails, hook automatically falls back to current /api/services search.
- If AI is disabled, existing /api/services flow remains unchanged.

## Response Normalization
Unified model returned to UI:
- services: MarketplaceService[]
- meta:
  - source
  - hasRealData
  - total/page/pageSize/totalPages
  - generatedAt
  - facets (categories + collections)
  - search { provider, usedAI, fallbackReason }

## Security + Scope Guarantees
- No OAuth/authentication changes.
- No Supabase auth flow changes.
- No DB migrations.
- No live provider calls in this phase.

## Runtime Modes
- AI Disabled Mode: existing search path.
- AI Enabled + Key Missing: local deterministic fallback via orchestrator.
- AI Enabled + Key Present: provider mock adapters active (live calls deferred).

## Next Integration Step
Replace mock provider logic with real SDK calls while preserving the same interfaces and output contracts.
