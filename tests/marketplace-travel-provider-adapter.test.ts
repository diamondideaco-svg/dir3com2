import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapFlightOffers,
  mapHotelOffers,
  mapCarTrawlerQuotes,
  mapViatorActivities,
  mapVIPServices,
  isPublicSafeMode,
  isLocalPreviewMode,
  type DataSourceMode,
} from '@/lib/marketplace/travel-provider-adapter';
import type { FlightSearchResult, StaySearchResult } from '@/lib/travel/contracts';

// ============================================
// Test data
// ============================================

const mockFlightResult: FlightSearchResult = {
  provider: 'duffel',
  status: 'ok',
  offers: [
    {
      id: 'offer-1',
      provider: 'duffel',
      origin: 'RUH',
      destination: 'CAI',
      departureDate: '2026-09-10T08:00:00Z',
      expiresAt: '2026-08-26T12:00:00Z',
      currency: 'SAR',
      totalAmount: '1200',
      slices: [
        {
          origin: 'RUH',
          destination: 'CAI',
          departureAt: '2026-09-10T08:00:00Z',
          arrivalAt: '2026-09-10T11:30:00Z',
          segments: 1,
        },
      ],
    },
  ],
};

const mockHotelResult: StaySearchResult = {
  provider: 'liteapi',
  status: 'ok',
  hotels: [
    {
      id: 'hotel-1',
      provider: 'liteapi',
      name: 'Cairo Luxury Hotel',
      address: 'Downtown Cairo, Egypt',
      rating: 5,
      imageUrl: 'https://example.com/hotel-1.jpg',
      rooms: [
        {
          id: 'room-1',
          name: 'Deluxe Room',
          rates: [
            {
              id: 'rate-1',
              provider: 'liteapi',
              roomId: 'room-1',
              roomName: 'Deluxe Room',
              boardName: 'Room Only',
              currency: 'SAR',
              totalAmount: '1800',
              refundable: true,
              cancellationDeadline: '2026-09-09T00:00:00Z',
            },
          ],
        },
      ],
    },
  ],
};

// ============================================
// FLY/Duffel Tests
// ============================================

test('FLY: maps Duffel offers to marketplace cards in PROVIDER_LIVE mode', () => {
  const cards = mapFlightOffers(mockFlightResult, {
    mode: 'PROVIDER_LIVE',
    language: 'en',
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].serviceType, 'fly');
  assert.equal(cards[0].title, 'RUH → CAI');
  assert.equal(cards[0].totalPrice, 1200);
  assert.equal(cards[0].currency, 'SAR');
  assert.equal(cards[0].provider, 'duffel');
  assert.equal(cards[0].capabilityStatus, 'available');
  assert.equal(cards[0].verified, false); // PROVIDER_LIVE is not PARTNER_VERIFIED
  assert.equal(cards[0].providerSandbox, false);
  assert.equal(cards[0].synthetic, false);
});

test('FLY: marks cards as verified in PARTNER_VERIFIED mode', () => {
  const cards = mapFlightOffers(mockFlightResult, {
    mode: 'PARTNER_VERIFIED',
    language: 'en',
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].verified, true);
});

test('FLY: rejects PROVIDER_SANDBOX flights from public rendering', () => {
  const cards = mapFlightOffers(mockFlightResult, {
    mode: 'PROVIDER_SANDBOX',
    language: 'en',
  });

  assert.equal(cards.length, 0);
});

test('FLY: rejects SYNTHETIC_TEST flights from public rendering', () => {
  const cards = mapFlightOffers(mockFlightResult, {
    mode: 'SYNTHETIC_TEST',
    language: 'en',
  });

  assert.equal(cards.length, 0);
});

test('FLY: rejects FALLBACK flights', () => {
  const cards = mapFlightOffers(mockFlightResult, {
    mode: 'FALLBACK',
    language: 'en',
  });

  assert.equal(cards.length, 0);
});

