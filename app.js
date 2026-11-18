import express from "express";
import { verifyShopifyWebhook } from "./verify.js";
import { normalizeOrder } from "./order.js";
import { saveOrder, setStatus, seenWebhook, markWebhook, listOrders } from "./db.js";
import { buildEmail, buildSlackMessage, sendSlack } from "./notify.js";

/** Builds the Express app. Dependencies are injected so tests can swap in fakes. */
export function createApp({ db, mailer, config, slack = sendSlack }) {
  const app = express();

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Handy for demos: see what has been logged so far
  app.get("/orders", (_req, res) => res.json(listOrders(db)));

  // express.raw keeps the exact bytes Shopify signed. Parsing to JSON first would break the HMAC check.
  app.post("/webhooks/orders-create", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    if (!verifyShopifyWebhook(req.body, hmac, config.shopifySecret)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    const webhookId = req.get("X-Shopify-Webhook-Id");
    if (seenWebhook(db, webhookId)) {
      return res.status(200).json({ status: "duplicate delivery ignored" });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "bad json" });
    }

    const order = normalizeOrder(payload);
    const isNew = saveOrder(db, order);
    markWebhook(db, webhookId, req.get("X-Shopify-Topic"));
    if (!isNew) return res.status(200).json({ status: "order already logged" });

    // Shopify expects a 2xx within a few seconds, so reply first and do the slow work afterwards.
    res.status(200).json({ status: "accepted", order: order.name });

    const results = await Promise.allSettled([
      order.email ? mailer.send(buildEmail(order, config.mailFrom)) : Promise.resolve(),
      slack(config.slackUrl, buildSlackMessage(order, config.highValueThreshold)),
    ]);
    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((f) => console.error("notification failed:", f.reason?.message || f.reason));
    setStatus(db, order.shopify_id, failed.length ? "notify_failed" : "processed");
  });

  return app;
}
