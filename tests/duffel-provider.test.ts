import assert from "node:assert/strict";
import test from "node:test";

import { getDuffelHealthStatus } from "@/lib/travel/duffel/health";
import { searchDuffelFlights } from "@/lib/travel/duffel/search";
import { createDuffelFlightBooking, getDuffelFlightOffer, getDuffelFlightOrder, refreshDuffelFlightOffer } from "@/lib/travel/duffel/flights";

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
  delete process.env.DUFFEL_ENV;
});

test.beforeEach(() => {
  delete process.env.DUFFEL_API_KEY;
  delete process.env.DUFFEL_TEST_TOKEN;
  delete process.env.DUFFEL_ENV;
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
  process.env.DUFFEL_ENV = "test";

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
                segments: [],
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
  process.env.DUFFEL_ENV = "test";
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
    createDuffelFlightBooking({ offerId: "offer_1", passengers: [{ type: "adult" }], idempotencyKey: "booking-key-1" }),
    (error: unknown) => (error as { code?: string }).code === "LIVE_MUTATION_FORBIDDEN",
  );
  assert.equal(requests, 0);
  delete process.env.DUFFEL_ENV;
});

for (const environment of [undefined, "live", "production", "unknown", " LIVE "]) {
  test(`flight mutations fail closed for environment ${String(environment)}`, async () => {
    process.env.DUFFEL_TEST_TOKEN = "duffel-token";
    if (environment === undefined) delete process.env.DUFFEL_ENV; else process.env.DUFFEL_ENV = environment;
    await assert.rejects(
      createDuffelFlightBooking({ offerId: "offer_1", passengers: [{}], idempotencyKey: "booking-key-1" }),
      (error: unknown) => (error as { code?: string }).code === "LIVE_MUTATION_FORBIDDEN",
    );
  });
}

for (const environment of ["test", " TEST ", "sandbox", "SandBox"]) {
  test(`explicit normalized ${environment} mode reaches validation`, async () => {
    process.env.DUFFEL_ENV = environment;
    process.env.DUFFEL_TEST_TOKEN = "duffel-token";
    await assert.rejects(
      createDuffelFlightBooking({ offerId: "", passengers: [], idempotencyKey: "booking-key-1" }),
      (error: unknown) => (error as { code?: string }).code === "INVALID_PROVIDER_RESPONSE",
    );
  });
}

test("generic Duffel key is blocked without explicit test mode", async () => {
  process.env.DUFFEL_API_KEY = "generic-token";
  const result = await searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" });
  assert.equal(result.status, "blocked");
});

test("generic Duffel key is permitted in explicit test mode", async () => {
  process.env.DUFFEL_API_KEY = "generic-token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => json({ data: { offers: [] } })) as typeof fetch;
  assert.equal((await searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" })).status, "no_results");
});

for (const [field, value] of [["total_amount", "0"], ["total_amount", "-1"], ["total_amount", "abc"], ["total_currency", "US"]] as const) {
  test(`rejects invalid offer ${field}=${value}`, async () => {
    process.env.DUFFEL_TEST_TOKEN = "token";
    process.env.DUFFEL_ENV = "test";
    const offer: Record<string, unknown> = { id: "off_1", total_amount: "10.00", total_currency: "USD", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "RUH" }, segments: [] }] };
    offer[field] = value;
    global.fetch = (async () => json({ data: { offers: [offer] } })) as typeof fetch;
    await assert.rejects(searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" }), (error: unknown) => (error as { code?: string }).code === "INVALID_PROVIDER_RESPONSE");
  });
}

test("rejects malformed provider slices", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => json({ data: { offers: [{ id: "off_1", total_amount: "10", total_currency: "USD", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "RUH" } }] } ] } })) as typeof fetch;
  await assert.rejects(searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" }), (error: unknown) => (error as { code?: string }).code === "INVALID_PROVIDER_RESPONSE");
});

test("lists offers when create response omits embedded offers", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  let calls = 0;
  global.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    if (String(input).includes("offer_requests")) return json({ data: { id: "orq_1" } });
    return json({ data: [{ id: "off_1", total_amount: "10", total_currency: "USD", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "RUH" }, segments: [] }] }] });
  }) as typeof fetch;
  assert.equal((await searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" })).offers.length, 1);
  assert.equal(calls, 2);
});

test("HTTP 429 is normalized as retryable", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => json({ errors: [{ message: "rate limited" }] }, 429)) as typeof fetch;
  const result = await searchDuffelFlights({ from: "CAI", to: "RUH", departureDate: "2026-10-20" });
  assert.equal(result.error?.retryable, true);
});

