import { getGeminiClient } from "./client";
import { SYSTEM_PROMPT } from "./system-prompt";
import { GEMINI_TOOLS } from "./tools";
import { executeTool } from "./executor";
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

function toolStatusLabel(toolName: string): string {
  switch (toolName) {
    case "search_products":      return "Searching";
    case "get_product":          return "Loading product";
    case "check_delivery":       return "Checking delivery";
    case "list_categories":      return "Loading categories";
    case "create_order":         return "Placing order";
    case "track_order":          return "Tracking order";
    case "get_curated_products": return "Loading picks";
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
  const SEARCH_LABELS = ["Searching", "Exploring", "Browsing", "Expanding search"];

  while (round < MAX_ROUNDS) {
    round++;

    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: contents as never,
      config: {
        systemInstruction: SYSTEM_PROMPT + cartSection + addressesSection,
        tools: GEMINI_TOOLS,
      },
    });

    const pendingFunctionCalls: FunctionCall[] = [];
    let fullText = "";

    for await (const chunk of stream) {
      const text = (chunk as { text?: string }).text;
      const functionCalls = (chunk as { functionCalls?: FunctionCall[] }).functionCalls;

      if (text) {
        fullText += text;
        yield { type: "text_delta", text };
      }

      if (functionCalls?.length) {
        for (const fc of functionCalls) pendingFunctionCalls.push(fc);
      }
    }

    if (pendingFunctionCalls.length === 0) {
      const widgetMatch = fullText.match(/\s*WIDGET:\s*(\{[\s\S]*\})\s*$/);
      if (widgetMatch) {
        try {
          const parsed = JSON.parse(widgetMatch[1]) as { type: string; [key: string]: unknown };
          const widgetType = parsed.type as import("@/lib/chat/types").WidgetType;
          const cleanText = fullText.slice(0, fullText.length - widgetMatch[0].length).trimEnd();
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
      const emit = (ev: { type: "products"; products: ProductSummarySnippet[] } | { type: "url"; url: string; title: string }) => {
        sideEvents.push(ev as AgentEvent);
      };

      const result = await executeTool(name, args, emit, context);

      for (const ev of sideEvents) yield ev;

      if (name === "search_products") {
        const products = extractProducts(result);
        if (products.length > 0) yield { type: "products", products, label: args.q as string };
      }

      responseParts.push({
        functionResponse: { name, response: { output: result as Record<string, unknown> } },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  yield { type: "text_delta", text: "I ran into a loop — please try again." };
  yield { type: "done" };
}
