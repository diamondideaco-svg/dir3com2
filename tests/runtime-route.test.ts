import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/public/runtime/route";
import { clearCurrencyCacheForTests } from "@/lib/currency/service";
import { clearWeatherCacheForTests } from "@/lib/weather/service";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.afterEach(() => {
  global.fetch = originalFetch;
  clearCurrencyCacheForTests();
  clearWeatherCacheForTests();
});

test("runtime route returns weather and fx payload", async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("open-meteo")) {
      return json({ current: { temperature_2m: 33, weather_code: 0, time: "2026-08-13T10:00:00Z" } });
    }
    return json({ date: "2026-08-13", rates: { USD: 1, SAR: 3.75, EGP: 48, EUR: 0.92, AED: 3.67 } });
  }) as typeof fetch;

  const response = await GET(new NextRequest("http://localhost/api/public/runtime?lang=en&currency=SAR"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.weather.live, true);
  assert.equal(payload.fx.quote.target, "SAR");
});
