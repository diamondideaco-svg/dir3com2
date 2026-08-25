import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { POST } from "@/app/api/webhooks/duffel/route";
import { setDuffelWebhookEventStoreForTests } from "@/lib/travel/duffel/webhook-store";

test.beforeEach(() => {
  process.env.DUFFEL_WEBHOOK_SIGNING_SECRET = "webhook-secret";
  const seen = new Set<string>();
  setDuffelWebhookEventStoreForTests({ async claim(id) { if (seen.has(id)) return "duplicate"; seen.add(id); return "claimed"; } });
});
test.afterEach(() => { delete process.env.DUFFEL_WEBHOOK_SIGNING_SECRET; setDuffelWebhookEventStoreForTests(); });

function signed(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "webhook-secret").update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
function request(body: string, signature = signed(body)) { return new Request("http://localhost/api/webhooks/duffel", { method: "POST", headers: { "x-duffel-signature": signature }, body }); }

test("accepts a valid event and deduplicates it", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "ping.triggered", data: {} });
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

test("rejects stale signed payloads", async () => {
  const body = JSON.stringify({ id: "evt_stale", type: "ping.triggered", data: {} });
  const timestamp = String(Math.floor(Date.now() / 1000) - 301);
  const signature = createHmac("sha256", "webhook-secret").update(`${timestamp}.${body}`).digest("hex");
  assert.equal((await POST(request(body, `t=${timestamp},v1=${signature}`))).status, 401);
});

test("rejects malformed and null events as INVALID_EVENT", async () => {
  for (const body of ["{", "null", "[]", "{}", JSON.stringify({ id: "evt" })]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "INVALID_EVENT");
  }
});

test("fails closed when durable dedup storage is unavailable", async () => {
  setDuffelWebhookEventStoreForTests({ async claim() { throw new Error("offline"); } });
  const body = JSON.stringify({ id: "evt_store", type: "ping.triggered", data: {} });
  assert.equal((await POST(request(body))).status, 500);
});
