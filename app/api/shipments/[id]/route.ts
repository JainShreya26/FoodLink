import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { parseExpiry } from "@/lib/expiry";
import { recordEvent } from "@/lib/inventory-history";
import { SOURCE_LABELS, shipmentPatchSchema } from "@/lib/shipments";

async function authorize(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!shipment || shipment.foodBankId !== bankId)
    return { error: "Delivery not found.", status: 404 as const };
  return { shipment, bankId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { shipment, bankId } = auth;

  const parsed = shipmentPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid change." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (shipment.status === "RECEIVED" && body.status !== "RECEIVED") {
    return Response.json(
      { error: "This delivery was already received into inventory." },
      { status: 400 },
    );
  }

  // Receiving an inbound delivery is what actually moves it into stock.
  const receiving =
    body.status === "RECEIVED" &&
    shipment.status !== "RECEIVED" &&
    shipment.direction === "INBOUND";

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.shipment.update({
      where: { id },
      data: {
        ...(body.direction !== undefined && { direction: body.direction }),
        ...(body.sourceType !== undefined && { sourceType: body.sourceType }),
        ...(body.sourceName !== undefined && {
          sourceName: body.sourceName?.trim() || null,
        }),
        ...(body.scheduledFor !== undefined && {
          scheduledFor: new Date(body.scheduledFor),
        }),
        ...(body.windowEnd !== undefined && {
          windowEnd: body.windowEnd ? new Date(body.windowEnd) : null,
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.driverName !== undefined && {
          driverName: body.driverName?.trim() || null,
        }),
        ...(body.driverPhone !== undefined && {
          driverPhone: body.driverPhone?.trim() || null,
        }),
        ...(body.driverConsent !== undefined && { driverConsent: body.driverConsent }),
        ...(body.etaMinutes !== undefined && { etaMinutes: body.etaMinutes }),
        ...(body.note !== undefined && { note: body.note?.trim() || null }),
        // Lines are replaced wholesale — simpler than diffing, and a delivery
        // that has not landed has no history worth preserving per line.
        ...(body.lines !== undefined && {
          lines: {
            deleteMany: {},
            create: body.lines.map((l) => ({
              name: l.name.trim(),
              category: l.category,
              quantity: l.quantity,
              unit: l.unit.trim(),
              expiryDate: parseExpiry(l.expiryDate ?? null),
            })),
          },
        }),
      },
      include: { lines: true },
    });

    if (receiving) {
      const source = row.sourceName
        ? `${row.sourceName} (${SOURCE_LABELS[row.sourceType as keyof typeof SOURCE_LABELS] ?? row.sourceType})`
        : (SOURCE_LABELS[row.sourceType as keyof typeof SOURCE_LABELS] ?? row.sourceType);

      for (const line of row.lines) {
        // Fold into a matching active row if there is one, else create it.
        const existing = await tx.inventoryItem.findFirst({
          where: {
            foodBankId: bankId,
            unit: line.unit,
            name: line.name,
            deletedAt: null,
          },
        });

        if (existing) {
          const after = existing.quantity + line.quantity;
          await tx.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: after },
          });
          await recordEvent(tx, {
            itemId: existing.id,
            foodBankId: bankId,
            itemName: existing.name,
            action: "CREATED",
            actorBankId: bankId,
            quantityBefore: existing.quantity,
            quantityAfter: after,
            note: `Received from ${source}`,
          });
        } else {
          const item = await tx.inventoryItem.create({
            data: {
              foodBankId: bankId,
              name: line.name,
              category: line.category,
              quantity: line.quantity,
              unit: line.unit,
              expiryDate: line.expiryDate,
              source,
            },
          });
          await recordEvent(tx, {
            itemId: item.id,
            foodBankId: bankId,
            itemName: item.name,
            action: "CREATED",
            actorBankId: bankId,
            quantityAfter: item.quantity,
            note: `Received from ${source}`,
          });
        }
      }
    }

    return row;
  });

  return Response.json({ ok: true, shipment: updated, received: receiving });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  if (auth.shipment.status === "RECEIVED") {
    return Response.json(
      { error: "Received deliveries can't be deleted — cancel a future one instead." },
      { status: 400 },
    );
  }

  await prisma.shipment.delete({ where: { id } });
  return Response.json({ ok: true });
}
