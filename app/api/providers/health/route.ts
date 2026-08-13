import { NextResponse } from "next/server";
import { logServerError } from "@/lib/security/safe-logger";
import { getTravelportHealthStatus } from "@/lib/travelport/health";

export async function GET() {
  try {
    const travelport = await getTravelportHealthStatus();

    return NextResponse.json(
      {
        travelport,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    logServerError("api.providers.health.unexpected_error", error);
    return NextResponse.json(
      {
        travelport: {
          provider: "travelport",
          authReachable: false,
          flights: { status: "unavailable" },
          stays: { status: "unavailable" },
        },
      },
      { status: 200 }
    );
  }
}