import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await db.delete(users).where(
    and(eq(users.isAnonymous, true), lt(users.createdAt, sql`NOW() - INTERVAL '30 days'`))
  ).returning({ id: users.id });
  return Response.json({ deleted: result.length });
}
