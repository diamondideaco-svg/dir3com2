import { NextResponse } from "next/server";
import { readJson, invalidInput, travelErrorResponse } from "@/lib/travel/http";
import { searchDuffelFlights } from "@/lib/travel/duffel/search";

function stringField(body: Record<string, unknown>, key: string) { return typeof body[key] === "string" ? body[key] as string : ""; }

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return invalidInput("A JSON request body is required.");
  const from = stringField(body, "from") || stringField(body, "origin");
  const to = stringField(body, "to") || stringField(body, "destination");
  const departureDate = stringField(body, "departureDate");
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return invalidInput("from, to, and departureDate are required.");
  try { return NextResponse.json(await searchDuffelFlights({ from, to, departureDate, returnDate: stringField(body, "returnDate") || undefined, cabin: stringField(body, "cabin") || undefined, adults: typeof body.adults === "number" ? body.adults : 1 })); } catch (error) { return travelErrorResponse(error); }
}
