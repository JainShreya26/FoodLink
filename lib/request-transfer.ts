import type { Prisma } from "@prisma/client";
import { recordEvent } from "./inventory-history";

/**
 * Moving food between banks, and putting it back.
 *
 * Both directions write InventoryEvents rather than quietly overwriting a
 * number, so a completed transfer that turns out to be wrong can be reversed
 * and the whole sequence still reads correctly in the item's history.
 */

type Ctx = {
  tx: Prisma.TransactionClient;
  requestId: string;
  actorBankId: string;
  itemName: string;
  unit: string;
  quantity: number;
};

/** Find a bank's active row for this item, matching on name + unit. */
async function findItem(
  tx: Prisma.TransactionClient,
  foodBankId: string,
  itemName: string,
  unit: string,
  includeRemoved = false,
) {
  const candidates = await tx.inventoryItem.findMany({
    where: {
      foodBankId,
      unit,
      ...(includeRemoved ? {} : { deletedAt: null }),
    },
    orderBy: { deletedAt: "asc" },
  });
  return (
    candidates.find((i) => i.name.toLowerCase() === itemName.toLowerCase()) ?? null
  );
}

export async function applyTransfer(
  ctx: Ctx & { giverBankId: string; receiverBankId: string; giverBankName: string },
) {
  const { tx, giverBankId, receiverBankId, itemName, unit, quantity } = ctx;

  // Giver side — decrement, and retire the row if it empties out.
  const giverItem = await findItem(tx, giverBankId, itemName, unit);
  if (giverItem) {
    const after = Math.max(0, giverItem.quantity - quantity);
    await tx.inventoryItem.update({
      where: { id: giverItem.id },
      data: { quantity: after, ...(after === 0 ? { deletedAt: new Date() } : {}) },
    });
    await recordEvent(tx, {
      itemId: giverItem.id,
      foodBankId: giverBankId,
      itemName: giverItem.name,
      action: "TRANSFER_OUT",
      actorBankId: ctx.actorBankId,
      quantityBefore: giverItem.quantity,
      quantityAfter: after,
      requestId: ctx.requestId,
      note: `${quantity} ${unit} transferred out`,
    });
  }

  // Receiver side — fold into a matching row, or start one.
  const receiverItem = await findItem(tx, receiverBankId, itemName, unit);
  if (receiverItem) {
    const after = receiverItem.quantity + quantity;
    await tx.inventoryItem.update({
      where: { id: receiverItem.id },
      data: { quantity: after },
    });
    await recordEvent(tx, {
      itemId: receiverItem.id,
      foodBankId: receiverBankId,
      itemName: receiverItem.name,
      action: "TRANSFER_IN",
      actorBankId: ctx.actorBankId,
      quantityBefore: receiverItem.quantity,
      quantityAfter: after,
      requestId: ctx.requestId,
      note: `${quantity} ${unit} from ${ctx.giverBankName}`,
    });
  } else {
    const created = await tx.inventoryItem.create({
      data: {
        foodBankId: receiverBankId,
        name: itemName,
        category: giverItem?.category ?? "Other",
        quantity,
        unit,
        expiryDate: giverItem?.expiryDate ?? null,
        source: `Transfer from ${ctx.giverBankName}`,
      },
    });
    await recordEvent(tx, {
      itemId: created.id,
      foodBankId: receiverBankId,
      itemName: created.name,
      action: "TRANSFER_IN",
      actorBankId: ctx.actorBankId,
      quantityAfter: quantity,
      requestId: ctx.requestId,
      note: `${quantity} ${unit} from ${ctx.giverBankName}`,
    });
  }
}

/** Undo a completed transfer: food goes back where it came from. */
export async function reverseTransfer(
  ctx: Ctx & { giverBankId: string; receiverBankId: string; reason: string | null },
) {
  const { tx, giverBankId, receiverBankId, itemName, unit, quantity } = ctx;
  const note = ctx.reason ? `Reversed — ${ctx.reason}` : "Transfer reversed";

  // Receiver gives it back.
  const receiverItem = await findItem(tx, receiverBankId, itemName, unit);
  if (receiverItem) {
    const after = Math.max(0, receiverItem.quantity - quantity);
    await tx.inventoryItem.update({
      where: { id: receiverItem.id },
      data: { quantity: after, ...(after === 0 ? { deletedAt: new Date() } : {}) },
    });
    await recordEvent(tx, {
      itemId: receiverItem.id,
      foodBankId: receiverBankId,
      itemName: receiverItem.name,
      action: "TRANSFER_REVERSED",
      actorBankId: ctx.actorBankId,
      quantityBefore: receiverItem.quantity,
      quantityAfter: after,
      requestId: ctx.requestId,
      note,
    });
  }

  // Giver gets it back — including un-retiring a row the transfer emptied.
  const giverItem = await findItem(tx, giverBankId, itemName, unit, true);
  if (giverItem) {
    const after = giverItem.quantity + quantity;
    await tx.inventoryItem.update({
      where: { id: giverItem.id },
      data: { quantity: after, deletedAt: null },
    });
    await recordEvent(tx, {
      itemId: giverItem.id,
      foodBankId: giverBankId,
      itemName: giverItem.name,
      action: "TRANSFER_REVERSED",
      actorBankId: ctx.actorBankId,
      quantityBefore: giverItem.quantity,
      quantityAfter: after,
      requestId: ctx.requestId,
      note,
    });
  }
}
