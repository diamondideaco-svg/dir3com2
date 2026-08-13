import assert from "node:assert/strict";
import test from "node:test";
import { clearWeatherCacheForTests, getWeatherSnapshot } from "@/lib/weather/service";

const originalFetch = global.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.afterEach(() => {
  global.fetch = originalFetch;
  clearWeatherCacheForTests();
});

test("weather success from provider", async () => {
  global.fetch = (async () =>
    json({
      current: {
        temperature_2m: 34,
        weather_code: 1,
        time: "2026-08-13T10:00:00Z",
      },
    })) as typeof fetch;

  const weather = await getWeatherSnapshot({ city: "cairo", language: "en", unit: "c" });
  assert.equal(weather.live, true);
  assert.equal(weather.provider, "open-meteo");
  assert.equal(weather.temperature, 34);
});

test("provider error returns unavailable fallback", async () => {
  global.fetch = (async () => json({ error: "down" }, 500)) as typeof fetch;

  const weather = await getWeatherSnapshot({ city: "cairo", language: "ar", unit: "c" });
  assert.equal(weather.live, false);
  assert.equal(weather.provider, "unavailable");
  assert.equal(weather.condition, "غير متاح");
});

test("malformed payload returns unavailable fallback", async () => {
  global.fetch = (async () => json({ current: { weather_code: "x" } })) as typeof fetch;

  const weather = await getWeatherSnapshot({ city: "cairo", language: "en", unit: "c" });
  assert.equal(weather.live, false);
  assert.equal(weather.condition, "Unavailable");
});

test("timeout-like failure returns unavailable fallback", async () => {
  global.fetch = (async () => {
    throw new Error("AbortError");
  }) as typeof fetch;

  const weather = await getWeatherSnapshot({ city: "cairo", language: "en", unit: "f" });
  assert.equal(weather.live, false);
  assert.equal(weather.unit, "f");
});
