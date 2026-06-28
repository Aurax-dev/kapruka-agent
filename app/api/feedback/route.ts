import { auth } from "@/auth";
import { db } from "@/db";
import { feedback } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    rating: number;
    comment?: string;
    order_ref?: string;
    conversation_id?: string;
  };

  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "rating must be between 1 and 5" }, { status: 400 });
  }

  const comment = body.comment?.trim();
  const [inserted] = await db.insert(feedback).values({
    userId: session.user.id,
    conversationId: body.conversation_id || null,
    orderRef: body.order_ref || null,
    rating,
    comment: comment ? comment.slice(0, 1000) : null,
  }).returning();

  return Response.json(inserted, { status: 201 });
}
