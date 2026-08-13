import assert from "node:assert/strict";
import test from "node:test";
import { clearTravelportAuthCache } from "@/lib/travelport/auth";
import { getTravelportHealthStatus } from "@/lib/travelport/health";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.beforeEach(() => {
  process.env.TRAVELPORT_AUTH_URL = "https://tp.test/oauth/token";
  process.env.TRAVELPORT_USERNAME = "u";
  process.env.TRAVELPORT_PASSWORD = "p";
  process.env.TRAVELPORT_CLIENT_ID = "id";
  process.env.TRAVELPORT_CLIENT_SECRET = "secret";
  process.env.TRAVELPORT_API_BASE_URL = "https://tp.test/";
  process.env.TRAVELPORT_ACCESS_GROUP = "group";
  process.env.TRAVELPORT_PCC = "7K7L_1G";
  clearTravelportAuthCache();
});

test.afterEach(() => {
  global.fetch = originalFetch;
  clearTravelportAuthCache();
});

test("health reports auth reachable and entitlement blocks", async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/oauth/token")) {
      return json({ access_token: "tp-token", expires_in: 3600 });
    }

    if (url.includes("/11/air/catalog/search/catalogproductofferings")) {
      return json({ code: "1012100", message: "Unauthorized access" }, 401);
    }

    if (url.includes("/11/hotel/search/properties/search")) {
      return json({ code: "2500", message: "Forbidden" }, 403);
    }

    return json({}, 500);
  }) as typeof fetch;

  const health = await getTravelportHealthStatus();
  assert.equal(health.authReachable, true);
  assert.equal(health.flights.status, "entitlement_blocked");
  assert.equal(health.stays.status, "entitlement_blocked");
  assert.equal(health.flights.code, "1012100");
  assert.equal(health.stays.code, "2500");
});

test("health reports auth unreachable when oauth fails", async () => {
  global.fetch = (async () => json({ error: "invalid_client" }, 401)) as typeof fetch;

  const health = await getTravelportHealthStatus();
  assert.equal(health.authReachable, false);
  assert.equal(health.flights.status, "unavailable");
  assert.equal(health.stays.status, "unavailable");
});
