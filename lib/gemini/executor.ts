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

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  emit?: (event: { type: "products"; products: import("@/lib/chat/types").ProductSummarySnippet[] } | { type: "url"; url: string; title: string }) => void,
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

    case "track_order":
      return trackOrder(args.order_number as string);

    case "get_curated_products": {
      type PromoEntry = { id: string; compare_price: number | null };
      type CuratedData = { best_sellers: string[]; same_day: string[]; promotions: PromoEntry[] };
      const curated = (await import("@/data/curated.json")).default as CuratedData;
      const list = args.list as string;
      const limit = Math.min((args.limit as number | undefined) ?? 12, 12);

      if (list === "promotions") {
        const entries = curated.promotions.slice(0, limit);
        const products = await Promise.all(entries.map((e) => getProduct(e.id)));
        const snippets = products.map((p, i) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          compare_at_price: entries[i].compare_price != null
            ? { amount: entries[i].compare_price, currency: "LKR" }
            : (p.compare_at_price ?? null),
          image_url: p.image_url ?? null,
          images: p.images ?? [],
          in_stock: p.in_stock,
          url: p.url,
          summary: p.summary ?? "",
        }));
        emit?.({ type: "products", products: snippets });
        return { count: snippets.length, list };
      }

      const raw = list === "best_sellers" ? curated.best_sellers : curated.same_day;
      const ids = (raw ?? []).slice(0, limit);
      const products = await Promise.all(ids.map((id) => getProduct(id)));
      const snippets = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image_url: p.image_url ?? null,
        images: p.images ?? [],
        in_stock: p.in_stock,
        url: p.url,
        summary: p.summary ?? "",
      }));
      emit?.({ type: "products", products: snippets });
      return { count: snippets.length, list };
    }

    case "open_page":
      emit?.({ type: "url", url: args.url as string, title: args.title as string });
      return "Page opened.";

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
