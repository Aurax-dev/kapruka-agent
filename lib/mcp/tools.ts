import { callTool } from "./client";
import { parseSearchResponse, parseProductDetail, type SearchResponse, type ProductDetail } from "./types";

export interface SearchArgs {
  q: string;
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: string;
  currency?: string;
  cursor?: string;
}

export async function searchProducts(args: SearchArgs): Promise<SearchResponse> {
  const params: Record<string, unknown> = { q: args.q, response_format: "json" };
  if (args.limit !== undefined) params.limit = args.limit;
  if (args.category) params.category = args.category;
  if (args.minPrice !== undefined) params.min_price = args.minPrice;
  if (args.maxPrice !== undefined) params.max_price = args.maxPrice;
  if (args.inStockOnly !== undefined) params.in_stock_only = args.inStockOnly;
  if (args.sort) params.sort = args.sort;
  if (args.currency) params.currency = args.currency;
  if (args.cursor) params.cursor = args.cursor;
  return parseSearchResponse(await callTool("kapruka_search_products", params));
}

export async function getProduct(id: string, currency = "LKR"): Promise<ProductDetail> {
  return parseProductDetail(
    await callTool("kapruka_get_product", { product_id: id, currency, response_format: "json" }),
  );
}

export async function listCategories(): Promise<{ name: string; url: string }[]> {
  const raw = await callTool("kapruka_list_categories", { depth: 1, response_format: "json" });
  const parsed = JSON.parse(raw) as { categories?: { name: string; url: string }[] };
  return parsed.categories ?? [];
}

export async function listDeliveryCities(query: string, limit = 25): Promise<{ name: string; aliases: string[] }[]> {
  const raw = await callTool("kapruka_list_delivery_cities", { query, limit, response_format: "json" });
  const parsed = JSON.parse(raw) as { cities?: { name: string; aliases: string[] }[] };
  return parsed.cities ?? [];
}

export async function checkDelivery(city: string, date?: string, productId?: string) {
  const params: Record<string, unknown> = { city, response_format: "json" };
  if (date) params.delivery_date = date;
  if (productId) params.product_id = productId;
  const raw = await callTool("kapruka_check_delivery", params, { cache: false });
  try {
    return JSON.parse(raw) as {
      available: boolean;
      rate: number;
      reason: string | null;
      next_available_date: string | null;
      perishable_warning: string | null;
    };
  } catch {
    throw new Error(`check_delivery returned a non-JSON response: ${raw.slice(0, 200)}`);
  }
}

export type CartItemInput = { product_id: string; quantity: number; variant_id?: string };
export type OrderRecipient = { name: string; phone: string };
// The Kapruka MCP Sender model only carries the gift-card name (+ an optional
// anonymous flag) and is declared `extra="forbid"`. Any phone/email collected
// from the sender is for our own contact UI only and must NOT be forwarded.
export type OrderSender = { name: string; anonymous?: boolean };

export async function createOrder(args: {
  cart: CartItemInput[];
  recipient: OrderRecipient;
  delivery: { date: string; address: string; city: string; instructions?: string };
  sender: OrderSender & { phone?: string; email?: string };
  gift_message?: string;
  currency?: string;
}): Promise<{
  checkout_url: string;
  order_ref: string;
  summary: { items_total: number; delivery_fee: number; addons_total: number; grand_total: number; currency: string };
  expires_at: string;
}> {
  // Strip any extra sender fields (phone/email) the model may have collected —
  // the server rejects them with a validation error.
  const sender: OrderSender = { name: args.sender.name };
  if (args.sender.anonymous !== undefined) sender.anonymous = args.sender.anonymous;

  const raw = await callTool(
    "kapruka_create_order",
    { ...args, sender, response_format: "json" },
    { cache: false },
  );
  // The MCP backend sometimes returns a plain-text error (e.g. "Error (...)")
  // instead of JSON. Surface it as a clear message rather than a cryptic
  // "Unexpected token" SyntaxError so the agent loop can report it usefully.
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`create_order returned a non-JSON response: ${raw.slice(0, 200)}`);
  }
}

export async function trackOrder(order_number: string): Promise<{
  order_number: string;
  status: string;
  status_display: string;
  order_date: string;
  delivery_date: string;
  shipped_date: string | null;
  amount: string;
  payment_method: string;
  comments: string | null;
  recipient: { name: string; phone: string; address: string; city: string };
  greeting_message: string | null;
  special_instructions: string | null;
  progress: { step: string; timestamp: string }[];
  live_tracking_available: boolean;
  has_delivery_video: boolean;
  has_delivery_photo: boolean;
  items: { product_id: string; name: string; quantity: number; selling_price: number }[];
}> {
  const raw = await callTool("kapruka_track_order", { order_number, response_format: "json" }, { cache: false });
  return JSON.parse(raw);
}
