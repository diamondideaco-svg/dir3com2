import { NextResponse } from "next/server";
import { travelErrorResponse } from "@/lib/travel/http";
import { getDuffelFlightOrder } from "@/lib/travel/duffel/flights";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json(await getDuffelFlightOrder(id)); } catch (error) { return travelErrorResponse(error); }
}
