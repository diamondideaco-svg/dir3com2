import { randomUUID } from "node:crypto";
import { cancelLiteApiBooking, createLiteApiTestBooking, getLiteApiBooking, prebookLiteApiStay, searchLiteApiHotels } from "@/lib/travel/liteapi/stays";

const cities = [
  { city: "Riyadh", country: "SA" },
  { city: "Jeddah", country: "SA" },
  { city: "Dammam", country: "SA" },
  { city: "Madinah", country: "SA" },
  { city: "Makkah", country: "SA" },
  { city: "Cairo", country: "EG" },
  { city: "Alexandria", country: "EG" },
  { city: "Sharm El Sheikh", country: "EG" },
  { city: "Hurghada", country: "EG" },
] as const;

function futureDates(): { checkIn: string; checkOut: string } {
  const checkInDate = new Date(Date.now() + 120 * 86_400_000);
  const checkOutDate = new Date(checkInDate.getTime() + 86_400_000);
  return { checkIn: checkInDate.toISOString().slice(0, 10), checkOut: checkOutDate.toISOString().slice(0, 10) };
}

async function main(): Promise<void> {
const dates = futureDates();
const matrix: Array<Record<string, unknown>> = [];
let bookingCandidate: { rateId: string; city: string } | undefined;

for (const destination of cities) {
  try {
    const result = await searchLiteApiHotels({
      cityName: destination.city,
      countryCode: destination.country,
      ...dates,
      occupancies: [{ adults: 2 }],
      currency: "USD",
      guestNationality: destination.country,
      maxRatesPerHotel: 3,
      sessionId: `dir3com-${destination.country.toLowerCase()}-${destination.city.toLowerCase().replaceAll(" ", "-")}-${dates.checkIn}`,
    });
    const rates = result.hotels.flatMap((hotel) => hotel.rooms.flatMap((room) => room.rates));
    const sample = result.hotels.slice(0, 3).map((hotel) => ({ id: hotel.id, name: hotel.name || "unnamed" }));
    matrix.push({ ...destination, accepted: true, status: result.status, hotelCount: result.hotels.length, rateCount: rates.length, samples: sample });
    if (!bookingCandidate && rates[0]) bookingCandidate = { rateId: rates[0].id, city: destination.city };
  } catch (error) {
    matrix.push({ ...destination, accepted: false, errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN" });
  }
  console.log(JSON.stringify({ type: "coverage", result: matrix.at(-1) }));
}

if (!bookingCandidate) {
  console.log(JSON.stringify({ type: "lifecycle", status: "BLOCKED", reason: "NO_BOOKABLE_RATE" }));
  process.exitCode = 2;
} else {
  const prebook = await prebookLiteApiStay({ rateId: bookingCandidate.rateId });
  const suffix = randomUUID();
  const clientReference = `dir3com-sandbox-${suffix}`;
  const guest = { firstName: "DIR3COM", lastName: "Sandbox", email: `dir3com-sandbox+${suffix}@example.com`, occupancyNumber: 1 };
  const booking = await createLiteApiTestBooking({ prebookId: prebook.id, clientReference, holder: guest, guests: [guest] });
  const replay = await createLiteApiTestBooking({ prebookId: prebook.id, clientReference, holder: guest, guests: [guest] });
  const retrieved = await getLiteApiBooking(booking.id);
  const cancellation = await cancelLiteApiBooking(booking.id);
  const finalBooking = await getLiteApiBooking(booking.id);
  console.log(JSON.stringify({ type: "lifecycle", status: "PASS", city: bookingCandidate.city, prebook: true, priceChanged: prebook.priceChanged, bookingStatus: booking.status, replaySameBooking: replay.id === booking.id, retrievalStatus: retrieved.status, cancellationStatus: cancellation.status, finalStatus: finalBooking.status }));
}
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ type: "fatal", code: error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN", message: error instanceof Error ? error.message : "LiteAPI smoke failed." }));
  process.exitCode = 1;
});
