import { listDeliveryCities } from "@/lib/mcp/tools";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (q.length < 2) return Response.json({ cities: [] });
  try {
    const cities = await listDeliveryCities(q, 10);
    // Delivery-city results are stable, so let the CDN and browser cache them per
    // query. The first lookup of a prefix (by any user) warms the edge cache; every
    // later hit is served instantly without touching the MCP tool. Don't cache empty
    // results (transient rate-limit / miss) so they can be retried.
    const headers = cities.length
      ? { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }
      : { "Cache-Control": "no-store" };
    return Response.json({ cities }, { headers });
  } catch {
    return Response.json({ cities: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
