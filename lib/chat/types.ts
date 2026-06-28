export type Role = "user" | "ruki";

export interface ChatMessage {
  role: Role;
  text: string;
}

export interface ProductSummarySnippet {
  id: string;
  name: string;
  price: { amount: number | null; currency: string };
  compare_at_price?: { amount: number | null; currency: string } | null;
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

export interface TrackResult {
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
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "clear_text" }
  | { type: "products"; products: ProductSummarySnippet[]; label?: string }
  | { type: "status"; label: string }
  | { type: "widget"; widget: WidgetType; data?: Record<string, unknown> }
  | { type: "url"; url: string; title: string }
  | { type: "track_result"; data: TrackResult }
  | { type: "done" };
