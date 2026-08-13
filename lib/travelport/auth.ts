let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

export class TravelportAuthError extends Error {
  constructor(public readonly status?: number) {
    super(status ? `Travelport OAuth failed with HTTP ${status}.` : "Travelport OAuth failed.");
    this.name = "TravelportAuthError";
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getTravelportAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  const authUrl = process.env.TRAVELPORT_AUTH_URL;
  const username = process.env.TRAVELPORT_USERNAME;
  const password = process.env.TRAVELPORT_PASSWORD;
  const clientId = process.env.TRAVELPORT_CLIENT_ID;
  const clientSecret = process.env.TRAVELPORT_CLIENT_SECRET;

  if (!authUrl || !username || !password || !clientId || !clientSecret) {
    throw new TravelportAuthError();
  }

  const response = await fetchWithTimeout(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      // Current trial identity is provisioned for the client-credentials grant.
      // Username/password remain required by Travelport for this managed identity.
      grant_type: "client_credentials",
      username,
      password,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  }, 5000);

  if (!response.ok) {
    throw new TravelportAuthError(response.status);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new TravelportAuthError(response.status);
  }

  const expiresIn =
    typeof data.expires_in === "number" ? data.expires_in : 86400;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cachedToken.accessToken;
}

export function clearTravelportAuthCache() {
  cachedToken = null;
}
