import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/flights/search/route";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.beforeEach(() => {
  process.env.SABRE_AUTH_URL = "https://sabre.test/auth";
  process.env.SABRE_API_BASE_URL = "https://sabre.test";
  process.env.SABRE_USER_ID = "user";
  process.env.SABRE_PASSWORD = "password";
  process.env.SABRE_PCC = "S5OM";
});

test.afterEach(() => {
  global.fetch = originalFetch;
});

test("sabre route validates malformed input", async () => {
  const response = await POST(
    new Request("http://localhost/api/flights/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: "CA", destination: "RUH", departureDate: "2026-11-11", adults: 1 }),
    }) as never
  );

  assert.equal(response.status, 400);
});

test("sabre route returns normalized informational result", async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/auth")) {
      return json({ access_token: "token", expires_in: 3600 });
    }

    return json({
      groupedItineraryResponse: {
        scheduleDescs: [
          {
            id: 1,
            departure: "2026-11-11T08:00:00",
            arrival: "2026-11-11T10:00:00",
            carrier: { marketing: "SV", operating: { code: "SV" }, marketingFlightNumber: 101 },
            equipment: { code: "320" },
          },
        ],
        legDescs: [{ id: 1, elapsedTime: 120, schedules: [{ ref: 1 }] }],
        itineraryGroups: [
          {
            itineraries: [
              {
                id: 1,
                legs: [{ ref: 1 }],
                pricingInformation: [
                  {
                    fare: {
                      validatingCarrierCode: "SV",
                      totalFare: { totalPrice: 200, equivalentAmount: 170, totalTaxAmount: 30, currency: "USD" },
                      passengerInfoList: [],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }) as typeof fetch;

  const response = await POST(
    new Request("http://localhost/api/flights/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: "CAI", destination: "RUH", departureDate: "2026-11-11", adults: 1 }),
    }) as never
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.searchType, "informational");
  assert.equal(payload.provider, "sabre");
  assert.equal(typeof payload.itineraryCount, "number");
});
