type FetchLike = typeof fetch;
type TokenCache = { accessToken: string; expiresAt: number };

let cachedToken: TokenCache | null = null;

export class SabreAuthError extends Error {
  constructor(public readonly status?: number) {
    super(status ? `Sabre authentication failed with HTTP ${status}.` : "Sabre authentication failed.");
    this.name = "SabreAuthError";
  }
}

function requireCredential(name: "SABRE_USER_ID" | "SABRE_PASSWORD", env: Partial<Record<string, string | undefined>>) {
  const value = env[name]?.trim();
  if (!value) {
    throw new SabreAuthError();
  }
  return value;
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function createSabreTokenProvider(
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now
) {
  return async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > now() + 60_000) {
      return cachedToken.accessToken;
    }

    const userId = requireCredential("SABRE_USER_ID", env);
    const password = requireCredential("SABRE_PASSWORD", env);
    const encodedUserId = Buffer.from(userId, "utf8").toString("base64");
    const encodedPassword = Buffer.from(password, "utf8").toString("base64");
    const credential = Buffer.from(`${encodedUserId}:${encodedPassword}`, "utf8").toString("base64");

    const response = await fetchWithTimeout(
      fetchImpl,
      env.SABRE_AUTH_URL || "https://api.cert.platform.sabre.com/v2/auth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credential}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
        cache: "no-store",
      },
      5000
    );

    const payload = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!response.ok || typeof payload?.access_token !== "string") {
      throw new SabreAuthError(response.status);
    }

    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    cachedToken = {
      accessToken: payload.access_token,
      expiresAt: now() + Math.max(expiresIn, 60) * 1000,
    };
    return cachedToken.accessToken;
  };
}

export const getSabreAccessToken = createSabreTokenProvider();

export function clearSabreTokenCache() {
  cachedToken = null;
}
