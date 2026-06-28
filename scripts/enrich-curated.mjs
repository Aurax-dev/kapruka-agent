/**
 * Enriches data/curated.json with a full product snapshot per entry, so
 * get_curated_products can render (and filter by category) with ZERO live MCP calls.
 *
 * Pipeline:
 *   node scripts/parse-har.mjs       # writes id-only lists from HAR captures
 *   node scripts/enrich-curated.mjs  # adds name/category/image/price/url via the MCP
 *
 * Idempotent: reads the current curated.json (id-only OR already enriched), refetches
 * each product, and rewrites it. IDs that no longer resolve (delisted) are dropped —
 * which permanently removes the "missing product blanks the list" problem at the source.
 *
 * Output shape (data/curated.json):
 *   {
 *     "best_sellers": [{ id, name, category, image, price:{amount,currency}, url, in_stock, summary }],
 *     "same_day":     [ ...same... ],
 *     "promotions":   [ ...same..., compare_price ]
 *   }
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "curated.json");
const MCP_URL = process.env.KAPRUKA_MCP_URL ?? "https://mcp.kapruka.com/mcp";
const SPACING_MS = 2500; // stay under Kapruka's MCP rate limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (t) => { t = t.trim(); return !t.startsWith("{") && /rate limit/i.test(t); };

const client = new Client({ name: "ruki-enrich", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));

async function getProduct(id, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await client.callTool({
      name: "kapruka_get_product",
      arguments: { params: { product_id: id, currency: "LKR", response_format: "json" } },
    });
    const txt = res.structuredContent?.result ?? res.content?.find((c) => c.type === "text")?.text ?? "";
    if (isRateLimit(txt)) { await sleep(1500 * 2 ** attempt); continue; }
    if (!txt.trim().startsWith("{")) return null; // delisted / not found
    try { return JSON.parse(txt); } catch { return null; }
  }
  return null;
}

/** Normalise a list entry (string id OR {id, compare_price}) → { id, compare_price }. */
const toRef = (e) => (typeof e === "string" ? { id: e } : { id: e.id, compare_price: e.compare_price ?? null });

function snapshot(p, ref) {
  const snap = {
    id: p.id,
    name: p.name,
    category: p.category?.name ?? "",
    image: (Array.isArray(p.images) && p.images[0]) || p.image_url || null,
    price: p.price ?? { amount: null, currency: "LKR" },
    url: p.url ?? "",
    in_stock: p.in_stock ?? true,
    summary: p.summary ?? "",
  };
  if (ref.compare_price != null) snap.compare_price = ref.compare_price;
  return snap;
}

const data = JSON.parse(readFileSync(FILE, "utf8"));
const lists = ["best_sellers", "same_day", "promotions"];
const out = {};

for (const list of lists) {
  const refs = (data[list] ?? []).map(toRef);
  const enriched = [];
  for (const ref of refs) {
    const p = await getProduct(ref.id);
    await sleep(SPACING_MS);
    if (!p || !p.id) { console.warn(`  ! ${list}: dropped ${ref.id} (unresolved)`); continue; }
    enriched.push(snapshot(p, ref));
  }
  out[list] = enriched;
  console.log(`✓ ${list.padEnd(13)} ${enriched.length}/${refs.length} products enriched`);
}

writeFileSync(FILE, JSON.stringify(out, null, 2));
console.log(`→ Written ${FILE}`);
process.exit(0);
