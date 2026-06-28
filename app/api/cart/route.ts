import { auth } from "@/auth";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { CartItem } from "@/lib/chat/types";

export const runtime = "nodejs";

function toCartItem(row: typeof cartItems.$inferSelect): CartItem {
  return {
    product_id: row.productId,
    name: row.name,
    image_url: null,
    price: { amount: row.priceAmount, currency: "LKR" },
    quantity: row.quantity,
    variant_id: row.variantId ?? undefined,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(cartItems).where(eq(cartItems.userId, session.user.id));
  return Response.json({ items: rows.map(toCartItem) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { product_id: string; name: string; variant_id?: string; price_amount: number; quantity?: number };
  const whereClause = body.variant_id
    ? and(eq(cartItems.userId, session.user.id), eq(cartItems.productId, body.product_id), eq(cartItems.variantId, body.variant_id))
    : and(eq(cartItems.userId, session.user.id), eq(cartItems.productId, body.product_id), isNull(cartItems.variantId));
  const [existing] = await db.select().from(cartItems).where(whereClause).limit(1);
  if (existing) {
    const [updated] = await db.update(cartItems)
      .set({ quantity: existing.quantity + (body.quantity ?? 1) })
      .where(eq(cartItems.id, existing.id))
      .returning();
    return Response.json(toCartItem(updated));
  }
  const [created] = await db.insert(cartItems).values({
    userId: session.user.id,
    productId: body.product_id,
    name: body.name,
    variantId: body.variant_id,
    priceAmount: body.price_amount,
    quantity: body.quantity ?? 1,
  }).returning();
  return Response.json(toCartItem(created), { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const productId = new URL(request.url).searchParams.get("product_id");
  if (productId) {
    await db.delete(cartItems).where(and(eq(cartItems.userId, session.user.id), eq(cartItems.productId, productId)));
  } else {
    await db.delete(cartItems).where(eq(cartItems.userId, session.user.id));
  }
  return new Response(null, { status: 204 });
}
