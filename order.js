/** Turns Shopify's orders/create payload into the small shape we store and notify with. */
export function normalizeOrder(payload) {
  const items = Array.isArray(payload.line_items) ? payload.line_items : [];
  const customer = payload.customer || {};
  return {
    shopify_id: String(payload.id),
    name: payload.name || `#${payload.order_number ?? payload.id}`,
    email: payload.email || customer.email || null,
    total: Number.parseFloat(payload.total_price ?? "0") || 0,
    currency: payload.currency || "USD",
    item_count: items.reduce((n, i) => n + (Number(i.quantity) || 0), 0),
    first_name: customer.first_name || "there",
    items: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
  };
}
