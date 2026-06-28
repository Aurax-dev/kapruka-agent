import { listDeliveryCities } from "@/lib/mcp/tools";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (q.length < 2) return Response.json({ cities: [] });
  try {
    const cities = await listDeliveryCities(q, 10);
    return Response.json({ cities });
  } catch {
    return Response.json({ cities: [] });
  }
}