for (const key of ["", "short", "spaces are invalid", "x".repeat(256)]) {
  test(`booking rejects invalid idempotency key length ${key.length}`, async () => {
    process.env.DUFFEL_TEST_TOKEN = "token";
    process.env.DUFFEL_ENV = "test";
    await assert.rejects(createDuffelFlightBooking({ offerId: "off_1", passengers: [{}], idempotencyKey: key }), (error: unknown) => (error as { code?: string }).code === "INVALID_PROVIDER_RESPONSE");
  });
}

test("booking reuses the validated idempotency key and real offer price", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (String(input).includes("/air/offers/")) return json({ data: { id: "off_1", total_amount: "99.50", total_currency: "GBP", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "LHR" }, segments: [] }] } });
    return json({ data: { id: "ord_1", booking_reference: "ABC123", total_amount: "99.50", total_currency: "GBP" } });
  }) as typeof fetch;
  const order = await createDuffelFlightBooking({ offerId: "off_1", passengers: [{}], idempotencyKey: "stable-key-123" });
  assert.equal(order.status, "confirmed");
  assert.equal(new Headers(requests[1]?.init?.headers).get("Idempotency-Key"), "stable-key-123");
  assert.match(String(requests[1]?.init?.body), /"amount":"99.50","currency":"GBP"/);
});

test("booking maps expired-offer provider errors", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async (input: RequestInfo | URL) => String(input).includes("/air/offers/")
    ? json({ data: { id: "off_1", total_amount: "99", total_currency: "USD", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "RUH" }, segments: [] }] } })
    : json({ errors: [{ code: "offer_expired", message: "expired" }] }, 422)) as typeof fetch;
  await assert.rejects(createDuffelFlightBooking({ offerId: "off_1", passengers: [{}], idempotencyKey: "stable-key-123" }), (error: unknown) => (error as { code?: string }).code === "OFFER_EXPIRED");
});

test("network abort is normalized as PROVIDER_TIMEOUT", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch;
  await assert.rejects(getDuffelFlightOffer("off_1"), (error: unknown) => (error as { code?: string }).code === "PROVIDER_TIMEOUT");
});

test("offer refresh retrieves and validates the latest offer", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => json({ data: { id: "off_1", total_amount: "11", total_currency: "EUR", conditions: { changeable: false, refundable: true }, slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "FCO" }, segments: [] }] } })) as typeof fetch;
  const offer = await refreshDuffelFlightOffer("off_1");
  assert.equal(offer.totalAmount, "11");
  assert.deepEqual(offer.conditions, { changeable: false, refundable: true });
});

for (const [providerCode, sharedCode] of [["price_changed", "PRICE_CHANGED"], ["insufficient_balance", "INSUFFICIENT_BALANCE"], ["payment_failed", "PAYMENT_DECLINED"], ["order_failed", "BOOKING_FAILED"]] as const) {
  test(`booking maps ${providerCode} to ${sharedCode}`, async () => {
    process.env.DUFFEL_TEST_TOKEN = "token";
    process.env.DUFFEL_ENV = "test";
    global.fetch = (async (input: RequestInfo | URL) => String(input).includes("/air/offers/")
      ? json({ data: { id: "off_1", total_amount: "99", total_currency: "USD", slices: [{ origin: { iata_code: "CAI" }, destination: { iata_code: "RUH" }, segments: [] }] } })
      : json({ errors: [{ code: providerCode, message: "safe failure" }] }, 422)) as typeof fetch;
    await assert.rejects(createDuffelFlightBooking({ offerId: "off_1", passengers: [{}], idempotencyKey: "stable-key-123" }), (error: unknown) => (error as { code?: string }).code === sharedCode);
  });
}

test("terminal failed orders are not mapped to pending", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  global.fetch = (async () => json({ data: { id: "ord_1", failed_at: "2026-08-25T00:00:00Z" } })) as typeof fetch;
  assert.equal((await getDuffelFlightOrder("ord_1")).status, "failed");
});

test("health probe always sends a future departure date", async () => {
  process.env.DUFFEL_TEST_TOKEN = "token";
  process.env.DUFFEL_ENV = "test";
  let departureDate = "";
  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    departureDate = JSON.parse(String(init?.body)).data.slices[0].departure_date;
    return json({ data: { offers: [] } });
  }) as typeof fetch;
  await getDuffelHealthStatus();
  assert.ok(departureDate > new Date().toISOString().slice(0, 10));
});
