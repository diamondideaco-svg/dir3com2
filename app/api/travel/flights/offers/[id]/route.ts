import { NextResponse } from "next/server";
import { travelErrorResponse } from "@/lib/travel/http";
import { getDuffelFlightOffer } from "@/lib/travel/duffel/flights";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json(await getDuffelFlightOffer(id)); } catch (error) { return travelErrorResponse(error); }
}
