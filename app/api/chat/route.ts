import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, messages, savedAddresses } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runAgentLoop } from "@/lib/gemini/loop";
import { buildCartSection, buildSavedAddressesSection } from "@/lib/gemini/system-prompt";
import type { ChatMessage, CartItem } from "@/lib/chat/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();

  let body: { history?: unknown; message?: unknown; cart?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!Array.isArray(body.history)) {
    return new Response(JSON.stringify({ error: "history must be an array" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const history = body.history as ChatMessage[];
  const cart = Array.isArray(body.cart) ? (body.cart as CartItem[]) : [];
  const cartSection = buildCartSection(cart);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const conversationId = typeof body.conversationId === "string" && UUID_RE.test(body.conversationId)
    ? body.conversationId : undefined;

  let addressesSection = "";
  if (session?.user?.id) {
    const addrs = await db.select().from(savedAddresses)
      .where(eq(savedAddresses.userId, session.user.id))
      .orderBy(desc(savedAddresses.isDefault));
    addressesSection = buildSavedAddressesSection(addrs);
  }

  if (conversationId && session?.user?.id) {
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.user.id)));
    if (conv?.title === "New conversation") {
      await db.update(conversations).set({ title: message.slice(0, 50), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    } else if (conv) {
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    }
    await db.insert(messages).values({ conversationId, role: "user", content: message });
  }

  let assistantText = "";
  let assistantWidget: unknown = null;
  // Capture every products event with its tab label so conversations reload with
  // the full multi-tab carousel intact, not just the last search's results.
  const assistantProductTabs: { label?: string; products: unknown }[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const context = { userId: session?.user?.id, db };
        for await (const event of runAgentLoop(history, message, cartSection, addressesSection, context)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          if (event.type === "text_delta") assistantText += (event as { text: string }).text;
          // The client resets its buffer on clear_text (preamble before a tool call,
          // or pre-widget text); mirror that so the persisted message matches what
          // the user actually saw rather than accumulating cleared-out preambles.
          if (event.type === "clear_text") assistantText = "";
          if (event.type === "widget") assistantWidget = event;
          if (event.type === "products") {
            const ev = event as { products: unknown; label?: string };
            assistantProductTabs.push({ label: ev.label, products: ev.products });
          }
          if (event.type === "done" && conversationId && session?.user?.id) {
            const cleanText = assistantText
              .replace(/PRODUCTS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            db.insert(messages).values({
              conversationId,
              role: "assistant",
              content: cleanText,
              widgets: assistantWidget,
              products: assistantProductTabs.length ? assistantProductTabs : null,
            }).catch(() => {});
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "text_delta", text: "Something went wrong — please try again." }) + "\n"));
        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        console.error("[/api/chat] agent loop error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
