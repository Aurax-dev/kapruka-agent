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

// Append messages to a conversation. Used for client-only interactions (e.g.
// opening a product detail card) that never round-trip through /api/chat but
// still need to survive a reload.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });

  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const incoming = Array.isArray(body.messages) ? body.messages.slice(0, 10) : [];
  if (incoming.length === 0) return Response.json({ ok: true });

  // Explicit, strictly increasing createdAt so reload (ordered by createdAt) keeps
  // the user→card→text sequence even when inserted in the same millisecond.
  const base = Date.now();
  const rows = incoming.map((m, i) => {
    const msg = m as { role?: unknown; content?: unknown; widgets?: unknown; products?: unknown };
    return {
      conversationId: id,
      role: msg.role === "user" ? "user" : "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
      widgets: msg.widgets ?? null,
      products: msg.products ?? null,
      createdAt: new Date(base + i),
    };
  });
  await db.insert(messages).values(rows);
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));
  return new Response(null, { status: 204 });
}
