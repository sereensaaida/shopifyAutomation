# Shopify Order Automation

A small Node.js service that reacts to new Shopify orders in real time. When a store receives an order, Shopify sends an `orders/create` webhook. This service:

1. **Verifies** the request really came from Shopify (HMAC-SHA256 signature check on the raw body)
2. **Ignores duplicates**, since Shopify can deliver the same webhook more than once
3. **Logs** the order to a SQLite database
4. **Emails** the customer a confirmation
5. **Alerts** the team in Slack, flagging high-value orders

It replies to Shopify immediately and does the email and Slack work afterwards, because Shopify expects a fast `2xx` response.

## Tech

Node.js (ESM) · Express · SQLite (`better-sqlite3`) · Nodemailer · Slack incoming webhooks · Node's built-in test runner

## Run it locally

```bash
npm install
cp .env.example .env      # set SHOPIFY_API_SECRET at minimum
npm start
```

With no SMTP or Slack settings, emails and alerts are printed to the console (dry run), so you can demo it without any accounts.

In a second terminal, send a signed fake order exactly like Shopify would:

```bash
npm run simulate           # or: npm run simulate -- 750   (high-value alert)
curl localhost:3000/orders # see what was logged
```

Run the tests:

```bash
npm test
```

## Connect it to a real Shopify dev store

1. Create a free [Shopify Partner](https://www.shopify.com/partners) account and a development store.
2. Create an app and copy its **client secret** into `SHOPIFY_API_SECRET`.
3. Expose your local server with a tunnel (for example `ngrok http 3000` or Cloudflare Tunnel).
4. Subscribe to the topic with the Admin GraphQL API (or declare it in your app config with the Shopify CLI):

```graphql
mutation {
  webhookSubscriptionCreate(
    topic: ORDERS_CREATE
    webhookSubscription: {
      callbackUrl: "https://YOUR-TUNNEL-URL/webhooks/orders-create"
      format: JSON
    }
  ) {
    webhookSubscription { id }
    userErrors { field message }
  }
}
```

5. Place a test order in your dev store and watch the logs.

Note: order payloads include customer details, which Shopify treats as protected customer data. It works on your own dev store, but check Shopify's docs on protected customer data before using it in a public app.

## Project layout

```
src/verify.js   HMAC signature verification
src/db.js       SQLite schema + queries (orders, processed webhook ids)
src/order.js    Normalizes the Shopify payload
src/notify.js   Email + Slack message builders and senders
src/app.js      Express routes (dependency-injected, easy to test)
src/server.js   Entry point
test/           Signature, logging, notification, and duplicate tests
scripts/        simulate-order.js sends a signed fake webhook
```

## Design notes

- **Raw body for HMAC.** The route uses `express.raw` because parsing JSON first changes the bytes and breaks the signature.
- **Constant-time comparison** (`crypto.timingSafeEqual`) avoids leaking signature information.
- **Idempotency.** The webhook id and the order id are both de-duplicated, so retries never send two emails.
- **Failures don't lose orders.** The order is saved before notifications run; if email or Slack fails, the row is marked `notify_failed`.

## Ideas to extend

- Fetch extra order data through the Admin GraphQL API
- Add `orders/paid` and `orders/fulfilled` handlers
- Replace SQLite with Postgres and add a retry queue for failed notifications
