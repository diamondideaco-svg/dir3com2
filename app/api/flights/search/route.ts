import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/security/safe-logger";
import { SabreAuthError } from "@/lib/sabre/auth";
import { SabreProviderError } from "@/lib/sabre/client";
import { SabreValidationError, searchSabreFlights } from "@/lib/sabre/search";

function parseInput(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new SabreValidationError("Invalid request payload.");
  }

  const typed = body as Record<string, unknown>;
  const origin = typeof typed.origin === "string" ? typed.origin : "";
  const destination = typeof typed.destination === "string" ? typed.destination : "";
  const departureDate = typeof typed.departureDate === "string" ? typed.departureDate : "";
  const adults = typeof typed.adults === "number" ? typed.adults : Number(typed.adults);

  return {
    origin,
    destination,
    departureDate,
    adults,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const result = await searchSabreFlights(parseInput(body));

    return NextResponse.json(
      {
        searchType: "informational",
        provider: result.provider,
        environment: result.environment,
        itineraryCount: result.itineraryCount,
        itineraries: result.itineraries,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof SabreValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SabreAuthError) {
      return NextResponse.json({ error: "Flight provider is temporarily unavailable." }, { status: 503 });
    }
    if (error instanceof SabreProviderError) {
      const status = error.status === 401 || error.status === 403 ? 503 : 502;
      return NextResponse.json({ error: "Flight search is currently unavailable." }, { status });
    }

    logServerError("api.flights.search.unexpected_error", error);
    return NextResponse.json({ error: "Flight search is currently unavailable." }, { status: 500 });
  }
}