import { TravelProviderError } from "../errors";

export class CarTrawlerAccessBlockedError extends Error {
  constructor() { super("CarTrawler staging access is not configured."); this.name = "CarTrawlerAccessBlockedError"; }
}

export class CarTrawlerApiError extends Error {
  constructor(public readonly status: number, public readonly evidence: unknown) { super(`CarTrawler API failed with HTTP ${status}`); this.name = "CarTrawlerApiError"; }
}

export function getCarTrawlerConfig() {
  return { token: process.env.CARTRAWLER_PARTNER_TOKEN, partnerId: process.env.CARTRAWLER_PARTNER_ID, baseUrl: process.env.CARTRAWLER_API_BASE_URL, environment: process.env.CARTRAWLER_ENV || "staging" };
}

export async function cartrawlerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getCarTrawlerConfig();
  if (!config.token || !config.partnerId || !config.baseUrl) throw new CarTrawlerAccessBlockedError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let response: Response;
    try {
      response = await fetch(new URL(path, config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`), { ...init, signal: controller.signal, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, "X-Mobility-Partner": config.partnerId, ...(init.headers || {}) }, cache: "no-store" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new TravelProviderError("PROVIDER_TIMEOUT", "CarTrawler request timed out.", true);
      throw new TravelProviderError("PROVIDER_UNAVAILABLE", "CarTrawler is unavailable.", true);
    }
    const text = await response.text();
    let evidence: unknown = text;
    try { evidence = JSON.parse(text); } catch { /* preserve non-JSON vendor evidence */ }
    if (!response.ok) throw new CarTrawlerApiError(response.status, evidence);
    return evidence as T;
  } finally { clearTimeout(timer); }
}