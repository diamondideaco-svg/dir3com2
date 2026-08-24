import { NextResponse } from "next/server";
import { travelErrorResponse } from "@/lib/travel/http";
import { refreshDuffelFlightOffer } from "@/lib/travel/duffel/flights";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json(await refreshDuffelFlightOffer(id)); } catch (error) { return travelErrorResponse(error); }
}

export const GET = POST;
