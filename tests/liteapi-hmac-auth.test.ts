import assert from "node:assert/strict";
import test from "node:test";

import { TravelProviderError } from "@/lib/travel/errors";
import { liteApiRequest } from "@/lib/travel/liteapi/client";
import {
  createLiteApiHmacAuthorization,
  createLiteApiHmacSignature,
  getLiteApiAuthHeaders,
  getLiteApiHmacCredentials,
  verifyLiteApiHmacAuthorization,
} from "@/lib/travel/liteapi/auth";

const credentials = {
  publicKey: "public-test-placeholder",
  privateKey: "private-test-placeholder",
  sharedSecret: "shared-test-placeholder",
};
const timestamp = 1_800_000_000;
const testEnv = (values: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...values });

test("generates and validates a canonical HMAC SHA-512 authorization header", () => {
  const signature = createLiteApiHmacSignature(credentials, timestamp);
  assert.match(signature, /^[a-f0-9]{128}$/);
  const authorization = createLiteApiHmacAuthorization(credentials, timestamp);
  assert.equal(authorization, `PublicKey=${credentials.publicKey},Signature=${signature},Timestamp=${timestamp}`);
  assert.equal(verifyLiteApiHmacAuthorization(authorization, credentials, timestamp), true);
});

test("rejects an invalid HMAC signature", () => {
  const authorization = createLiteApiHmacAuthorization(credentials, timestamp).replace(/Signature=[a-f0-9]{128}/, `Signature=${"0".repeat(128)}`);
  assert.equal(verifyLiteApiHmacAuthorization(authorization, credentials, timestamp), false);
});

test("rejects stale and unreasonably future HMAC timestamps", () => {
  const authorization = createLiteApiHmacAuthorization(credentials, timestamp);
  assert.equal(verifyLiteApiHmacAuthorization(authorization, credentials, timestamp + 301), false);
  assert.equal(verifyLiteApiHmacAuthorization(authorization, credentials, timestamp - 301), false);
});

test("rejects malformed authorization headers", () => {
  for (const authorization of [null, "", "Bearer value", "PublicKey=x,Timestamp=1", "PublicKey=x,Signature=nope,Timestamp=1"]) {
    assert.equal(verifyLiteApiHmacAuthorization(authorization, credentials, timestamp), false);
  }
});

for (const [name, missingKey] of [
  ["public key", "LITEAPI_PUBLIC_API_KEY"],
  ["private key", "LITEAPI_PRIVATE_API_KEY"],
  ["shared secret", "LITEAPI_SHARED_SECRET"],
] as const) {
  test(`fails closed when HMAC ${name} is missing`, () => {
    const env = testEnv({
      LITEAPI_PUBLIC_API_KEY: credentials.publicKey,
      LITEAPI_PRIVATE_API_KEY: credentials.privateKey,
      LITEAPI_SHARED_SECRET: credentials.sharedSecret,
    });
    delete env[missingKey];
    assert.throws(() => getLiteApiHmacCredentials(env), (error: unknown) => (error as TravelProviderError).code === "UNAUTHORIZED_VENDOR_ACCESS");
  });
}

test("uses HMAC only when explicitly configured outside sandbox", () => {
  const headers = getLiteApiAuthHeaders(testEnv({
    LITEAPI_ENV: "production",
    LITEAPI_AUTH_MODE: " HMAC ",
    LITEAPI_PUBLIC_API_KEY: credentials.publicKey,
    LITEAPI_PRIVATE_API_KEY: credentials.privateKey,
    LITEAPI_SHARED_SECRET: credentials.sharedSecret,
  }), timestamp);
  assert.equal(headers["X-API-Key"], undefined);
  assert.equal(verifyLiteApiHmacAuthorization(headers.Authorization, credentials, timestamp), true);
});

test("LiteAPI client sends HMAC authorization without private credentials", async () => {
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    LITEAPI_ENV: "production",
    LITEAPI_AUTH_MODE: "hmac",
    LITEAPI_PUBLIC_API_KEY: credentials.publicKey,
    LITEAPI_PRIVATE_API_KEY: credentials.privateKey,
    LITEAPI_SHARED_SECRET: credentials.sharedSecret,
  });
  try {
    global.fetch = (async (_input, init) => {
      const headers = new Headers(init?.headers);
      const authorization = headers.get("Authorization") || "";
      assert.match(authorization, /^PublicKey=public-test-placeholder,Signature=[a-f0-9]{128},Timestamp=\d+$/);
      assert.equal(authorization.includes(credentials.privateKey), false);
      assert.equal(authorization.includes(credentials.sharedSecret), false);
      assert.equal(headers.has("X-API-Key"), false);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    await liteApiRequest("/v3.0/hotels/rates", { operation: "search", method: "POST", body: "{}" });
  } finally {
    global.fetch = originalFetch;
    for (const key of ["LITEAPI_ENV", "LITEAPI_AUTH_MODE", "LITEAPI_PUBLIC_API_KEY", "LITEAPI_PRIVATE_API_KEY", "LITEAPI_SHARED_SECRET"]) delete process.env[key];
  }
});

test("preserves X-API-Key only for explicit sandbox mode", () => {
  const sandboxHeaders = getLiteApiAuthHeaders(testEnv({ LITEAPI_ENV: " SandBox ", LITEAPI_TEST_API_KEY: "sand_test-placeholder" }), timestamp);
  assert.deepEqual(sandboxHeaders, { "X-API-Key": "sand_test-placeholder" });
  assert.throws(
    () => getLiteApiAuthHeaders(testEnv({ LITEAPI_TEST_API_KEY: "sand_test-placeholder" }), timestamp),
    (error: unknown) => (error as TravelProviderError).code === "UNAUTHORIZED_VENDOR_ACCESS",
  );
});
