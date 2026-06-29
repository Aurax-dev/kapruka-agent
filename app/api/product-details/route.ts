import { Type } from "@google/genai";
import { getGeminiClient } from "@/lib/gemini/client";
import { getProduct } from "@/lib/mcp/tools";

export const runtime = "nodejs";

// Persisted across requests on a warm instance — avoids re-summarising the same
// product (one MCP fetch + one LLM call) every time its detail card is opened.
const cache = new Map<string, { bullets: string[]; images: string[]; description: string }>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request) {
  let body: { product_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = typeof body.product_id === "string" ? body.product_id.trim() : "";
  if (!id) return json({ error: "product_id is required" }, 400);

  const cached = cache.get(id);
  if (cached) return json(cached);

  let product;
  try {
    product = await getProduct(id);
  } catch {
    // Let the client fall back to its existing snippet summary.
    return json({ bullets: [], images: [], description: "" });
  }

  const images = (product.images ?? []).filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  // The full MCP description (cleaned upstream) — returned verbatim so the chat
  // model gets the real product copy, not just the distilled bullets.
  const description = (product.description || "").trim();
  const source = (product.description || product.summary || "").slice(0, 4000);

  let bullets: string[] = [];
  if (source) {
    try {
      const ai = getGeminiClient();
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: `Product: ${product.name}\nCategory: ${product.category?.name ?? ""}\nDetails: ${source}` }],
          },
        ],
        config: {
          systemInstruction:
            "You write punchy product highlights for a gift-shopping app. Distil the product into 3-4 very short bullet points (max ~9 words each) covering its most appealing features and why it makes a good gift. Do not repeat the product name, no marketing fluff, no emojis. Return a JSON array of plain strings.",
          responseMimeType: "application/json",
          responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
          temperature: 0.4,
        },
      });
      const parsed = JSON.parse(res.text ?? "[]");
      if (Array.isArray(parsed)) {
        bullets = parsed
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .map((b) => b.trim())
          .slice(0, 4);
      }
    } catch {
      // Summarisation failed — return images only; client falls back to raw summary.
    }
  }

  const result = { bullets, images, description };
  if (bullets.length || images.length || description) cache.set(id, result);
  return json(result);
}
