import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { parseExpiry } from "@/lib/expiry";
import { diffItem, recordEvent } from "@/lib/inventory-history";

async function authorize(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.foodBankId !== bankId)
    return { error: "Item not found.", status: 404 as const };
  return { item, bankId };
}

/** Item history — every event ever recorded against this row. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const events = await prisma.inventoryEvent.findMany({
    where: { itemId: id },
    orderBy: { createdAt: "desc" },
  });

  const bankNames = new Map(
    (await prisma.foodBank.findMany()).map((b) => [b.id, b.name] as const),
  );

  return Response.json({
    item: auth.item,
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      itemName: e.itemName,
      quantityBefore: e.quantityBefore,
      quantityAfter: e.quantityAfter,
      changes: e.changes,
      note: e.note,
      requestId: e.requestId,
      actorBankName: bankNames.get(e.actorBankId) ?? "Unknown",
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { item, bankId } = auth;

  const body = (await request.json()) as {
    name?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    expiryDate?: string | null;
    source?: string | null;
    note?: string;
    restore?: boolean;
  };

  // Restoring a removed item is an edit like any other, and gets its own event.
  if (body.restore) {
    if (!item.deletedAt) {
      return Response.json({ error: "That item is not removed." }, { status: 400 });
    }
    const restored = await prisma.$transaction(async (tx) => {
      const row = await tx.inventoryItem.update({
        where: { id },
        data: { deletedAt: null },
      });
      await recordEvent(tx, {
        itemId: id,
        foodBankId: bankId,
        itemName: row.name,
        action: "RESTORED",
        actorBankId: bankId,
        quantityAfter: row.quantity,
        note: body.note ?? null,
      });
      return row;
    });
    return Response.json({ ok: true, item: restored });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.inventoryItem.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.category !== undefined && { category: String(body.category) }),
        ...(body.quantity !== undefined && { quantity: Number(body.quantity) || 0 }),
        ...(body.unit !== undefined && { unit: String(body.unit) }),
        ...(body.expiryDate !== undefined && { expiryDate: parseExpiry(body.expiryDate) }),
        ...(body.source !== undefined && {
          source: body.source ? String(body.source) : null,
        }),
      },
    });

    const changes = diffItem(item, row);
    if (changes) {
      await recordEvent(tx, {
        itemId: id,
        foodBankId: bankId,
        itemName: row.name,
        action: "UPDATED",
        actorBankId: bankId,
        quantityBefore: item.quantity,
        quantityAfter: row.quantity,
        changes,
        note: body.note ?? null,
      });
    }
    return row;
  });

  return Response.json({ ok: true, item: updated });
}

/** Soft delete — the row and its history stay, it just leaves the active list. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { item, bankId } = auth;

  if (item.deletedAt) {
    return Response.json({ error: "Already removed." }, { status: 400 });
  }

  let note: string | null = null;
  try {
    const body = (await request.json()) as { note?: string };
    note = body.note?.trim() || null;
  } catch {
    // no body is fine
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordEvent(tx, {
      itemId: id,
      foodBankId: bankId,
      itemName: item.name,
      action: "DELETED",
      actorBankId: bankId,
      quantityBefore: item.quantity,
      quantityAfter: 0,
      note,
    });
  });

  return Response.json({ ok: true });
}
