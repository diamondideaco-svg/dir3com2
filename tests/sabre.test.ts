import assert from "node:assert/strict";
import test from "node:test";
import { clearSabreTokenCache, createSabreTokenProvider, SabreAuthError } from "@/lib/sabre/auth";
import { createSabreRequest, SabreProviderError } from "@/lib/sabre/client";
import { normalizeSabreBfmResponse, SabreValidationError, validateSabreFlightSearch } from "@/lib/sabre/search";

const env = {
  SABRE_USER_ID: "fixture-user",
  SABRE_PASSWORD: "fixture-password",
  SABRE_PCC: "TEST",
  SABRE_AUTH_URL: "https://example.test/auth",
  SABRE_API_BASE_URL: "https://example.test",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("OAuth success and cached token reuse", async () => {
  clearSabreTokenCache();
  let calls = 0;
  const provider = createSabreTokenProvider(env, async () => {
    calls += 1;
    return json({ access_token: "opaque-token", expires_in: 3600 });
  });

  assert.equal(await provider(), "opaque-token");
  assert.equal(await provider(), "opaque-token");
  assert.equal(calls, 1);
});

test("OAuth failure is sanitized", async () => {
  clearSabreTokenCache();
  const provider = createSabreTokenProvider(env, async () =>
    json({ error_description: "fixture-password opaque-token" }, 401)
  );

  await assert.rejects(
    provider(),
    (error: unknown) =>
      error instanceof SabreAuthError &&
      !error.message.includes("fixture-password") &&
      !error.message.includes("opaque-token")
  );
});

test("BFM success and 401 refresh exactly once", async () => {
  let fetchCalls = 0;
  let tokenCalls = 0;
  let clears = 0;

  const request = createSabreRequest(
    env,
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return json({}, 401);
      }
      return json({ groupedItineraryResponse: {} });
    },
    async () => `token-${++tokenCalls}`,
    () => {
      clears += 1;
    }
  );

  assert.deepEqual(await request("/v5/offers/shop", { method: "POST" }), {
    groupedItineraryResponse: {},
  });
  assert.equal(fetchCalls, 2);
  assert.equal(tokenCalls, 2);
  assert.equal(clears, 1);
});

test("provider failure never leaks raw response secrets", async () => {
  const request = createSabreRequest(
    env,
    async () => json({ Authorization: "Bearer opaque-token", password: "fixture-password" }, 500),
    async () => "opaque-token"
  );

  await assert.rejects(
    request("/v5/offers/shop"),
    (error: unknown) =>
      error instanceof SabreProviderError &&
      !error.message.includes("opaque-token") &&
      !error.message.includes("fixture-password")
  );
});

test("strict input validation rejects malformed searches before invocation", () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  assert.throws(
    () => validateSabreFlightSearch({ origin: "CA", destination: "RUH", departureDate: future, adults: 1 }),
    SabreValidationError
  );
  assert.throws(
    () => validateSabreFlightSearch({ origin: "CAI", destination: "CAI", departureDate: future, adults: 1 }),
    SabreValidationError
  );
  assert.throws(
    () => validateSabreFlightSearch({ origin: "CAI", destination: "RUH", departureDate: "2020-01-01", adults: 1 }),
    SabreValidationError
  );
  assert.throws(
    () => validateSabreFlightSearch({ origin: "CAI", destination: "RUH", departureDate: future, adults: 0 }),
    SabreValidationError
  );
  assert.equal(validateSabreFlightSearch({ origin: "cai", destination: "ruh", departureDate: future, adults: 1 }).origin, "CAI");
});

test("normalizes grouped itinerary into stable dir3com shape", () => {
  const result = normalizeSabreBfmResponse(
    {
      groupedItineraryResponse: {
        scheduleDescs: [
          {
            id: 1,
            departure: "2026-10-01T10:00:00",
            arrival: "2026-10-01T12:00:00",
            carrier: { marketing: "SV", operating: { code: "SV" }, marketingFlightNumber: 311 },
            equipment: { code: "320" },
          },
        ],
        legDescs: [{ id: 1, elapsedTime: 120, schedules: [{ ref: 1 }] }],
        itineraryGroups: [
          {
            itineraries: [
              {
                id: 7,
                legs: [{ ref: 1 }],
                pricingInformation: [
                  {
                    fare: {
                      validatingCarrierCode: "SV",
                      totalFare: {
                        totalPrice: 250,
                        equivalentAmount: 200,
                        totalTaxAmount: 50,
                        currency: "USD",
                      },
                      passengerInfoList: [],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { origin: "CAI", destination: "RUH", departureDate: "2026-10-01", adults: 1 }
  );

  assert.equal(result.itineraryCount, 1);
  assert.deepEqual(result.itineraries[0], {
    id: "7",
    origin: "CAI",
    destination: "RUH",
    departureDateTime: "2026-10-01T10:00:00",
    arrivalDateTime: "2026-10-01T12:00:00",
    totalDurationMinutes: 120,
    stopCount: 0,
    marketingCarrier: "SV",
    operatingCarrier: "SV",
    flightNumber: "311",
    equipment: "320",
    cabin: undefined,
    totalFare: 250,
    baseFare: 200,
    taxes: 50,
    currency: "USD",
    validatingCarrier: "SV",
  });
});
