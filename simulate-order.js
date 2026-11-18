// Sends a signed fake "orders/create" webhook to your local server, exactly like Shopify would.
// Usage: SHOPIFY_API_SECRET=... node scripts/simulate-order.js [total]
import "dotenv/config";
import crypto from "node:crypto";

const secret = process.env.SHOPIFY_API_SECRET;
if (!secret) {
  console.error("Set SHOPIFY_API_SECRET (same value the server uses).");
  process.exit(1);
}
const total = process.argv[2] || "129.90";
const id = Date.now();
const body = JSON.stringify({
  id,
  order_number: 1000 + (id % 1000),
  name: `#${1000 + (id % 1000)}`,
  email: "customer@example.com",
  total_price: total,
  currency: "CAD",
  customer: { first_name: "Alex", email: "customer@example.com" },
  line_items: [
    { title: "Canvas Tote Bag", quantity: 2, price: "29.95" },
    { title: "Enamel Pin", quantity: 1, price: "10.00" },
  ],
});
const hmac = crypto.createHmac("sha256", secret).update(body).digest("base64");

const res = await fetch(`http://localhost:${process.env.PORT || 3000}/webhooks/orders-create`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Webhook-Id": crypto.randomUUID(),
    "X-Shopify-Topic": "orders/create",
  },
  body,
});
console.log(res.status, await res.text());
