import { getGeminiClient } from "./client";
import { SYSTEM_PROMPT } from "./system-prompt";
import { GEMINI_TOOLS } from "./tools";
import { executeTool } from "./executor";
import { normalizeSinhalaScript } from "@/lib/text/sinhala";
import type { AgentEvent, ChatMessage, ProductSummarySnippet } from "@/lib/chat/types";
import type { SearchResponse } from "@/lib/mcp/types";
import type { FunctionCall, Part } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const MAX_ROUNDS = 5;

function toGeminiContents(history: ChatMessage[]) {
  return history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
}

function extractProducts(result: unknown): ProductSummarySnippet[] {
  const sr = result as SearchResponse;
  if (!sr?.results) return [];
  return sr.results.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image_url: p.image_url ?? null,
    in_stock: p.in_stock,
    url: p.url,
    summary: p.summary ?? "",
  }));
}

// Pull a `WIDGET: {…}` tag out of the model's reply, wherever it lands. The model
// is told to END its reply with the tag, but it sometimes emits it mid-reply with
// prose after it (e.g. `WIDGET: {…}Who should we say this is from?`). A trailing-
// anchored match misses those and leaks the raw JSON into the chat bubble. Balanced-
// brace scanning captures nested JSON (e.g. saved_address arrays) exactly.
function extractWidgetTag(text: string): { json: string; start: number; end: number } | null {
  const m = text.match(/WIDGET:\s*\{/);
  if (m?.index === undefined) return null;
  const braceStart = text.indexOf("{", m.index);
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) {
      return { json: text.slice(braceStart, i + 1), start: m.index, end: i + 1 };
    }
  }
  return null;
}

function toolStatusLabel(toolName: string): string {
  switch (toolName) {
    case "search_products":      return "Searching";
    case "get_product":          return "Loading product";
    case "check_delivery":       return "Checking delivery";
    case "list_categories":      return "Loading categories";
    case "create_order":         return "Placing order";
    case "track_order":          return "Tracking order";
    case "get_curated_products": return "Loading picks";
    case "get_kapruka_info":     return "Checking info";
    case "open_page":            return "Opening page";
    case "save_to_wishlist":     return "Saving to wishlist";
    default:                     return "Thinking";
  }
}

