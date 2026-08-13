import { NextRequest, NextResponse } from "next/server";
import { convertCurrency } from "@/lib/currency/service";
import { logServerError } from "@/lib/security/safe-logger";
import { getWeatherSnapshot } from "@/lib/weather/service";

function parseLanguage(value: string | null): "ar" | "en" {
  return value === "en" ? "en" : "ar";
}

function parseCurrency(value: string | null): "SAR" | "EGP" | "USD" | "EUR" | "AED" {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "SAR" || normalized === "EGP" || normalized === "EUR" || normalized === "AED") {
    return normalized;
  }
  return "USD";
}

export async function GET(request: NextRequest) {
  try {
    const language = parseLanguage(request.nextUrl.searchParams.get("lang"));
    const targetCurrency = parseCurrency(request.nextUrl.searchParams.get("currency"));

    const [weather, fx] = await Promise.all([
      getWeatherSnapshot({ city: "cairo", unit: "c", language }),
      convertCurrency({ amount: 1, sourceCurrency: "USD", targetCurrency }),
    ]);

    return NextResponse.json(
      {
        weather,
        fx: {
          available: fx.ok,
          quote: fx.quote,
          message:
            fx.ok
              ? null
              : language === "ar"
                ? "سعر الصرف غير متاح حاليا"
                : "FX rate is currently unavailable",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    logServerError("api.public.runtime.unexpected_error", error);
    return NextResponse.json(
      {
        weather: {
          city: "cairo",
          cityLabel: "Cairo",
          temperature: null,
          unit: "c",
          condition: "Unavailable",
          provider: "unavailable",
          live: false,
          observedAt: null,
        },
        fx: {
          available: false,
          quote: null,
          message: "Unavailable",
        },
      },
      { status: 200 }
    );
  }
}