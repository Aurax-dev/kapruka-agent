import {
  searchProducts,
  getProduct,
  checkDelivery,
  listCategories,
  createOrder,
  trackOrder,
  type CartItemInput,
  type OrderRecipient,
  type OrderSender,
} from "@/lib/mcp/tools";

type EmitEvent =
  | { type: "products"; products: import("@/lib/chat/types").ProductSummarySnippet[] }
  | { type: "url"; url: string; title: string }
  | { type: "track_result"; data: import("@/lib/chat/types").TrackResult };

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  emit?: (event: EmitEvent) => void,
  context?: { userId?: string; db?: import("@/db").DB },
): Promise<unknown> {
  switch (name) {
    case "search_products":
      console.log("[search_products]", JSON.stringify({ q: args.q, category: args.category, min: args.min_price, max: args.max_price, sort: args.sort }));
      return searchProducts({
        q: args.q as string,
        limit: (args.limit as number | undefined) ?? 6,
        category: args.category as string | undefined,
        minPrice: args.min_price as number | undefined,
        maxPrice: args.max_price as number | undefined,
        sort: args.sort as string | undefined,
        inStockOnly: true,
      });

    case "get_product":
      return getProduct(args.product_id as string);

    case "check_delivery":
      return checkDelivery(
        args.city as string,
        args.delivery_date as string | undefined,
        args.product_id as string | undefined,
      );

    case "list_categories":
      return listCategories();

    case "create_order":
      return createOrder({
        cart: args.cart as CartItemInput[],
        recipient: args.recipient as OrderRecipient,
        delivery: args.delivery as { date: string; address: string; city: string; instructions?: string },
        sender: args.sender as OrderSender,
        gift_message: args.gift_message as string | undefined,
        currency: args.currency as string | undefined,
      });

    case "track_order": {
      const result = await trackOrder(args.order_number as string);
      emit?.({ type: "track_result", data: result as import("@/lib/chat/types").TrackResult });
      return result;
    }

    case "get_curated_products": {
      // curated.json is a full product snapshot (see scripts/enrich-curated.mjs), so this
      // renders with ZERO live MCP calls and can filter by category without fetching.
      type Money = { amount: number | null; currency: string };
      type CuratedItem = {
        id: string; name: string; category?: string; image: string | null; price: Money;
        url?: string; in_stock?: boolean; summary?: string; compare_price?: number | null;
      };
      type CuratedData = { best_sellers: CuratedItem[]; same_day: CuratedItem[]; promotions: CuratedItem[] };
      const curated = (await import("@/data/curated.json")).default as unknown as CuratedData;
      const list = args.list as string;
      const limit = Math.min((args.limit as number | undefined) ?? 12, 12);
      const contains = (args.contains as string | undefined)?.trim().toLowerCase();

      const source: CuratedItem[] =
        list === "promotions" ? curated.promotions
        : list === "best_sellers" ? curated.best_sellers
        : curated.same_day;

      // Optional context filter: keep items whose name/category mention the keyword.
      // Token-prefix match tolerates singular/plural ("electronics" vs category "Electronic").
      const matchesContains = (it: CuratedItem, q: string): boolean => {
        const hay = `${it.name} ${it.category ?? ""}`.toLowerCase();
        if (hay.includes(q)) return true;
        const qToks = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        const hToks = hay.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        return qToks.some((qt) => hToks.some((ht) => ht.startsWith(qt) || qt.startsWith(ht)));
      };
      const filtered = contains ? source.filter((it) => matchesContains(it, contains)) : source;

      const snippets = filtered.slice(0, limit).map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        compare_at_price: it.compare_price != null ? { amount: it.compare_price, currency: "LKR" } : null,
        image_url: it.image ?? null,
        in_stock: it.in_stock ?? true,
        url: it.url ?? "",
        summary: it.summary ?? "",
      }));
      emit?.({ type: "products", products: snippets });
      // count: 0 with a filter → caller should fall back to search_products for that category.
      return { count: snippets.length, list, filtered: contains ?? null };
    }

    case "open_page":
      emit?.({ type: "url", url: args.url as string, title: args.title as string });
      return "Page opened.";

    case "get_kapruka_info": {
      console.log("[get_kapruka_info]", JSON.stringify({ topic: args.topic, query: args.query }));
      const { lookupKaprukaInfo } = await import("@/lib/kapruka/info");
      return lookupKaprukaInfo(args.topic as string, args.query as string | undefined);
    }

    case "save_to_wishlist": {
      if (!context?.userId || !context?.db) return { saved: false, reason: "Not signed in" };
      const { wishlistItems } = await import("@/db/schema");
      await context.db.insert(wishlistItems).values({
        userId: context.userId,
        productId: args.product_id as string,
        name: args.name as string,
        imageUrl: (args.image_url as string | undefined) ?? null,
        priceAmount: Math.round(args.price_amount as number),
      }).onConflictDoNothing();
      return { saved: true };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
