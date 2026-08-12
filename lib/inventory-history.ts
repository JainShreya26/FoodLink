import type { InventoryItem, Prisma } from "@prisma/client";

/**
 * Stock is never silently overwritten. Every create, edit, removal, restore and
 * network transfer appends an InventoryEvent, and removals are soft, so the
 * question "what happened to those 200 lbs of rice" always has an answer.
 */

export type EventAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "RESTORED"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "TRANSFER_REVERSED";

/** Fields worth showing a human in a diff. */
const TRACKED = ["name", "category", "quantity", "unit", "expiryDate", "source"] as const;
type Tracked = (typeof TRACKED)[number];

const normalize = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null);

export type FieldChange = { from: unknown; to: unknown };

/** Field-level diff of an item before and after an edit, or null if nothing moved. */
export function diffItem(
  before: Pick<InventoryItem, Tracked>,
  after: Pick<InventoryItem, Tracked>,
): Record<string, FieldChange> | null {
  const changes: Record<string, FieldChange> = {};
  for (const field of TRACKED) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from !== to) changes[field] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function recordEvent(
  tx: Prisma.TransactionClient,
  input: {
    itemId: string;
    foodBankId: string;
    itemName: string;
    action: EventAction;
    actorBankId: string;
    quantityBefore?: number | null;
    quantityAfter?: number | null;
    changes?: Record<string, FieldChange> | null;
    note?: string | null;
    requestId?: string | null;
  },
) {
  return tx.inventoryEvent.create({
    data: {
      itemId: input.itemId,
      foodBankId: input.foodBankId,
      itemName: input.itemName,
      action: input.action,
      actorBankId: input.actorBankId,
      quantityBefore: input.quantityBefore ?? null,
      quantityAfter: input.quantityAfter ?? null,
      changes: input.changes ? JSON.stringify(input.changes) : null,
      note: input.note ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

/** Human sentence for one event, used by the history panel. */
export function describeEvent(e: {
  action: string;
  itemName: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  changes: string | null;
  note: string | null;
}): string {
  switch (e.action) {
    case "CREATED":
      return `Added ${e.quantityAfter ?? ""} to inventory`.trim();
    case "DELETED":
      return `Removed from inventory${e.note ? ` — ${e.note}` : ""}`;
    case "RESTORED":
      return "Restored to inventory";
    case "TRANSFER_IN":
      return `Received ${qtyDelta(e)} via network transfer`;
    case "TRANSFER_OUT":
      return `Sent ${qtyDelta(e)} via network transfer`;
    case "TRANSFER_REVERSED":
      return `Transfer reversed${e.note ? ` — ${e.note}` : ""}`;
    case "UPDATED": {
      const parsed = parseChanges(e.changes);
      if (!parsed) return "Edited";
      const parts = Object.entries(parsed).map(
        ([field, c]) => `${field}: ${fmt(c.from)} → ${fmt(c.to)}`,
      );
      return `Edited — ${parts.join(", ")}`;
    }
    default:
      return e.action;
  }
}

function qtyDelta(e: { quantityBefore: number | null; quantityAfter: number | null }) {
  if (e.quantityBefore == null || e.quantityAfter == null) return "";
  return String(Math.abs(e.quantityAfter - e.quantityBefore));
}

export function parseChanges(raw: string | null): Record<string, FieldChange> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, FieldChange>;
  } catch {
    return null;
  }
}

const fmt = (v: unknown) => (v === null || v === "" ? "—" : String(v));
