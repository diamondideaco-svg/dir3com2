import type { MarketplaceAdapterSearchRequest, MarketplaceAdapterSearchResult, MarketplaceVerticalAdapter } from '@/lib/ai/types';

type VerticalMockBuilder = (request: MarketplaceAdapterSearchRequest) => MarketplaceAdapterSearchResult;

function createMockAdapter(vertical: MarketplaceVerticalAdapter['vertical'], build: VerticalMockBuilder): MarketplaceVerticalAdapter {
  return {
    vertical,
    async search(request) {
      return build(request);
    },
  };
}

function baseMockResult(
  vertical: MarketplaceVerticalAdapter['vertical'],
  request: MarketplaceAdapterSearchRequest,
  items: Array<Record<string, unknown>>
): MarketplaceAdapterSearchResult {
  return {
    vertical,
    items,
    total: items.length,
    page: 1,
    pageSize: Math.max(1, items.length),
  };
}

export const hotelsAdapter = createMockAdapter('hotels', (request) =>
  baseMockResult('hotels', request, [
    { id: 'hotel-mock-1', name: 'Hotel Mock Riyadh', destination: request.destination },
    { id: 'hotel-mock-2', name: 'Hotel Mock Cairo', destination: request.destination },
  ])
);

export const flightsAdapter = createMockAdapter('flights', (request) =>
  baseMockResult('flights', request, [
    { id: 'flight-mock-1', route: `${request.destination} outbound`, travelers: request.travelers },
  ])
);

export const carsAdapter = createMockAdapter('cars', (request) =>
  baseMockResult('cars', request, [{ id: 'car-mock-1', category: 'Executive', destination: request.destination }])
);

export const activitiesAdapter = createMockAdapter('activities', (request) =>
  baseMockResult('activities', request, [{ id: 'activity-mock-1', title: 'City Cultural Tour', destination: request.destination }])
);

export const conciergeAdapter = createMockAdapter('concierge', (request) =>
  baseMockResult('concierge', request, [{ id: 'concierge-mock-1', tier: 'VIP', language: request.language }])
);

export const apartmentsAdapter = createMockAdapter('apartments', (request) =>
  baseMockResult('apartments', request, [{ id: 'apartment-mock-1', nights: [request.checkIn, request.checkOut].filter(Boolean).join(' - ') }])
);

export type MarketplaceIntegrationRegistry = {
  hotels: MarketplaceVerticalAdapter;
  flights: MarketplaceVerticalAdapter;
  cars: MarketplaceVerticalAdapter;
  activities: MarketplaceVerticalAdapter;
  concierge: MarketplaceVerticalAdapter;
  apartments: MarketplaceVerticalAdapter;
};

export function createMarketplaceIntegrationRegistry(
  overrides: Partial<MarketplaceIntegrationRegistry> = {}
): MarketplaceIntegrationRegistry {
  return {
    hotels: overrides.hotels ?? hotelsAdapter,
    flights: overrides.flights ?? flightsAdapter,
    cars: overrides.cars ?? carsAdapter,
    activities: overrides.activities ?? activitiesAdapter,
    concierge: overrides.concierge ?? conciergeAdapter,
    apartments: overrides.apartments ?? apartmentsAdapter,
  };
}
