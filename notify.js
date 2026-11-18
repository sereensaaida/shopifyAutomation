import nodemailer from "nodemailer";

function money(total, currency) {
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(total);
  } catch {
    return `${total.toFixed(2)} ${currency}`;
  }
}

export function buildEmail(order, from) {
  const lines = order.items.map((i) => `  - ${i.quantity} x ${i.title}`).join("\n");
  return {
    from,
    to: order.email,
    subject: `Order ${order.name} confirmed`,
    text:
      `Hi ${order.first_name},\n\n` +
      `Thanks for your order ${order.name}! Here is what we received:\n\n${lines}\n\n` +
      `Total: ${money(order.total, order.currency)}\n\n` +
      `We'll email you again when it ships.\n`,
  };
}

/** With no SMTP_HOST set, emails are printed instead of sent, so you can demo without an email account. */
export function createMailer(env = process.env) {
  if (!env.SMTP_HOST) {
    return {
      dryRun: true,
      async send(message) {
        console.log("[email dry-run]", JSON.stringify(message, null, 2));
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return { dryRun: false, send: (message) => transport.sendMail(message) };
}

export function buildSlackMessage(order, threshold) {
  const big = order.total >= threshold;
  return {
    text:
      `${big ? "High-value order" : "New order"} ${order.name}: ` +
      `${money(order.total, order.currency)} (${order.item_count} item${order.item_count === 1 ? "" : "s"})`,
  };
}

export async function sendSlack(url, message) {
  if (!url) {
    console.log("[slack dry-run]", message.text);
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Slack responded ${res.status}`);
}
