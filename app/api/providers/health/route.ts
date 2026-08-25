import { NextResponse } from "next/server";
import { logServerError } from "@/lib/security/safe-logger";
import { getTravelportHealthStatus } from "@/lib/travelport/health";
import { getDuffelHealthStatus } from "@/lib/travel/duffel/health";
import { getLiteApiHealthStatus } from "@/lib/travel/liteapi/health";

export async function GET() {
  try {
    const [travelport, duffel, liteapi] = await Promise.all([
      getTravelportHealthStatus(),
      getDuffelHealthStatus(),
      getLiteApiHealthStatus(),
    ]);

    return NextResponse.json(
      {
        travelport,
        duffel,
        liteapi,
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
        duffel: { provider: "duffel", auth: { status: "unavailable" }, flights: { status: "unavailable" }, stays: { status: "access_blocked" } },
        liteapi: { provider: "liteapi", auth: { status: "unavailable" }, stays: { status: "unavailable" } },
      },
      { status: 200 }
    );
  }
}
