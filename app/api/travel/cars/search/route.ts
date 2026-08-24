import { NextResponse } from "next/server";
import { invalidInput, readJson } from "@/lib/travel/http";
import { blockedCarProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.location !== "string" || typeof body.pickupDate !== "string" || typeof body.dropoffDate !== "string") return invalidInput("location, pickupDate, and dropoffDate are required.");
  return NextResponse.json({ provider: "duffel", status: "blocked", options: await blockedCarProvider.searchCars({ location: body.location, pickupDate: body.pickupDate, dropoffDate: body.dropoffDate }), error: { code: "UNAUTHORIZED_VENDOR_ACCESS", message: "Cars vendor access is required.", retryable: false } });
}
