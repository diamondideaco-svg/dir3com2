import assert from "node:assert/strict";
import test from "node:test";

import { TravelProviderError } from "@/lib/travel/errors";
import { clearLiteApiBookingReplayForTests, cancelLiteApiBooking, createLiteApiTestBooking, getLiteApiBooking, prebookLiteApiStay, searchLiteApiHotels } from "@/lib/travel/liteapi/stays";

const originalFetch = global.fetch;
const ENV_KEYS = ["LITEAPI_TEST_API_KEY", "LITEAPI_ENV", "LITEAPI_API_BASE_URL", "LITEAPI_PRODUCTION_API_KEY", "LITEAPI_LIVE_API_KEY"] as const;

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function input() { return { cityName: "Cairo", countryCode: "EG", checkIn: "2027-01-15", checkOut: "2027-01-16", occupancies: [{ adults: 2 }], currency: "USD", guestNationality: "EG" }; }
function bookingInput() { return { prebookId: "pre_1", clientReference: "dir3com-liteapi-test-1", holder: { firstName: "Test", lastName: "Guest", email: "test@example.invalid" }, guests: [{ firstName: "Test", lastName: "Guest", email: "test@example.invalid" }] }; }

test.beforeEach(() => { process.env.LITEAPI_TEST_API_KEY = "sand_" + "test-only-not-real"; process.env.LITEAPI_ENV = "sandbox"; clearLiteApiBookingReplayForTests(); });
test.afterEach(() => { global.fetch = originalFetch; for (const key of ENV_KEYS) delete process.env[key]; });

