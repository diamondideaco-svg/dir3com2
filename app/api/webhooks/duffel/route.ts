import { createHmac, timingSafeEqual } from "node:crypto";
import { logServerError, logServerEvent } from "@/lib/security/safe-logger";
import { getDuffelWebhookEventStore } from "@/lib/travel/duffel/webhook-store";

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

function verifySignature(body: string, signature: string | null, secret: string | undefined, nowMs = Date.now()): boolean {
  if (!secret || !signature) return false;
  const parts = new Map(signature.split(",").map((part) => {
    const normalized = part.trim();
    const separator = normalized.indexOf("=");
    return separator === -1 ? [normalized, ""] : [normalized.slice(0, separator).trim(), normalized.slice(separator + 1).trim()];
  }));
  const timestamp = parts.get("t") || "";
  const supplied = parts.get("v1") || "";
  const timestampSeconds = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const left = Buffer.from(supplied, "hex");
  const signedPayload = `${timestamp}.${body}`;
  const right = createHmac("sha256", secret).update(signedPayload).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-duffel-signature"), process.env.DUFFEL_WEBHOOK_SIGNING_SECRET)) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let event: { id?: unknown; type?: unknown; data?: unknown };
  try { event = JSON.parse(body); } catch { return Response.json({ error: "INVALID_EVENT" }, { status: 400 }); }
  if (!event || typeof event !== "object" || Array.isArray(event)) return Response.json({ error: "INVALID_EVENT" }, { status: 400 });
  const id = typeof event.id === "string" ? event.id : "";
  const type = typeof event.type === "string" ? event.type : "";
  if (!id || !type) return Response.json({ error: "INVALID_EVENT" }, { status: 400 });

  try {
    const claim = await getDuffelWebhookEventStore().claim(id, type);
    if (claim === "duplicate") return Response.json({ accepted: true, duplicate: true }, { status: 200 });
    if (type.startsWith("air.order") || type.startsWith("stays.booking") || type.startsWith("cars.booking")) {
      logServerEvent("webhook.duffel.accepted", { eventId: id, eventType: type });
    } else {
      logServerEvent("webhook.duffel.unknown_event", { eventId: id, eventType: type });
    }
    return Response.json({ accepted: true, duplicate: false }, { status: 200 });
  } catch (error) {
    logServerError("webhook.duffel.handler_error", error, { eventId: id });
    return Response.json({ error: "HANDLER_ERROR" }, { status: 500 });
  }
}
