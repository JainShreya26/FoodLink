import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank } from "@/lib/requests";

/** Call off an open request. Nothing has moved yet, so nothing to undo. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const req = await loadRequestForBank(id, bankId);
  if (!req) return Response.json({ error: "Request not found." }, { status: 404 });
  if (req.status === "CANCELLED") {
    return Response.json({ error: "Already cancelled." }, { status: 400 });
  }
  if (req.status === "COMPLETED") {
    return Response.json(
      { error: "This transfer already happened — reverse it instead." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: reason },
    });
    const actor = await tx.foodBank.findUnique({ where: { id: bankId } });
    await tx.requestEvent.create({
      data: {
        requestId: id,
        actorBankId: bankId,
        action: "CANCELLED",
        detail: reason,
      },
    });
    await tx.message.create({
      data: {
        requestId: id,
        senderBankId: bankId,
        text: `🚫 ${actor?.name ?? "A food bank"} cancelled this request${reason ? ` — ${reason}` : ""}.`,
      },
    });
  });

  return Response.json({ ok: true });
}
