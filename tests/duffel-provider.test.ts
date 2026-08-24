import assert from "node:assert/strict";
import test from "node:test";

import { getDuffelHealthStatus } from "@/lib/travel/duffel/health";
import { searchDuffelFlights } from "@/lib/travel/duffel/search";
import { createDuffelFlightBooking } from "@/lib/travel/duffel/flights";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.DUFFEL_API_BASE_URL;
  delete process.env.DUFFEL_TEST_TOKEN;
  delete process.env.DUFFEL_API_KEY;
});

test.beforeEach(() => {
  delete process.env.DUFFEL_API_KEY;
  delete process.env.DUFFEL_TEST_TOKEN;
});

test("duffel health reports access blocked when no test token is configured", async () => {
  const health = await getDuffelHealthStatus();

  assert.equal(health.provider, "duffel");
  assert.equal(health.auth.status, "access_blocked");
  assert.equal(health.flights.status, "access_blocked");
});

test("duffel flight search normalizes a successful provider response", async () => {
  process.env.DUFFEL_API_BASE_URL = "https://api.duffel.com";
  process.env.DUFFEL_TEST_TOKEN = "duffel-token";

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/air/offer_requests")) {
      return json({
        data: { offers: [
          {
            id: "offer_1",
            offer_id: "offer_1",
            owner: "duffel",
            total_amount: "123.45",
            total_currency: "USD",
            slices: [
              {
                origin: { iata_code: "CAI" },
                destination: { iata_code: "RUH" },
              },
            ],
          },
        ] },
      });
    }

    return json({ error: { message: "unexpected" } }, 500);
  }) as typeof fetch;

  const result = await searchDuffelFlights({
    from: "CAI",
    to: "RUH",
    departureDate: "2026-08-20",
  });

  assert.equal(result.provider, "duffel");
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0]?.origin, "CAI");
  assert.equal(result.offers[0]?.destination, "RUH");
  assert.equal(result.offers[0]?.currency, "USD");
});

test("empty provider data is normalized as NO_RESULTS", async () => {
  process.env.DUFFEL_TEST_TOKEN = "duffel-token";
  global.fetch = (async () => json({ data: [] })) as typeof fetch;

  const result = await searchDuffelFlights({ from: "PVD", to: "RAI", departureDate: "2026-08-20" });
  assert.equal(result.status, "no_results");
  assert.equal(result.error?.code, "NO_RESULTS");
});

test("flight mutations reject live mode before making a request", async () => {
  process.env.DUFFEL_TEST_TOKEN = "duffel-token";
  process.env.DUFFEL_ENV = "live";
  let requests = 0;
  global.fetch = (async () => { requests += 1; return json({ data: {} }); }) as typeof fetch;

  await assert.rejects(
    createDuffelFlightBooking({ offerId: "offer_1", passengers: [{ type: "adult" }] }),
    (error: unknown) => (error as { code?: string }).code === "LIVE_MUTATION_FORBIDDEN",
  );
  assert.equal(requests, 0);
  delete process.env.DUFFEL_ENV;
});
