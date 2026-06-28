import { auth } from "@/auth";
import { db } from "@/db";
import { savedAddresses } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json() as Partial<{ label: string; recipient_name: string; city: string; phone: string; is_default: boolean }>;
  await db.update(savedAddresses).set({
    ...(body.label && { label: body.label }),
    ...(body.recipient_name && { recipientName: body.recipient_name }),
    ...(body.city && { city: body.city }),
    ...(body.phone && { phone: body.phone }),
    ...(body.is_default !== undefined && { isDefault: body.is_default }),
  }).where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, session.user.id)));
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(savedAddresses).where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, session.user.id)));
  return new Response(null, { status: 204 });
}
