import { createHmac, timingSafeEqual } from "node:crypto";
import { TravelProviderError } from "../errors";

const AUTHORIZATION_PATTERN = /^PublicKey=([^,]+),Signature=([a-f0-9]{128}),Timestamp=(\d+)$/i;
export const LITEAPI_HMAC_MAX_AGE_SECONDS = 300;

type HmacCredentials = { publicKey: string; privateKey: string; sharedSecret: string };

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", `LiteAPI HMAC ${label} is not configured.`);
  return normalized;
}

export function getLiteApiHmacCredentials(env: NodeJS.ProcessEnv = process.env): HmacCredentials {
  return {
    publicKey: required(env.LITEAPI_PUBLIC_API_KEY, "public key"),
    privateKey: required(env.LITEAPI_PRIVATE_API_KEY, "private key"),
    sharedSecret: required(env.LITEAPI_SHARED_SECRET, "shared secret"),
  };
}

export function createLiteApiHmacSignature(credentials: HmacCredentials, timestamp: number): string {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI HMAC timestamp is invalid.");
  }
  return createHmac("sha512", credentials.sharedSecret)
    .update(`${credentials.privateKey}${credentials.publicKey}${timestamp}`, "utf8")
    .digest("hex");
}

export function createLiteApiHmacAuthorization(credentials: HmacCredentials, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createLiteApiHmacSignature(credentials, timestamp);
  return `PublicKey=${credentials.publicKey},Signature=${signature},Timestamp=${timestamp}`;
}

export function verifyLiteApiHmacAuthorization(
  authorization: string | null | undefined,
  credentials: HmacCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const match = authorization?.match(AUTHORIZATION_PATTERN);
  if (!match) return false;
  const [, publicKey, suppliedSignature, rawTimestamp] = match;
  const timestamp = Number(rawTimestamp);
  if (publicKey !== credentials.publicKey || !Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > LITEAPI_HMAC_MAX_AGE_SECONDS) return false;
  const supplied = Buffer.from(suppliedSignature, "hex");
  const expected = Buffer.from(createLiteApiHmacSignature(credentials, timestamp), "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function getLiteApiAuthHeaders(env: NodeJS.ProcessEnv = process.env, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
  const environment = env.LITEAPI_ENV?.trim().toLowerCase();
  if (environment === "sandbox") {
    const apiKey = env.LITEAPI_TEST_API_KEY?.trim();
    if (!apiKey || !apiKey.startsWith("sand_")) throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "LiteAPI sandbox credentials are not configured.");
    return { "X-API-Key": apiKey };
  }
  if (env.LITEAPI_AUTH_MODE?.trim().toLowerCase() !== "hmac") {
    throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "LiteAPI authentication mode is not explicitly configured.");
  }
  return { Authorization: createLiteApiHmacAuthorization(getLiteApiHmacCredentials(env), timestamp) };
}
