import { auth } from "@/auth";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { quantity } = await request.json() as { quantity: number };
  if (quantity <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, session.user.id)));
    return new Response(null, { status: 204 });
  }
  await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, id), eq(cartItems.userId, session.user.id)));
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, session.user.id)));
  return new Response(null, { status: 204 });
}