test("normalizes hotel, room, rate, price, and cancellation fields", async () => {
  global.fetch = (async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("X-API-Key"), "sand_test-only-not-real");
    assert.equal(init?.cache, "no-store");
    return json({ sandbox: true, hotels: [{ id: "h1", name: "Cairo Test Hotel", address: "Cairo", rating: 8.4 }], data: [{ hotelId: "h1", roomTypes: [{ offerId: "offer_1", rates: [{ name: "Deluxe", mappedRoomId: 12, boardName: "Breakfast", retailRate: { total: [{ amount: 101.5, currency: "USD" }] }, cancellationPolicies: { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2027-01-14" }] } }] }] }] });
  }) as typeof fetch;
  const result = await searchLiteApiHotels(input());
  assert.equal(result.status, "ok");
  assert.equal(result.hotels[0]?.name, "Cairo Test Hotel");
  assert.equal(result.hotels[0]?.rooms[0]?.rates[0]?.totalAmount, "101.50");
  assert.equal(result.hotels[0]?.rooms[0]?.rates[0]?.refundable, true);
});

test("normalizes empty availability as NO_RESULTS", async () => {
  global.fetch = (async () => json({ sandbox: true, data: [], hotels: [] })) as typeof fetch;
  const result = await searchLiteApiHotels(input());
  assert.equal(result.status, "no_results");
  assert.equal(result.error?.code, "NO_RESULTS");
});

test("maps provider no-availability and price-change errors", async (t) => {
  await t.test("expired rate", async () => {
    global.fetch = (async () => json({ error: { code: 2001, message: "no availability found" } }, 409)) as typeof fetch;
    await assert.rejects(prebookLiteApiStay({ rateId: "expired" }), (error: unknown) => (error as TravelProviderError).code === "OFFER_EXPIRED");
  });
  await t.test("price changed", async () => {
    global.fetch = (async () => json({ error: { code: 2001, description: "price changed" } }, 409)) as typeof fetch;
    await assert.rejects(prebookLiteApiStay({ rateId: "changed" }), (error: unknown) => (error as TravelProviderError).code === "PRICE_CHANGED");
  });
});

test("normalizes prebook and booking lifecycle responses", async () => {
  global.fetch = (async (request, init) => {
    const url = String(request);
    if (url.endsWith("/rates/prebook")) return json({ data: { prebookId: "pre_1", hotelId: "h1", price: 111.25, currency: "USD", priceDifferencePercent: 0, cancellationChanged: false, boardChanged: false } });
    if (url.endsWith("/rates/book")) { assert.match(String(init?.body), /ACC_CREDIT_CARD/); return json({ data: { bookingId: "book_1", status: "CONFIRMED", clientReference: "dir3com-liteapi-test-1", hotelConfirmationCode: "CONF_1", price: 111.25, currency: "USD" } }); }
    if (init?.method === "PUT") return json({ data: { status: "CANCELLED", refundAmount: 111.25, currency: "USD" } });
    return json({ data: { bookingId: "book_1", status: "CONFIRMED", clientReference: "dir3com-liteapi-test-1" } });
  }) as typeof fetch;
  assert.equal((await prebookLiteApiStay({ rateId: "offer_1" })).id, "pre_1");
  assert.equal((await createLiteApiTestBooking(bookingInput())).status, "confirmed");
  assert.equal((await getLiteApiBooking("book_1")).id, "book_1");
  assert.equal((await cancelLiteApiBooking("book_1")).status, "cancelled");
});

test("deduplicates a replayed clientReference locally", async () => {
  let calls = 0;
  global.fetch = (async () => { calls += 1; return json({ data: { bookingId: "book_1", status: "CONFIRMED", clientReference: "dir3com-liteapi-test-1" } }); }) as typeof fetch;
  const [first, replay] = await Promise.all([createLiteApiTestBooking(bookingInput()), createLiteApiTestBooking(bookingInput())]);
  assert.equal(first.id, replay.id);
  assert.equal(calls, 1);
});

test("never retries a failed booking mutation", async () => {
  let calls = 0;
  global.fetch = (async () => { calls += 1; return json({ error: { code: 2013, message: "booking failed" } }, 500); }) as typeof fetch;
  await assert.rejects(createLiteApiTestBooking(bookingInput()), (error: unknown) => (error as TravelProviderError).code === "BOOKING_FAILED");
  assert.equal(calls, 1);
});

test("bounds transient read retries", async () => {
  let calls = 0;
  global.fetch = (async () => { calls += 1; if (calls === 1) throw new TypeError("network"); return json({ data: [] }); }) as typeof fetch;
  assert.equal((await searchLiteApiHotels(input())).status, "no_results");
  assert.equal(calls, 2);
});

test("maps unauthorized, malformed, and provider failures safely", async (t) => {
  await t.test("unauthorized", async () => {
    global.fetch = (async () => json({ error: { code: 401, message: "unauthorized" } }, 401)) as typeof fetch;
    await assert.rejects(searchLiteApiHotels(input()), (error: unknown) => (error as TravelProviderError).code === "UNAUTHORIZED_VENDOR_ACCESS" && !String((error as Error).message).includes("sand_test"));
  });
  await t.test("malformed", async () => {
    global.fetch = (async () => new Response("not-json", { status: 200 })) as typeof fetch;
    await assert.rejects(searchLiteApiHotels(input()), (error: unknown) => (error as TravelProviderError).code === "INVALID_PROVIDER_RESPONSE");
  });
  await t.test("booking failure", async () => {
    global.fetch = (async () => json({ error: { code: 5000, description: "supplier failed" } }, 500)) as typeof fetch;
    await assert.rejects(createLiteApiTestBooking(bookingInput()), (error: unknown) => (error as TravelProviderError).code === "BOOKING_FAILED");
  });
});

test("fails closed for missing credentials and all live-mode indicators", async (t) => {
  await t.test("missing key", async () => {
    delete process.env.LITEAPI_TEST_API_KEY;
    await assert.rejects(prebookLiteApiStay({ rateId: "offer" }), (error: unknown) => (error as TravelProviderError).code === "UNAUTHORIZED_VENDOR_ACCESS");
  });
  await t.test("live environment", async () => {
    process.env.LITEAPI_ENV = "production";
    await assert.rejects(prebookLiteApiStay({ rateId: "offer" }), (error: unknown) => (error as TravelProviderError).code === "LIVE_MUTATION_FORBIDDEN");
  });
  await t.test("production key configured", async () => {
    process.env.LITEAPI_ENV = "sandbox";
    process.env.LITEAPI_PRODUCTION_API_KEY = "prod_test";
    await assert.rejects(prebookLiteApiStay({ rateId: "offer" }), (error: unknown) => (error as TravelProviderError).code === "LIVE_MUTATION_FORBIDDEN");
  });
});

test("rejects non-official configurable origins before sending credentials", async () => {
  process.env.LITEAPI_API_BASE_URL = "https://example.invalid";
  let called = false;
  global.fetch = (async () => { called = true; return json({}); }) as typeof fetch;
  await assert.rejects(searchLiteApiHotels(input()), (error: unknown) => (error as TravelProviderError).code === "LIVE_MUTATION_FORBIDDEN");
  assert.equal(called, false);
});
