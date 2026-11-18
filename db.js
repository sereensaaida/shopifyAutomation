import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDb(file = "./data/orders.db") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_id    TEXT NOT NULL UNIQUE,
      name          TEXT,
      email         TEXT,
      total         REAL,
      currency      TEXT,
      item_count    INTEGER,
      status        TEXT NOT NULL DEFAULT 'received',
      received_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      webhook_id    TEXT PRIMARY KEY,
      topic         TEXT,
      received_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** True if this webhook delivery was already processed (Shopify can retry or duplicate deliveries). */
export function seenWebhook(db, webhookId) {
  if (!webhookId) return false;
  return !!db.prepare("SELECT 1 FROM webhook_events WHERE webhook_id = ?").get(webhookId);
}

export function markWebhook(db, webhookId, topic) {
  if (!webhookId) return;
  db.prepare("INSERT OR IGNORE INTO webhook_events (webhook_id, topic) VALUES (?, ?)").run(webhookId, topic ?? null);
}

export function saveOrder(db, order) {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO orders (shopify_id, name, email, total, currency, item_count)
       VALUES (@shopify_id, @name, @email, @total, @currency, @item_count)`
    )
    .run({
      shopify_id: order.shopify_id,
      name: order.name,
      email: order.email,
      total: order.total,
      currency: order.currency,
      item_count: order.item_count,
    });
  return info.changes === 1; // false => this order id was already logged
}

export function setStatus(db, shopifyId, status) {
  db.prepare("UPDATE orders SET status = ? WHERE shopify_id = ?").run(status, String(shopifyId));
}

export function listOrders(db, limit = 50) {
  return db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?").all(limit);
}
