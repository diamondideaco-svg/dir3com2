import { NextResponse } from "next/server";
import { TravelProviderError } from "./errors";

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function invalidInput(message: string) {
  return NextResponse.json({ error: { code: "INVALID_INPUT", message } }, { status: 400 });
}

export function travelErrorResponse(error: unknown) {
  if (error instanceof TravelProviderError) {
    const status = error.code === "UNAUTHORIZED_VENDOR_ACCESS" || error.code === "LIVE_MUTATION_FORBIDDEN" ? 403 : 502;
    return NextResponse.json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status });
  }
  return NextResponse.json({ error: { code: "PROVIDER_UNAVAILABLE", message: "Travel provider is temporarily unavailable.", retryable: true } }, { status: 502 });
}
