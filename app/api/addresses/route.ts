import { auth } from "@/auth";
import { db } from "@/db";
import { savedAddresses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(savedAddresses)
    .where(eq(savedAddresses.userId, session.user.id))
    .orderBy(desc(savedAddresses.isDefault), desc(savedAddresses.createdAt));
  return Response.json({ addresses: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { label?: string; recipient_name: string; city: string; phone: string; is_default?: boolean };
  const [address] = await db.insert(savedAddresses).values({
    userId: session.user.id,
    label: body.label ?? "Home",
    recipientName: body.recipient_name,
    city: body.city,
    phone: body.phone,
    isDefault: body.is_default ?? false,
  }).returning();
  return Response.json(address, { status: 201 });
}