test('FLY: returns empty array for unavailable results', () => {
  const result: FlightSearchResult = {
    provider: 'duffel',
    status: 'unavailable',
    offers: [],
  };

  const cards = mapFlightOffers(result, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

test('FLY: returns empty array for blocked results', () => {
  const result: FlightSearchResult = {
    provider: 'duffel',
    status: 'blocked',
    offers: [],
  };

  const cards = mapFlightOffers(result, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

// ============================================
// STAY/LiteAPI Tests
// ============================================

test('STAY: maps LiteAPI hotels to marketplace cards in PROVIDER_LIVE mode', () => {
  const cards = mapHotelOffers(mockHotelResult, {
    mode: 'PROVIDER_LIVE',
    language: 'en',
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].serviceType, 'stay');
  assert.equal(cards[0].title, 'Cairo Luxury Hotel');
  assert.equal(cards[0].subtitle, 'Deluxe Room');
  assert.equal(cards[0].totalPrice, 1800);
  assert.equal(cards[0].currency, 'SAR');
  assert.equal(cards[0].rating, 5);
  assert.equal(cards[0].provider, 'liteapi');
  assert.equal(cards[0].image, 'https://example.com/hotel-1.jpg');
});

test('STAY: uses provider image when available', () => {
  const cards = mapHotelOffers(mockHotelResult, {
    mode: 'PROVIDER_LIVE',
  });

  assert.equal(cards[0].image, 'https://example.com/hotel-1.jpg');
  assert.equal(cards[0].imageSource, 'PROVIDER');
});

test('STAY: falls back to DIR3COM_FALLBACK when provider has no image', () => {
  const result: StaySearchResult = {
    provider: 'liteapi',
    status: 'ok',
    hotels: [
      {
        ...mockHotelResult.hotels[0],
        imageUrl: null,
      },
    ],
  };

  const cards = mapHotelOffers(result, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].image, '/brand/runtime/1000467134.png');
  assert.equal(cards[0].imageSource, 'DIR3COM_FALLBACK');
});

test('STAY: rejects PROVIDER_SANDBOX hotels from public rendering', () => {
  const cards = mapHotelOffers(mockHotelResult, {
    mode: 'PROVIDER_SANDBOX',
  });

  assert.equal(cards.length, 0);
});

test('STAY: rejects SYNTHETIC_TEST hotels from public rendering', () => {
  const cards = mapHotelOffers(mockHotelResult, {
    mode: 'SYNTHETIC_TEST',
  });

  assert.equal(cards.length, 0);
});

test('STAY: returns empty for unavailable hotel search', () => {
  const result: StaySearchResult = {
    provider: 'liteapi',
    status: 'unavailable',
    hotels: [],
  };

  const cards = mapHotelOffers(result, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

// ============================================
// DRIVE/CarTrawler Tests
// ============================================

test('DRIVE: always returns empty (vendor-blocked)', () => {
  const cards = mapCarTrawlerQuotes({}, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

test('DRIVE: fails-closed even if mode is PARTNER_VERIFIED', () => {
  const cards = mapCarTrawlerQuotes({}, { mode: 'PARTNER_VERIFIED' });
  assert.equal(cards.length, 0);
});

test('DRIVE: fails-closed for PROVIDER_SANDBOX', () => {
  const cards = mapCarTrawlerQuotes({}, { mode: 'PROVIDER_SANDBOX' });
  assert.equal(cards.length, 0);
});

// ============================================
// CONCIERGE/Viator Tests
// ============================================

test('CONCIERGE: always returns empty (entitlement-blocked)', () => {
  const cards = mapViatorActivities({}, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

test('CONCIERGE: fails-closed for all modes', () => {
  const modes: DataSourceMode[] = [
    'PROVIDER_LIVE',
    'PROVIDER_SANDBOX',
    'PARTNER_VERIFIED',
    'SYNTHETIC_TEST',
    'FALLBACK',
  ];

  for (const mode of modes) {
    const cards = mapViatorActivities({}, { mode });
    assert.equal(
      cards.length,
      0,
      `Expected 0 cards for CONCIERGE with mode ${mode}`,
    );
  }
});

// ============================================
// VIP Tests
// ============================================

test('VIP: always returns empty (synthetic test-only)', () => {
  const cards = mapVIPServices({}, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 0);
});

test('VIP: fails-closed even in SYNTHETIC_TEST mode', () => {
  const cards = mapVIPServices({}, { mode: 'SYNTHETIC_TEST' });
  assert.equal(cards.length, 0);
});

// ============================================
// Mode Selector Tests
// ============================================

test('isPublicSafeMode: true for PROVIDER_LIVE', () => {
  assert.equal(isPublicSafeMode('PROVIDER_LIVE'), true);
});

test('isPublicSafeMode: true for PARTNER_VERIFIED', () => {
  assert.equal(isPublicSafeMode('PARTNER_VERIFIED'), true);
});

test('isPublicSafeMode: false for PROVIDER_SANDBOX', () => {
  assert.equal(isPublicSafeMode('PROVIDER_SANDBOX'), false);
});

test('isPublicSafeMode: false for SYNTHETIC_TEST', () => {
  assert.equal(isPublicSafeMode('SYNTHETIC_TEST'), false);
});

test('isPublicSafeMode: false for FALLBACK', () => {
  assert.equal(isPublicSafeMode('FALLBACK'), false);
});

test('isLocalPreviewMode: true for PROVIDER_LIVE', () => {
  assert.equal(isLocalPreviewMode('PROVIDER_LIVE'), true);
});

test('isLocalPreviewMode: true for PROVIDER_SANDBOX', () => {
  assert.equal(isLocalPreviewMode('PROVIDER_SANDBOX'), true);
});

test('isLocalPreviewMode: true for PARTNER_VERIFIED', () => {
  assert.equal(isLocalPreviewMode('PARTNER_VERIFIED'), true);
});

test('isLocalPreviewMode: false for SYNTHETIC_TEST', () => {
  assert.equal(isLocalPreviewMode('SYNTHETIC_TEST'), false);
});

test('isLocalPreviewMode: false for FALLBACK', () => {
  assert.equal(isLocalPreviewMode('FALLBACK'), false);
});

// ============================================
// Multiple Offers Test
// ============================================

test('FLY: maps multiple offers correctly', () => {
  const multiResult: FlightSearchResult = {
    provider: 'duffel',
    status: 'ok',
    offers: [
      mockFlightResult.offers[0],
      {
        id: 'offer-2',
        provider: 'duffel',
        origin: 'RUH',
        destination: 'CAI',
        departureDate: '2026-09-10T14:00:00Z',
        expiresAt: '2026-08-26T12:00:00Z',
        currency: 'SAR',
        totalAmount: '950',
        slices: [
          {
            origin: 'RUH',
            destination: 'CAI',
            departureAt: '2026-09-10T14:00:00Z',
            arrivalAt: '2026-09-10T17:30:00Z',
            segments: 1,
          },
        ],
      },
    ],
  };

  const cards = mapFlightOffers(multiResult, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].totalPrice, 1200);
  assert.equal(cards[1].totalPrice, 950);
});

test('STAY: maps multiple hotels correctly', () => {
  const multiResult: StaySearchResult = {
    provider: 'liteapi',
    status: 'ok',
    hotels: [
      mockHotelResult.hotels[0],
      {
        id: 'hotel-2',
        provider: 'liteapi',
        name: 'Cairo Budget Hotel',
        address: 'Giza, Cairo',
        rating: 3,
        imageUrl: 'https://example.com/hotel-2.jpg',
        rooms: [
          {
            id: 'room-2',
            name: 'Standard Room',
            rates: [
              {
                id: 'rate-2',
                provider: 'liteapi',
                roomId: 'room-2',
                roomName: 'Standard Room',
                boardName: 'Breakfast Included',
                currency: 'SAR',
                totalAmount: '600',
                refundable: false,
              },
            ],
          },
        ],
      },
    ],
  };

  const cards = mapHotelOffers(multiResult, { mode: 'PROVIDER_LIVE' });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].totalPrice, 1800);
  assert.equal(cards[1].totalPrice, 600);
  assert.equal(cards[0].title, 'Cairo Luxury Hotel');
  assert.equal(cards[1].title, 'Cairo Budget Hotel');
});

// ============================================
// Blocked Vendor Public Leakage Test
// ============================================

test('BLOCKED VENDORS: no public leakage of CarTrawler even with PROVIDER_LIVE', () => {
  for (const mode of ['PROVIDER_LIVE', 'PROVIDER_SANDBOX', 'PARTNER_VERIFIED'] as const) {
    const cards = mapCarTrawlerQuotes({}, { mode });
    assert.equal(cards.length, 0, `CarTrawler leaked in mode ${mode}`);
  }
});

test('BLOCKED VENDORS: no public leakage of Viator even with PROVIDER_LIVE', () => {
  for (const mode of ['PROVIDER_LIVE', 'PROVIDER_SANDBOX', 'PARTNER_VERIFIED'] as const) {
    const cards = mapViatorActivities({}, { mode });
    assert.equal(cards.length, 0, `Viator leaked in mode ${mode}`);
  }
});

// ============================================
// Synthetic VIP Isolation Test
// ============================================

test('SYNTHETIC VIP: never leaks into public rendering', () => {
  for (const mode of ['PROVIDER_LIVE', 'PROVIDER_SANDBOX', 'PARTNER_VERIFIED', 'SYNTHETIC_TEST'] as const) {
    const cards = mapVIPServices({}, { mode });
    assert.equal(cards.length, 0, `VIP synthetic leaked in mode ${mode}`);
  }
});
