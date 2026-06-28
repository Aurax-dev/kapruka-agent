import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  return Response.json({ conversation: conv, messages: msgs });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));
  return new Response(null, { status: 204 });
}
