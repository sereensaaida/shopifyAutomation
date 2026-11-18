import crypto from "node:crypto";

/**
 * Verifies the X-Shopify-Hmac-Sha256 header.
 * Shopify signs the RAW request body with your app's client secret (HMAC-SHA256, base64).
 * `rawBody` must be the untouched Buffer, not parsed JSON.
 */
export function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!rawBody || !hmacHeader || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(hmacHeader, "base64");
  // timingSafeEqual throws if lengths differ, so check first
  return received.length === digest.length && crypto.timingSafeEqual(received, digest);
}
