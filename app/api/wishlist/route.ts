import { auth } from "@/auth";
import { db } from "@/db";
import { wishlistItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(wishlistItems).where(eq(wishlistItems.userId, session.user.id));
  return Response.json({ items: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { product_id: string; name: string; image_url?: string; price_amount: number };
  const [inserted] = await db.insert(wishlistItems)
    .values({ userId: session.user.id, productId: body.product_id, name: body.name, imageUrl: body.image_url, priceAmount: body.price_amount })
    .onConflictDoNothing()
    .returning();
  if (inserted) return Response.json(inserted, { status: 201 });
  const [existing] = await db.select().from(wishlistItems)
    .where(and(eq(wishlistItems.userId, session.user.id), eq(wishlistItems.productId, body.product_id)));
  return Response.json(existing ?? {});
}
