import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank } from "@/lib/requests";

/** Put a cancelled request back on the table. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const req = await loadRequestForBank(id, bankId);
  if (!req) return Response.json({ error: "Request not found." }, { status: 404 });
  if (req.status !== "CANCELLED") {
    return Response.json({ error: "Only cancelled requests reopen." }, { status: 400 });
  }
  if (req.flag.status !== "OPEN") {
    return Response.json(
      { error: "The original flag has since closed." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id },
      data: { status: "OPEN", cancelReason: null },
    });
    const actor = await tx.foodBank.findUnique({ where: { id: bankId } });
    await tx.requestEvent.create({
      data: { requestId: id, actorBankId: bankId, action: "REOPENED" },
    });
    await tx.message.create({
      data: {
        requestId: id,
        senderBankId: bankId,
        text: `↩ ${actor?.name ?? "A food bank"} reopened this request.`,
      },
    });
  });

  return Response.json({ ok: true });
}
