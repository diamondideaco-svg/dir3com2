import { supabaseAdmin } from "@/lib/supabase/server";

export type WebhookClaimResult = "claimed" | "duplicate";
export type DuffelWebhookEventStore = { claim(eventId: string, eventType: string): Promise<WebhookClaimResult> };

const durableStore: DuffelWebhookEventStore = {
  async claim(eventId, eventType) {
    if (!supabaseAdmin) throw new Error("Durable webhook store is unavailable.");
    const { error } = await supabaseAdmin.from("travel_provider_webhook_events").insert({
      provider: "duffel",
      event_id: eventId,
      event_type: eventType,
    });
    if (!error) return "claimed";
    if (error.code === "23505") return "duplicate";
    throw new Error("Durable webhook claim failed.");
  },
};

let store: DuffelWebhookEventStore = durableStore;

export function getDuffelWebhookEventStore(): DuffelWebhookEventStore { return store; }

export function setDuffelWebhookEventStoreForTests(next?: DuffelWebhookEventStore): void {
  if (process.env.NODE_ENV === "production") throw new Error("Webhook store overrides are test-only.");
  store = next || durableStore;
}
