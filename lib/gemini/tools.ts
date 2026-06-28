import { Type } from "@google/genai";
import type { Tool } from "@google/genai";

export const GEMINI_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_products",
        description:
          "Search Kapruka's catalog for products matching a keyword query. Use short, direct product-type terms (1–2 words): 'skincare', 'perfume', 'watch', 'headphones'. Avoid long descriptive phrases — 'skincare hamper for mom' makes the search anchor on 'hamper' and returns unrelated results. Call multiple times with different product types to cover broad requests.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            q: { type: Type.STRING, description: "Product type keyword — short and direct, e.g. 'skincare', 'watch', 'perfume'. Avoid multi-word gift phrases." },
            limit: { type: Type.NUMBER, description: "Number of results (1-12). Default 6." },
            category: { type: Type.STRING, description: "Optional category slug to filter results. Only use values returned by list_categories — do NOT guess category names. Omit this for broad searches." },
            max_price: { type: Type.NUMBER, description: "Maximum price in LKR." },
            min_price: { type: Type.NUMBER, description: "Minimum price in LKR." },
            sort: { type: Type.STRING, description: "Sort order: 'relevance' | 'price_asc' | 'price_desc' | 'bestseller'." },
          },
          required: ["q"],
        },
      },
      {
        name: "get_product",
        description: "Get full details for a single product by ID — description, all images, variants, and shipping info.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            product_id: { type: Type.STRING, description: "Kapruka product ID (e.g. 'CAKE00KA001913')." },
          },
          required: ["product_id"],
        },
      },
      {
        name: "check_delivery",
        description: "Check if Kapruka can deliver to a Sri Lankan city on a given date, and get the flat delivery rate. Always call this before confirming delivery to the user.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            city: { type: Type.STRING, description: "Canonical city name e.g. 'Colombo 03', 'Kandy', 'Galle'." },
            delivery_date: { type: Type.STRING, description: "Target date in YYYY-MM-DD format." },
            product_id: { type: Type.STRING, description: "Optional — enables perishable freshness warning for cakes/flowers." },
          },
          required: ["city"],
        },
      },
      {
        name: "list_categories",
        description: "List all Kapruka product categories.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "create_order",
        description: "Place an order on Kapruka. Call after collecting all required info: cart items, recipient, delivery date, and sender. Returns a payment URL.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cart: {
              type: Type.ARRAY,
              description: "Items to order.",
              items: {
                type: Type.OBJECT,
                properties: {
                  product_id: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  variant_id: { type: Type.STRING },
                },
                required: ["product_id", "quantity"],
              },
            },
            recipient: {
              type: Type.OBJECT,
              description: "Person receiving the delivery — name and phone only.",
              properties: { name: { type: Type.STRING }, phone: { type: Type.STRING } },
              required: ["name", "phone"],
            },
            delivery: {
              type: Type.OBJECT,
              description: "Delivery address and date.",
              properties: {
                date: { type: Type.STRING, description: "YYYY-MM-DD" },
                address: { type: Type.STRING, description: "Street address e.g. '45 Galle Road'" },
                city: { type: Type.STRING, description: "City e.g. 'Colombo 03'" },
                instructions: { type: Type.STRING },
              },
              required: ["date", "address", "city"],
            },
            sender: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                phone: { type: Type.STRING },
                email: { type: Type.STRING },
              },
              required: ["name", "phone", "email"],
            },
            gift_message: { type: Type.STRING },
            currency: { type: Type.STRING },
          },
          required: ["cart", "recipient", "delivery", "sender"],
        },
      },
      {
        name: "track_order",
        description: "Track an existing Kapruka order by order number.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            order_number: { type: Type.STRING, description: "Order number e.g. KPR-2026-12345." },
          },
          required: ["order_number"],
        },
      },
      {
        name: "get_curated_products",
        description: "Get a curated list of pre-selected products. Use for: best sellers, promotions/deals, or same-day delivery. Always prefer this over search_products for these three cases.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            list: { type: Type.STRING, description: "List name: best_sellers | promotions | same_day" },
            limit: { type: Type.NUMBER, description: "Max results (1-12). Default 12." },
          },
          required: ["list"],
        },
      },
      {
        name: "open_page",
        description: "Open a Kapruka category or feature page in the right panel.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "Full Kapruka URL to open." },
            title: { type: Type.STRING, description: "Human-readable page title." },
          },
          required: ["url", "title"],
        },
      },
      {
        name: "save_to_wishlist",
        description: "Save a product to the user's wishlist for later.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            product_id: { type: Type.STRING },
            name: { type: Type.STRING },
            image_url: { type: Type.STRING },
            price_amount: { type: Type.NUMBER },
          },
          required: ["product_id", "name", "price_amount"],
        },
      },
    ],
  },
];
