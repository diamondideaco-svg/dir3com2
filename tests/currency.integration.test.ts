import assert from "node:assert/strict";
import test from "node:test";
import { clearCurrencyCacheForTests, convertCurrency } from "@/lib/currency/service";

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
});

test("currency conversion success from provider", async () => {
  global.fetch = (async () =>
    json({
      date: "2026-08-13",
      rates: {
        USD: 1,
        SAR: 3.75,
        EGP: 48,
        EUR: 0.92,
        AED: 3.67,
      },
    })) as typeof fetch;

  const result = await convertCurrency({ amount: 100, sourceCurrency: "USD", targetCurrency: "SAR" });
  assert.equal(result.ok, true);
  assert.equal(result.quote.convertedAmount, 375);
  assert.equal(result.quote.target, "SAR");
});

test("provider error falls back safely without throwing", async () => {
  global.fetch = (async () => json({ error: "down" }, 503)) as typeof fetch;

  const result = await convertCurrency({ amount: 10, sourceCurrency: "USD", targetCurrency: "EGP" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "FX_UNAVAILABLE");
  assert.equal(result.quote.convertedAmount > 0, true);
});

test("malformed response falls back safely", async () => {
  global.fetch = (async () => json({ rates: { USD: "oops" } })) as typeof fetch;

  const result = await convertCurrency({ amount: 10, sourceCurrency: "USD", targetCurrency: "SAR" });
  assert.equal(result.ok, false);
  assert.equal(result.quote.provider, "fallback");
});

test("timeout-like fetch failure returns fallback", async () => {
  global.fetch = (async () => {
    throw new Error("AbortError");
  }) as typeof fetch;

  const result = await convertCurrency({ amount: 5, sourceCurrency: "USD", targetCurrency: "AED" });
  assert.equal(result.ok, false);
  assert.equal(result.quote.provider, "fallback");
});
