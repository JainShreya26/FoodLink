import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank } from "@/lib/requests";

async function guard(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };
  const req = await loadRequestForBank(id, bankId);
  if (!req) return { error: "Request not found.", status: 404 as const };
  return { req, bankId };
}

/**
 * Negotiate the quantity before anyone commits. Either side can propose; the
 * proposal is only a number on the request until someone completes it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });

  if (g.req.status !== "OPEN") {
    return Response.json(
      { error: "Only open requests can be changed." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    agreedQuantity?: number | null;
    scheduledFor?: string | null;
    handoverNote?: string | null;
  };

  // Booking the handover: the "when" half of the commitment.
  if (body.scheduledFor !== undefined) {
    const when = body.scheduledFor ? new Date(body.scheduledFor) : null;
    if (body.scheduledFor && Number.isNaN(when!.getTime())) {
      return Response.json({ error: "That date didn't parse." }, { status: 400 });
    }
    const note = body.handoverNote?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: { scheduledFor: when, handoverNote: note },
      });
      const actor = await tx.foodBank.findUnique({ where: { id: g.bankId } });
      const stamp = when
        ? when.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      await tx.requestEvent.create({
        data: {
          requestId: id,
          actorBankId: g.bankId,
          action: "SCHEDULED",
          detail: stamp ? `${stamp}${note ? ` — ${note}` : ""}` : "Pickup unbooked",
        },
      });
      await tx.message.create({
        data: {
          requestId: id,
          senderBankId: g.bankId,
          text: stamp
            ? `🚚 ${actor?.name ?? "A food bank"} booked the handover for ${stamp}.${note ? ` ${note}` : ""}`
            : `🚚 ${actor?.name ?? "A food bank"} removed the handover booking.`,
        },
      });
    });

    return Response.json({ ok: true, scheduledFor: when?.toISOString() ?? null });
  }

  if (body.agreedQuantity === undefined) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  if (body.agreedQuantity === null) {
    await prisma.request.update({ where: { id }, data: { agreedQuantity: null } });
    return Response.json({ ok: true, agreedQuantity: null });
  }

  const quantity = Number(body.agreedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Quantity must be greater than 0." }, { status: 400 });
  }
  if (quantity > g.req.flag.quantity) {
    return Response.json(
      { error: `Only ${g.req.flag.quantity} ${g.req.flag.unit} are available.` },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({ where: { id }, data: { agreedQuantity: quantity } });
    const actor = await tx.foodBank.findUnique({ where: { id: g.bankId } });
    await tx.requestEvent.create({
      data: {
        requestId: id,
        actorBankId: g.bankId,
        action: "QUANTITY_PROPOSED",
        detail: `${quantity} ${g.req.flag.unit}`,
      },
    });
    await tx.message.create({
      data: {
        requestId: id,
        senderBankId: g.bankId,
        text: `📝 ${actor?.name ?? "A food bank"} proposed ${quantity} ${g.req.flag.unit} of ${g.req.flag.itemName}.`,
      },
    });
  });

  return Response.json({ ok: true, agreedQuantity: quantity });
}
