import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { POST, clearDuffelWebhookEvents } from "@/app/api/webhooks/duffel/route";

test.beforeEach(() => { process.env.DUFFEL_WEBHOOK_SIGNING_SECRET = "webhook-secret"; clearDuffelWebhookEvents(); });
test.afterEach(() => { delete process.env.DUFFEL_WEBHOOK_SIGNING_SECRET; });

function signed(body: string) { return createHmac("sha256", "webhook-secret").update(body).digest("hex"); }
function request(body: string, signature = signed(body)) { return new Request("http://localhost/api/webhooks/duffel", { method: "POST", headers: { "x-duffel-signature": signature }, body }); }

test("accepts a valid event and deduplicates it", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "air.order.created", data: {} });
  assert.equal((await POST(request(body))).status, 200);
  const duplicate = await POST(request(body));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
});

test("rejects invalid signatures and tolerates unknown events", async () => {
  assert.equal((await POST(request("{}", "bad"))).status, 401);
  const body = JSON.stringify({ id: "evt_2", type: "future.event", data: {} });
  assert.equal((await POST(request(body))).status, 200);
});
