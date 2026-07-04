import { getGeminiClient } from "@/lib/gemini/client";
import type { ChatMessage } from "@/lib/chat/types";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM = `You write the short note that goes on a physical gift card for Kapruka, Sri Lanka's gift platform.
From the conversation, infer what you can: the recipient, the occasion, the relationship, the gift itself, and the sender's name. Then write ONE warm, heartfelt gift-card message for the customer to use.

Rules:
- 1–2 short sentences, UNDER 180 characters total — it must fit a small card.
- Ground EVERY detail in the conversation. Use the recipient, relationship, and occasion the customer actually indicated — e.g. if they searched "gifts for father" or said it's for their dad, the note is for a father. NEVER switch to a different recipient (do not write to a mother when the customer is shopping for a father) and never invent a relationship, gender, or occasion the conversation doesn't support. When the recipient is unclear, keep it warm but non-specific rather than guessing.
- Make it feel personal, never generic filler. Reflect the occasion and recipient when they're known (birthday, anniversary, thank-you, get-well, congratulations, etc.). If nothing specific is known, write a warm all-purpose note.
- Sign off with the sender's first name if you can tell it; otherwise leave it unsigned.
- At most one light emoji, and only if it fits — optional.
- Match the language and script of the conversation (English, Sinhala, Singlish, Tamil, or Tanglish). Keep names as-is.
- Output ONLY the message text the customer would write on the card — no quotes, no labels, no explanation, no options.`;

export async function POST(request: Request) {
  let body: { history?: unknown; sender?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
  const sender = typeof body.sender === "string" ? body.sender.trim().slice(0, 80) : "";

  // Flatten the conversation (recipient/occasion/product/sender all live here) and
  // keep the most recent ~4k chars so the model has the freshest context.
  const convo = history
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => `${m.role === "user" ? "Customer" : "Ruki"}: ${m.text}`)
    .join("\n")
    .slice(-4000);

  const prompt = `${convo ? `Conversation so far:\n${convo}\n\n` : ""}${
    sender ? `The sender's name is ${sender}.\n\n` : ""
  }Write the gift card message now.`;

  try {
    const ai = getGeminiClient();
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // thinkingBudget: 0 disables 2.5-flash's default "thinking" pass — a one-line
      // gift note doesn't need it, and it roughly halves the response latency.
      config: { systemInstruction: SYSTEM, temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } },
    });
    let message = (res.text ?? "").trim().replace(/^["'“”\s]+|["'“”\s]+$/g, "");
    if (message.length > 200) message = message.slice(0, 200).trim();
    if (!message) return json({ error: "empty" }, 502);
    return json({ message });
  } catch {
    return json({ error: "generation failed" }, 502);
  }
}
