import { NextResponse } from "next/server";
import { invalidInput, readJson, travelErrorResponse } from "@/lib/travel/http";
import { blockedStayProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.location !== "string" || typeof body.checkIn !== "string" || typeof body.checkOut !== "string") return invalidInput("location, checkIn, and checkOut are required.");
  try { return NextResponse.json(await blockedStayProvider.searchStays({ location: body.location, checkIn: body.checkIn, checkOut: body.checkOut })); } catch (error) { return travelErrorResponse(error); }
}
