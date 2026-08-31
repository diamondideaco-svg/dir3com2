import { NextResponse } from "next/server";
import { logServerError } from "@/lib/security/safe-logger";
import { getTravelportHealthStatus } from "@/lib/travelport/health";
import { getDuffelHealthStatus } from "@/lib/travel/duffel/health";
import { getLiteApiHealthStatus } from "@/lib/travel/liteapi/health";
import { getCarTrawlerHealth } from "@/lib/travel/cartrawler/health";
import { getViatorHealth } from "@/lib/travel/viator/health";
import { syntheticVipPartnerConfig } from "@/lib/travel/vip/config";

export async function GET() {
  try {
    const [travelport, duffel, liteapi] = await Promise.all([
      getTravelportHealthStatus(),
      getDuffelHealthStatus(),
      getLiteApiHealthStatus(),
    ]);
    const drive = getCarTrawlerHealth();
    const concierge = getViatorHealth();
    const vip = { provider: "vip-local-egypt", status: syntheticVipPartnerConfig.status === "ACTIVE_TEST_ONLY" ? "ok" : "access_blocked", mode: "local_test", verificationStatus: syntheticVipPartnerConfig.verificationStatus };

    return NextResponse.json(
      {
        travelport,
        duffel,
        liteapi,
        drive,
        concierge,
        vip,
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
        drive: { provider: "cartrawler", status: "blocked", code: "UNAUTHORIZED_VENDOR_ACCESS" },
        concierge: { status: "access_blocked", code: "UNAUTHORIZED_VENDOR_ACCESS" },
        vip: { provider: "vip-local-egypt", status: "access_blocked", mode: "local_test", verificationStatus: "UNVERIFIED" },
      },
      { status: 200 }
    );
  }
}
