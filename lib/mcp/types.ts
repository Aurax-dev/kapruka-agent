import { z } from "zod";
import { cleanText, stripSummaryPrefix } from "@/lib/text/clean";

const Money = z.object({
  amount: z.number().nullable(),
  currency: z.string(),
});

const Category = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional().default(""),
});

export const ProductSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string().optional().default(""),
  price: Money,
  compare_at_price: Money.nullable().optional().default(null),
  in_stock: z.boolean(),
  stock_level: z.string().optional().default(""),
  image_url: z.string().nullable().optional().default(null),
  category: Category,
  rating: z.unknown().nullable().optional().default(null),
  ships_internationally: z.boolean().optional().default(false),
  url: z.string(),
});
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const SearchResponseSchema = z.object({
  results: z.array(ProductSummarySchema),
  next_cursor: z.string().nullable().optional().default(null),
  applied_filters: z.record(z.string(), z.unknown()).optional().default({}),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const ProductDetailSchema = ProductSummarySchema.extend({
  description: z.string().optional().default(""),
  images: z.array(z.string()).optional().default([]),
  variants: z.array(z.unknown()).optional().default([]),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

function cleanProduct<T extends { name: string; summary?: string }>(p: T): T {
  return {
    ...p,
    name: cleanText(p.name),
    ...(p.summary !== undefined ? { summary: cleanText(stripSummaryPrefix(p.summary)) } : {}),
  };
}

export function parseSearchResponse(raw: string): SearchResponse {
  const trimmed = raw?.trim();
  if (!trimmed || !trimmed.startsWith("{")) {
    // Server returned plain text (e.g. "No products found...") — treat as empty results
    return { results: [], next_cursor: null, applied_filters: {} };
  }
  try {
    const parsed = SearchResponseSchema.parse(JSON.parse(trimmed));
    return { ...parsed, results: parsed.results.map(cleanProduct) };
  } catch (err) {
    console.error("[parseSearchResponse] unexpected MCP response shape:", err, "\nRaw:", trimmed.slice(0, 500));
    return { results: [], next_cursor: null, applied_filters: {} };
  }
}

export function parseProductDetail(raw: string): ProductDetail {
  const parsed = ProductDetailSchema.parse(JSON.parse(raw));
  return { ...cleanProduct(parsed), description: cleanText(parsed.description ?? "") };
}
