import { createHmac, timingSafeEqual } from "node:crypto";
import { logServerError, logServerEvent } from "@/lib/security/safe-logger";

const seenEvents = new Set<string>();

function verifySignature(body: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  const supplied = signature.includes("=") ? signature.split("=").pop() || "" : signature;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(supplied, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-duffel-signature"), process.env.DUFFEL_WEBHOOK_SIGNING_SECRET)) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let event: { id?: unknown; type?: unknown; data?: unknown };
  try { event = JSON.parse(body); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const id = typeof event.id === "string" ? event.id : "";
  if (!id) return Response.json({ error: "INVALID_EVENT" }, { status: 400 });
  if (seenEvents.has(id)) return Response.json({ accepted: true, duplicate: true }, { status: 200 });
  seenEvents.add(id);

  try {
    const type = typeof event.type === "string" ? event.type : "unknown";
    if (type.startsWith("air.order") || type.startsWith("stays.booking") || type.startsWith("cars.booking")) {
      logServerEvent("webhook.duffel.accepted", { eventId: id, eventType: type });
    } else {
      logServerEvent("webhook.duffel.unknown_event", { eventId: id, eventType: type });
    }
    return Response.json({ accepted: true, duplicate: false }, { status: 200 });
  } catch (error) {
    logServerError("webhook.duffel.handler_error", error, { eventId: id });
    seenEvents.delete(id);
    return Response.json({ error: "HANDLER_ERROR" }, { status: 500 });
  }
}

export function clearDuffelWebhookEvents() { seenEvents.clear(); }
