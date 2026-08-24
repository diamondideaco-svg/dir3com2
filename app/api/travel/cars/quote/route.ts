import { invalidInput, readJson, travelErrorResponse } from "@/lib/travel/http";
import { blockedCarProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.offerId !== "string") return invalidInput("offerId is required.");
  try { return Response.json(await blockedCarProvider.quoteCar(body.offerId)); } catch (error) { return travelErrorResponse(error); }
}
