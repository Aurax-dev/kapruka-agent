import { auth } from "@/auth";
import { db } from "@/db";
import { wishlistItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { productId } = await params;
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, session.user.id), eq(wishlistItems.productId, productId)));
  return new Response(null, { status: 204 });
}
