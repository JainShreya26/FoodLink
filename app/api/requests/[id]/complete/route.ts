import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank, transferDirection } from "@/lib/requests";
import { applyTransfer } from "@/lib/request-transfer";

/**
 * Marks a request complete and moves the food. Both sides' inventory changes are
 * recorded as events, so this is reversible — see ../reverse.
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
  if (req.status === "COMPLETED") {
    return Response.json({ error: "Already completed." }, { status: 400 });
  }
  if (req.status === "CANCELLED") {
    return Response.json(
      { error: "This request was cancelled — reopen it first." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { quantity?: number };
  const quantity = Number(body.quantity ?? req.agreedQuantity ?? req.flag.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Quantity must be greater than 0." }, { status: 400 });
  }
  if (quantity > req.flag.quantity) {
    return Response.json(
      { error: `Only ${req.flag.quantity} ${req.flag.unit} were flagged.` },
      { status: 400 },
    );
  }

  const { giverBankId, receiverBankId } = transferDirection(
    req.flag.type,
    req.flag.foodBankId,
    req.requesterBankId,
  );

  await prisma.$transaction(async (tx) => {
    const giverBank = await tx.foodBank.findUnique({ where: { id: giverBankId } });
    const actor = await tx.foodBank.findUnique({ where: { id: bankId } });

    await applyTransfer({
      tx,
      requestId: id,
      actorBankId: bankId,
      giverBankId,
      receiverBankId,
      giverBankName: giverBank?.name ?? "another food bank",
      itemName: req.flag.itemName,
      unit: req.flag.unit,
      quantity,
    });

    await tx.request.update({
      where: { id },
      data: { status: "COMPLETED", finalQuantity: quantity, cancelReason: null },
    });

    const flagRemaining = req.flag.quantity - quantity;
    await tx.flag.update({
      where: { id: req.flagId },
      data: {
        quantity: flagRemaining,
        status: flagRemaining <= 0 ? "CLOSED" : "OPEN",
      },
    });

    await tx.requestEvent.create({
      data: {
        requestId: id,
        actorBankId: bankId,
        action: "COMPLETED",
        detail: `${quantity} ${req.flag.unit} of ${req.flag.itemName} transferred`,
      },
    });

    await tx.message.create({
      data: {
        requestId: id,
        senderBankId: bankId,
        text: `✅ ${actor?.name ?? "A food bank"} marked this complete — ${quantity} ${req.flag.unit} of ${req.flag.itemName} transferred.`,
      },
    });
  });

  return Response.json({ ok: true, quantity });
}
