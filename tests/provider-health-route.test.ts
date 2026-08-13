import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/providers/health/route";
import { clearTravelportAuthCache } from "@/lib/travelport/auth";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.afterEach(() => {
  global.fetch = originalFetch;
  clearTravelportAuthCache();
});

test("provider health route surfaces travelport readiness", async () => {
  process.env.TRAVELPORT_AUTH_URL = "https://tp.test/oauth/token";
  process.env.TRAVELPORT_USERNAME = "u";
  process.env.TRAVELPORT_PASSWORD = "p";
  process.env.TRAVELPORT_CLIENT_ID = "id";
  process.env.TRAVELPORT_CLIENT_SECRET = "secret";
  process.env.TRAVELPORT_API_BASE_URL = "https://tp.test/";
  process.env.TRAVELPORT_ACCESS_GROUP = "group";
  process.env.TRAVELPORT_PCC = "7K7L_1G";

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/oauth/token")) {
      return json({ access_token: "token", expires_in: 3600 });
    }

    if (url.includes("/11/air/catalog/search/catalogproductofferings")) {
      return json({ code: "1012100" }, 401);
    }

    if (url.includes("/11/hotel/search/properties/search")) {
      return json({ code: "2500" }, 403);
    }

    return json({}, 500);
  }) as typeof fetch;

  const response = await GET();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.travelport.authReachable, true);
  assert.equal(payload.travelport.flights.status, "entitlement_blocked");
  assert.equal(payload.travelport.stays.status, "entitlement_blocked");
});
