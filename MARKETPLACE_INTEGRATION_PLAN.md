# Marketplace Integration Plan (DEV-020 Preparation)

## Goal
Prepare real marketplace connectivity through adapter-driven dependency injection without enabling live external integrations yet.

## Prepared Adapter Surface
Location: lib/marketplace/integration-interfaces.ts

Vertical adapters prepared:
- Hotels
- Flights
- Cars
- Activities
- Concierge
- Apartments

Each vertical implements:
- search(request)

Shared request model includes:
- destination
- checkIn/checkOut
- travelers
- budget
- language

## Dependency Injection Model
Factory:
- createMarketplaceIntegrationRegistry(overrides?)

Behavior:
- Uses default mock adapters for all verticals.
- Allows controlled runtime/CI injection of real providers later.

## Mock Strategy (Current)
- Deterministic in-memory responses.
- No network calls.
- Stable interfaces for UI/backend integration testing.

## Planned Live Integration Sequence
1. Hotels adapter with inventory and pricing contract.
2. Cars adapter with category, availability, and rate cards.
3. Apartments adapter with date-aware inventory and nightly pricing.
4. Activities adapter with slot availability and capacity.
5. Concierge adapter with service tiers and SLA windows.
6. Flights adapter with route inventory and fare families.

## Standardized Contracts to Preserve
- Input schema from lib/ai/types.ts (normalized search request).
- Output schema returning:
  - items
  - total
  - page
  - pageSize
  - consistent metadata for ranking/fallback tracing.

## Non-Goals in DEV-020 Foundation
- No live booking writes.
- No payment orchestration.
- No auth scope escalation.
- No database migration.

## Operational Guardrails
- Feature flags gate provider activation.
- Automatic fallback remains mandatory.
- UI contract remains stable regardless of provider source.

## Immediate DEV-021 Ready Tasks
- Replace mock adapter internals with provider clients one vertical at a time.
- Add adapter health probes and structured error telemetry.
- Introduce contract tests for each adapter against fixture datasets.
