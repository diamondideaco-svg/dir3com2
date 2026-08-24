import { invalidInput, readJson, travelErrorResponse } from "@/lib/travel/http";
import { blockedStayProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.rateId !== "string" || !Array.isArray(body.guests)) return invalidInput("rateId and guests are required.");
  try { return Response.json(await blockedStayProvider.createStayBooking({ rateId: body.rateId, guests: body.guests })); } catch (error) { return travelErrorResponse(error); }
}