export async function* runAgentLoop(
  history: ChatMessage[],
  userMessage: string,
  cartSection = "",
  addressesSection = "",
  context?: { userId?: string; db?: import("@/db").DB },
): AsyncGenerator<AgentEvent> {
  const ai = getGeminiClient();

  const contents: { role: string; parts: Part[] }[] = [
    ...toGeminiContents(history),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let round = 0;
  let searchRound = 0;
  let productsEmitted = false;
  const SEARCH_LABELS = ["Searching", "Exploring", "Browsing", "Expanding search"];

  while (round < MAX_ROUNDS) {
    round++;
    // On the final allowed round, withhold tools so the model is forced to wrap
    // up in plain text rather than looping into the error fallback below.
    const lastRound = round === MAX_ROUNDS;

    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: contents as never,
      config: {
        systemInstruction: SYSTEM_PROMPT + cartSection + addressesSection,
        tools: lastRound ? undefined : GEMINI_TOOLS,
        // gemini-2.5-flash defaults to dynamic "thinking", which sometimes burns a
        // whole turn on thoughts and streams back nothing (finishReason=STOP, no
        // text, no tool call) — the source of the silently-dropped/blank replies.
        // Disabling it makes every turn emit a real answer or tool call, and is
        // much faster for this concierge flow.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const pendingFunctionCalls: FunctionCall[] = [];
    let fullText = "";
    let finishReason: string | undefined;
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;
      const rawText = (chunk as { text?: string }).text;
      const text = rawText ? normalizeSinhalaScript(rawText) : rawText;
      const functionCalls = (chunk as { functionCalls?: FunctionCall[] }).functionCalls;
      const fr = (chunk as { candidates?: { finishReason?: string }[] }).candidates?.[0]?.finishReason;
      if (fr) finishReason = fr;

      if (text) {
        fullText += text;
        yield { type: "text_delta", text };
      }

      if (functionCalls?.length) {
        for (const fc of functionCalls) pendingFunctionCalls.push(fc);
      }
    }

    // A round that yields neither text nor a tool call is an empty turn — the
    // source of the "retry button, no response" drop. Emit a bare `done` so the
    // client detects it and auto-retries (up to 3×, mirroring the retry button).
    // Logged for tracing.
    if (pendingFunctionCalls.length === 0 && !fullText) {
      console.warn(
        `[runAgentLoop] empty round ${round}/${MAX_ROUNDS}: chunks=${chunkCount}, finishReason=${finishReason ?? "none"}, productsEmitted=${productsEmitted}`,
      );
      yield { type: "done" };
      return;
    }

    if (finishReason && finishReason !== "STOP") {
      console.warn(`[runAgentLoop] round ${round} finishReason=${finishReason} (text len=${fullText.length}, calls=${pendingFunctionCalls.length})`);
    }

    if (pendingFunctionCalls.length === 0) {
      const tag = extractWidgetTag(fullText);
      if (tag) {
        try {
          const parsed = JSON.parse(tag.json) as { type: string; [key: string]: unknown };
          const widgetType = parsed.type as import("@/lib/chat/types").WidgetType;
          // Strip the whole tag (wherever it sat) so its raw JSON never leaks; keep
          // any prose that came before or after it as the visible bubble text.
          const cleanText = (fullText.slice(0, tag.start) + fullText.slice(tag.end))
            .replace(/[ \t]{2,}/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          yield { type: "clear_text" };
          if (cleanText) yield { type: "text_delta", text: cleanText };
          yield { type: "widget", widget: widgetType, data: parsed };
        } catch {
          // malformed WIDGET JSON — text already streamed
        }
      }
      yield { type: "done" };
      return;
    }

    if (fullText) yield { type: "clear_text" };

    const modelParts: Part[] = [];
    if (fullText) modelParts.push({ text: fullText });
    for (const fc of pendingFunctionCalls) modelParts.push({ functionCall: fc });
    contents.push({ role: "model", parts: modelParts });

    const responseParts: Part[] = [];

    for (const fc of pendingFunctionCalls) {
      const name = fc.name ?? "";
      const args = (fc.args ?? {}) as Record<string, unknown>;

      const label = name === "search_products"
        ? SEARCH_LABELS[searchRound++ % SEARCH_LABELS.length]
        : toolStatusLabel(name);
      yield { type: "status", label };

      const sideEvents: AgentEvent[] = [];
      const emit = (ev: { type: "products"; products: ProductSummarySnippet[] } | { type: "url"; url: string; title: string } | { type: "track_result"; data: import("@/lib/chat/types").TrackResult }) => {
        sideEvents.push(ev as AgentEvent);
      };

      // A single tool failure (e.g. the MCP backend returning a non-JSON error
      // string) must not abort the whole stream and surface as "Something went
      // wrong". Feed the error back to the model as a tool result so it can
      // recover — retry, apologise, or ask the user to try again.
      let result: unknown;
      try {
        result = await executeTool(name, args, emit, context);
      } catch (err) {
        console.error(`[runAgentLoop] tool ${name} failed:`, err);
        result = { error: true, message: err instanceof Error ? err.message : String(err) };
      }

      for (const ev of sideEvents) yield ev;

      if (name === "search_products") {
        const products = extractProducts(result);
        const productLabel = (args.label as string | undefined) ?? (args.q as string);
        if (products.length > 0) {
          productsEmitted = true;
          yield { type: "products", products, label: productLabel };
        }
      }

      responseParts.push({
        functionResponse: { name, response: { output: result as Record<string, unknown> } },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  // Reached only if every round (including the tool-free final one) kept going.
  // If products were already shown, end quietly rather than alarming the user
  // with an error over results that are actually fine.
  if (!productsEmitted) {
    yield { type: "text_delta", text: "I ran into a loop — please try again." };
  }
  yield { type: "done" };
}
