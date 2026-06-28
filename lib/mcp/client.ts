import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TokenBucket } from "./rate-limit";
import { TtlCache } from "./cache";

const MCP_URL = process.env.KAPRUKA_MCP_URL ?? "https://mcp.kapruka.com/mcp";

// Kapruka's MCP allows ~8 calls in quick succession before returning a
// "Rate limit exceeded" message, so pace bursts close to that. Trips that still
// slip through are handled by retry-with-backoff in callTool.
const bucket = new TokenBucket(6, 1);
const cache = new TtlCache<string>(30 * 60 * 1000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The server returns soft rate-limit errors as plain text (not an MCP isError). */
function isRateLimitText(text: string): boolean {
  const t = text.trim();
  return !t.startsWith("{") && /rate limit/i.test(t);
}

let clientPromise: Promise<Client> | null = null;

export function _resetClientForTesting() {
  clientPromise = null;
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: "ruki", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
      await client.connect(transport);
      return client;
    })();
  }
  return clientPromise;
}

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export async function callTool(
  name: string,
  params: Record<string, unknown>,
  opts: { cache?: boolean } = {},
): Promise<string> {
  const key = `${name}:${JSON.stringify(params)}`;
  const useCache = opts.cache !== false;

  if (useCache) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
  }

  // Retry soft rate-limit errors with backoff. They come back as a normal text
  // result (not isError), so without this they'd be cached as "empty" for 30 min.
  const MAX_ATTEMPTS = 4;
  let lastRateLimitText = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await bucket.acquire();
    const client = await getClient();

    const res = (await client.callTool({
      name,
      arguments: { params },
    })) as McpToolResult;

    if (res.isError) {
      throw new Error(`MCP tool ${name} returned error: ${JSON.stringify(res).slice(0, 300)}`);
    }

    // Support both structuredContent (newer MCP spec) and standard content array
    const structuredResult = res.structuredContent?.result;
    const textResult = res.content?.find(c => c.type === "text")?.text;
    const result = typeof structuredResult === "string" ? structuredResult : textResult;

    if (typeof result !== "string") {
      console.error(`[MCP] ${name} unexpected response shape:`, JSON.stringify(res).slice(0, 500));
      throw new Error(`MCP tool ${name} returned no usable content`);
    }

    if (isRateLimitText(result)) {
      lastRateLimitText = result;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(700 * 2 ** attempt + Math.random() * 300); // 0.7s, 1.4s, 2.8s (+jitter)
        continue;
      }
      // Out of retries — return the error text uncached so the caller degrades
      // gracefully (search → empty results) without poisoning the cache.
      console.warn(`[MCP] ${name} still rate-limited after ${MAX_ATTEMPTS} attempts`);
      return result;
    }

    if (useCache) cache.set(key, result);
    return result;
  }

  return lastRateLimitText;
}
