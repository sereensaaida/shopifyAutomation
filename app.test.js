import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { openDb, listOrders } from "../src/db.js";
import { verifyShopifyWebhook } from "../src/verify.js";

const SECRET = "test-secret";
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("base64");

const payload = {
  id: 987654321,
  name: "#1042",
  email: "buyer@example.com",
  total_price: "620.00",
  currency: "CAD",
  customer: { first_name: "Sam" },
  line_items: [{ title: "Lamp", quantity: 2, price: "310.00" }],
};

async function start() {
  const db = openDb(":memory:");
  const sent = { emails: [], slack: [] };
  const app = createApp({
    db,
    mailer: { send: async (m) => sent.emails.push(m) },
    slack: async (_url, m) => sent.slack.push(m),
    config: { shopifySecret: SECRET, slackUrl: "x", mailFrom: "Shop <a@b.c>", highValueThreshold: 500 },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, sent, base, close: () => server.close() };
}

const post = (base, body, headers = {}) =>
  fetch(`${base}/webhooks/orders-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });

test("verifyShopifyWebhook accepts a valid signature and rejects bad ones", () => {
  const raw = Buffer.from(JSON.stringify(payload));
  assert.equal(verifyShopifyWebhook(raw, sign(raw), SECRET), true);
  assert.equal(verifyShopifyWebhook(raw, sign(raw), "other-secret"), false);
  assert.equal(verifyShopifyWebhook(raw, "not-a-real-signature", SECRET), false);
  assert.equal(verifyShopifyWebhook(raw, undefined, SECRET), false);
});

test("rejects requests with a bad signature", async () => {
  const t = await start();
  const res = await post(t.base, JSON.stringify(payload), { "X-Shopify-Hmac-Sha256": "AAAA" });
  assert.equal(res.status, 401);
  assert.equal(listOrders(t.db).length, 0);
  t.close();
});

test("logs the order, emails the customer, and sends a high-value Slack alert", async () => {
  const t = await start();
  const body = JSON.stringify(payload);
  const res = await post(t.base, body, { "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Webhook-Id": "w-1" });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 50)); // notifications run after the response
  const orders = listOrders(t.db);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "processed");
  assert.equal(orders[0].item_count, 2);
  assert.equal(t.sent.emails[0].to, "buyer@example.com");
  assert.match(t.sent.slack[0].text, /High-value order #1042/);
  t.close();
});

test("ignores duplicate deliveries of the same webhook", async () => {
  const t = await start();
  const body = JSON.stringify(payload);
  const headers = { "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Webhook-Id": "w-dup" };
  await post(t.base, body, headers);
  const second = await post(t.base, body, headers);
  await new Promise((r) => setTimeout(r, 50));
  assert.match((await second.json()).status, /duplicate/);
  assert.equal(listOrders(t.db).length, 1);
  assert.equal(t.sent.emails.length, 1);
  t.close();
});
