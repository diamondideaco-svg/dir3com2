import { invalidInput, readJson, travelErrorResponse } from "@/lib/travel/http";
import { blockedStayProvider } from "@/lib/travel/blocked-providers";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body.rateId !== "string") return invalidInput("rateId is required.");
  try { return Response.json(await blockedStayProvider.getStayQuote(body.rateId)); } catch (error) { return travelErrorResponse(error); }
}
