import "dotenv/config";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { createMailer } from "./notify.js";

const config = {
  shopifySecret: process.env.SHOPIFY_API_SECRET,
  slackUrl: process.env.SLACK_WEBHOOK_URL,
  mailFrom: process.env.MAIL_FROM || "Store <orders@example.com>",
  highValueThreshold: Number(process.env.HIGH_VALUE_THRESHOLD) || 500,
};

if (!config.shopifySecret) {
  console.error("Missing SHOPIFY_API_SECRET. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const db = openDb(process.env.DATABASE_PATH);
const mailer = createMailer();
const port = Number(process.env.PORT) || 3000;

createApp({ db, mailer, config }).listen(port, () => {
  console.log(`Listening on http://localhost:${port} (emails: ${mailer.dryRun ? "dry-run" : "SMTP"})`);
});
