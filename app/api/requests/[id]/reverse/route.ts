import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank, transferDirection } from "@/lib/requests";
import { reverseTransfer } from "@/lib/request-transfer";

/**
 * Undo a completed transfer — wrong quantity, wrong item, truck never came.
 * Stock goes back to the giver, the flag reopens for what was returned, and the
 * request lands back at OPEN so it can be completed again with better numbers.
 */
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
  if (req.status !== "COMPLETED") {
    return Response.json(
      { error: "Only a completed transfer can be reversed." },
      { status: 400 },
    );
  }

  const quantity = req.finalQuantity ?? 0;
  if (quantity <= 0) {
    return Response.json({ error: "Nothing to reverse." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || null;

  const { giverBankId, receiverBankId } = transferDirection(
    req.flag.type,
    req.flag.foodBankId,
    req.requesterBankId,
  );

  await prisma.$transaction(async (tx) => {
    await reverseTransfer({
      tx,
      requestId: id,
      actorBankId: bankId,
      giverBankId,
      receiverBankId,
      itemName: req.flag.itemName,
      unit: req.flag.unit,
      quantity,
      reason,
    });

    await tx.request.update({
      where: { id },
      data: { status: "OPEN", finalQuantity: null, agreedQuantity: quantity },
    });

    // The flag gets its quantity back and reopens.
    await tx.flag.update({
      where: { id: req.flagId },
      data: { quantity: req.flag.quantity + quantity, status: "OPEN" },
    });

    const actor = await tx.foodBank.findUnique({ where: { id: bankId } });
    await tx.requestEvent.create({
      data: {
        requestId: id,
        actorBankId: bankId,
        action: "REVERSED",
        detail: `${quantity} ${req.flag.unit} returned${reason ? ` — ${reason}` : ""}`,
      },
    });
    await tx.message.create({
      data: {
        requestId: id,
        senderBankId: bankId,
        text: `↺ ${actor?.name ?? "A food bank"} reversed the transfer — ${quantity} ${req.flag.unit} of ${req.flag.itemName} returned${reason ? ` (${reason})` : ""}.`,
      },
    });
  });

  return Response.json({ ok: true, quantity });
}
