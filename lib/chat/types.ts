export type Role = "user" | "ruki";

export interface ChatMessage {
  role: Role;
  text: string;
}

export interface ProductSummarySnippet {
  id: string;
  name: string;
  price: { amount: number | null; currency: string };
  image_url: string | null;
  images?: string[];
  in_stock: boolean;
  url: string;
  summary: string;
}

export type CartItem = {
  product_id: string;
  name: string;
  image_url: string | null;
  price: { amount: number | null; currency: string };
  quantity: number;
  variant_id?: string;
};

export type WidgetType =
  | "city_date"
  | "recipient"
  | "sender"
  | "gift_message"
  | "track_order"
  | "pay_url"
  | "saved_address";

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "clear_text" }
  | { type: "products"; products: ProductSummarySnippet[]; label?: string }
  | { type: "status"; label: string }
  | { type: "widget"; widget: WidgetType; data?: Record<string, unknown> }
  | { type: "url"; url: string; title: string }
  | { type: "done" };
