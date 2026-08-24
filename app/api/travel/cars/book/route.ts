import { invalidInput, readJson, travelErrorResponse } from "@/lib/travel/http";
import { blockedCarProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.offerId !== "string" || !body.driver || typeof body.driver !== "object") return invalidInput("offerId and driver are required.");
  try { return Response.json(await blockedCarProvider.createCarBooking({ offerId: body.offerId, driver: body.driver })); } catch (error) { return travelErrorResponse(error); }
}
