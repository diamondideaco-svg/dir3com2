import { getTravelportAccessToken } from "./auth";

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function travelportRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = await getTravelportAccessToken();

  const baseUrl =
    process.env.TRAVELPORT_API_BASE_URL ||
    "https://api.pp.travelport.net/";

  const accessGroup = process.env.TRAVELPORT_ACCESS_GROUP;
  const pcc = process.env.TRAVELPORT_PCC;

  if (!accessGroup && !pcc) {
    throw new Error("Missing Travelport access group or PCC");
  }

  const url = new URL(endpoint, baseUrl).toString();

  const response = await fetchWithTimeout(url, {
    ...options,

    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Cache-Control": "no-cache",
      TraceId: `TraceID-dir3com-${Date.now()}`,
      ...(accessGroup
        ? { XAUTH_TRAVELPORT_ACCESSGROUP: accessGroup }
        : { "TVP-PCC-CORE": pcc! }),

      ...(options.headers || {}),
    },

    cache: "no-store",
  }, 7000);

  const text = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) throw new TravelportApiError(response.status, data);

  return data;
}

export class TravelportApiError extends Error {
  constructor(public readonly status: number, public readonly evidence: unknown) {
    super(`Travelport API failed with HTTP ${status}`);
    this.name = "TravelportApiError";
  }
}
