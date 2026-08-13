type SupportedCity = "cairo";
type SupportedUnit = "c" | "f";
type SupportedLanguage = "ar" | "en";

export type WeatherSnapshot = {
  city: SupportedCity;
  cityLabel: string;
  temperature: number | null;
  unit: SupportedUnit;
  condition: string;
  provider: "open-meteo" | "unavailable";
  live: boolean;
  observedAt: string | null;
};

const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 4_000;

const CITY_COORDINATES: Record<SupportedCity, { latitude: number; longitude: number; nameAr: string; nameEn: string }> = {
  cairo: {
    latitude: 30.0444,
    longitude: 31.2357,
    nameAr: "القاهرة",
    nameEn: "Cairo",
  },
};

let cache: Record<string, { expiresAt: number; value: WeatherSnapshot } | undefined> = {};

function toUnit(value: unknown): SupportedUnit {
  return value === "f" ? "f" : "c";
}

function toLanguage(value: unknown): SupportedLanguage {
  return value === "en" ? "en" : "ar";
}

function toCity(value: unknown): SupportedCity {
  return value === "cairo" ? "cairo" : "cairo";
}

function mapCondition(code: number, language: SupportedLanguage): string {
  const ar: Record<number, string> = {
    0: "صحو",
    1: "غائم جزئيا",
    2: "غائم جزئيا",
    3: "غائم",
    45: "ضباب",
    48: "ضباب",
    51: "رذاذ",
    53: "رذاذ",
    55: "رذاذ كثيف",
    61: "أمطار خفيفة",
    63: "أمطار",
    65: "أمطار غزيرة",
    71: "ثلج",
    80: "زخات مطر",
    95: "عاصفة رعدية",
  };
  const en: Record<number, string> = {
    0: "Clear",
    1: "Partly cloudy",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Fog",
    51: "Drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Snow",
    80: "Rain showers",
    95: "Thunderstorm",
  };
  if (language === "ar") {
    return ar[code] ?? "غير متاح";
  }
  return en[code] ?? "Unavailable";
}

function unavailable(city: SupportedCity, unit: SupportedUnit, language: SupportedLanguage): WeatherSnapshot {
  const cityInfo = CITY_COORDINATES[city];
  return {
    city,
    cityLabel: language === "ar" ? cityInfo.nameAr : cityInfo.nameEn,
    temperature: null,
    unit,
    condition: language === "ar" ? "غير متاح" : "Unavailable",
    provider: "unavailable",
    live: false,
    observedAt: null,
  };
}

async function fetchWeather(city: SupportedCity, unit: SupportedUnit, language: SupportedLanguage): Promise<WeatherSnapshot> {
  const cityInfo = CITY_COORDINATES[city];
  const temperatureUnit = unit === "f" ? "fahrenheit" : "celsius";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${cityInfo.latitude}&longitude=${cityInfo.longitude}&current=temperature_2m,weather_code,time&temperature_unit=${temperatureUnit}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      current?: { temperature_2m?: unknown; weather_code?: unknown; time?: unknown };
    } | null;
    if (!response.ok || !payload?.current) {
      return unavailable(city, unit, language);
    }

    const rawTemp = payload.current.temperature_2m;
    const temperature = typeof rawTemp === "number" ? rawTemp : Number(rawTemp);
    const rawCode = payload.current.weather_code;
    const weatherCode = typeof rawCode === "number" ? rawCode : Number(rawCode);
    if (!Number.isFinite(temperature) || !Number.isFinite(weatherCode)) {
      return unavailable(city, unit, language);
    }

    return {
      city,
      cityLabel: language === "ar" ? cityInfo.nameAr : cityInfo.nameEn,
      temperature: Math.round(temperature),
      unit,
      condition: mapCondition(weatherCode, language),
      provider: "open-meteo",
      live: true,
      observedAt: typeof payload.current.time === "string" ? payload.current.time : new Date().toISOString(),
    };
  } catch {
    return unavailable(city, unit, language);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getWeatherSnapshot(input: { city?: unknown; unit?: unknown; language?: unknown } = {}): Promise<WeatherSnapshot> {
  const city = toCity(input.city);
  const unit = toUnit(input.unit);
  const language = toLanguage(input.language);
  const cacheKey = `${city}:${unit}:${language}`;
  const cached = cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await fetchWeather(city, unit, language);
  cache[cacheKey] = {
    value,
    expiresAt: Date.now() + TTL_MS,
  };
  return value;
}

export function clearWeatherCacheForTests() {
  cache = {};
}