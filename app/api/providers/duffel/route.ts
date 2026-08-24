import { NextResponse } from "next/server";

import { logServerError } from "@/lib/security/safe-logger";
import { searchDuffelFlights } from "@/lib/travel/duffel/search";

type DuffelOperation = "flightSearch";

function parseOperation(value: string | null): DuffelOperation | null {
  if (value === "flightSearch") return "flightSearch";
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const operation = parseOperation(searchParams.get("operation"));

  if (!operation) {
    return NextResponse.json(
      { error: "INVALID_OPERATION", message: "Unsupported Duffel operation." },
      { status: 400 }
    );
  }

  try {
    const from = searchParams.get("from") || "CAI";
    const to = searchParams.get("to") || "RUH";
    const departureDate = searchParams.get("departureDate") || "2026-08-20";

    if (operation === "flightSearch") {
      const result = await searchDuffelFlights({ from, to, departureDate });
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(
      { error: "UNSUPPORTED_OPERATION", message: "Unsupported Duffel operation." },
      { status: 400 }
    );
  } catch (error) {
    logServerError("api.providers.duffel.unexpected_error", error);
    return NextResponse.json(
      {
        provider: "duffel",
        status: "unavailable",
        offers: [],
      },
      { status: 200 }
    );
  }
}