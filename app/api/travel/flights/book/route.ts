import { NextResponse } from "next/server";
import { readJson, invalidInput, travelErrorResponse } from "@/lib/travel/http";
import { createDuffelFlightBooking } from "@/lib/travel/duffel/flights";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.offerId !== "string" || !Array.isArray(body.passengers) || body.passengers.length === 0) return invalidInput("offerId and passengers are required.");
  try { return NextResponse.json(await createDuffelFlightBooking({ offerId: body.offerId, passengers: body.passengers, idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined })); } catch (error) { return travelErrorResponse(error); }
}
