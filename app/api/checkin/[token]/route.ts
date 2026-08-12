import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { OUTCOMES, statusForOutcome, type Outcome } from "@/lib/checkin";

/**
 * Public — no session. The token in the URL is the authorisation, which is the
 * whole point: a driver answers from the cab of a truck, not from an account.
 *
 * Deliberately narrow: it exposes one delivery's time and contents, and accepts
 * one answer. It never reveals inventory, other deliveries, or anything about
 * the wider network.
 */

async function load(token: string) {
  const checkIn = await prisma.checkIn.findUnique({
    where: { token },
    include: { shipment: { include: { foodBank: true, lines: true } } },
  });
  if (!checkIn) return null;
  return checkIn;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const checkIn = await load(token);
  if (!checkIn) {
    return Response.json({ error: "This link is not valid." }, { status: 404 });
  }

  const expired = checkIn.expiresAt < new Date();
  const { shipment } = checkIn;

  return Response.json({
    expired,
    answered: checkIn.respondedAt !== null,
    outcome: checkIn.outcome,
    etaMinutes: checkIn.etaMinutes,
    delivery: {
      foodBankName: shipment.foodBank.name,
      address: shipment.foodBank.address,
      direction: shipment.direction,
      scheduledFor: shipment.scheduledFor.toISOString(),
      windowEnd: shipment.windowEnd?.toISOString() ?? null,
      driverName: shipment.driverName,
      note: shipment.note,
      lines: shipment.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
      })),
    },
  });
}

const answerSchema = z.object({
  outcome: z.enum(OUTCOMES),
  etaMinutes: z.number().int().min(0).max(2880).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const checkIn = await load(token);
  if (!checkIn) {
    return Response.json({ error: "This link is not valid." }, { status: 404 });
  }
  if (checkIn.expiresAt < new Date()) {
    return Response.json(
      { error: "This link has expired — please call the food bank." },
      { status: 410 },
    );
  }

  const parsed = answerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "That answer wasn't understood." }, { status: 400 });
  }
  const { outcome, etaMinutes, note } = parsed.data;

  const eta = outcome === "DELAYED" ? (etaMinutes ?? null) : null;
  const nextStatus = statusForOutcome(outcome as Outcome);

  await prisma.$transaction(async (tx) => {
    await tx.checkIn.update({
      where: { id: checkIn.id },
      data: {
        respondedAt: new Date(),
        outcome,
        etaMinutes: eta,
        note: note?.trim() || null,
      },
    });

    if (nextStatus) {
      await tx.shipment.update({
        where: { id: checkIn.shipmentId },
        data: {
          status: nextStatus,
          etaMinutes: eta,
          // A delay moves the expected time — otherwise the projection keeps
          // planning around a slot the driver has already told us they'll miss.
          ...(outcome === "DELAYED" && eta
            ? {
                scheduledFor: new Date(
                  checkIn.shipment.scheduledFor.getTime() + eta * 60_000,
                ),
              }
            : {}),
        },
      });
    }
  });

  return Response.json({ ok: true, outcome, etaMinutes: eta });
}
