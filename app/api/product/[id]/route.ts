import { NextResponse } from "next/server";
import { getProduct } from "@/lib/mcp/tools";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getProduct(id));
  } catch {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }
}
