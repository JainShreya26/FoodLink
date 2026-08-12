import { prisma } from "./prisma";
import { PENDING_STATUSES } from "./shipments";

/**
 * Projected on-hand.
 *
 *   projected = current stock + expected inbound − committed outbound
 *
 * This is the number that decides whether a shortage is real. A bank can look
 * short on rice today and be fine on Thursday because a USDA drop is booked —
 * posting that shortage wastes somebody's drive.
 *
 * Items are keyed by name + unit: quantities in different units cannot be added,
 * so "180 cans" and "40 lbs" of tomatoes stay separate lines.
 */

export type ProjectionStatus = "SHORT" | "WATCH" | "OK";

export type ProjectionRow = {
  key: string;
  name: string;
  unit: string;
  category: string;
  onHand: number;
  inbound: number;
  outbound: number;
  projected: number;
  parLevel: number | null;
  status: ProjectionStatus;
  expiringSoon: number;
  nextArrival: string | null;
  movements: {
    shipmentId: string;
    direction: string;
    quantity: number;
    scheduledFor: string;
    status: string;
    sourceName: string | null;
  }[];
};

const keyOf = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;

export async function projectInventory(bankId: string, horizonDays: number) {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const expirySoonCutoff = new Date(now.getTime() + 14 * 86_400_000);

  const [items, shipments, parLevels] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { foodBankId: bankId, deletedAt: null },
    }),
    prisma.shipment.findMany({
      where: {
        foodBankId: bankId,
        status: { in: PENDING_STATUSES },
        scheduledFor: { lte: horizon },
      },
      include: { lines: true },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.parLevel.findMany({ where: { foodBankId: bankId } }),
  ]);

  const rows = new Map<string, ProjectionRow>();

  const ensure = (name: string, unit: string, category: string): ProjectionRow => {
    const key = keyOf(name, unit);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        name,
        unit,
        category,
        onHand: 0,
        inbound: 0,
        outbound: 0,
        projected: 0,
        parLevel: null,
        status: "OK",
        expiringSoon: 0,
        nextArrival: null,
        movements: [],
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const item of items) {
    const row = ensure(item.name, item.unit, item.category);
    row.onHand += item.quantity;
    if (item.expiryDate && item.expiryDate <= expirySoonCutoff) {
      row.expiringSoon += item.quantity;
    }
  }

  for (const shipment of shipments) {
    for (const line of shipment.lines) {
      const row = ensure(line.name, line.unit, line.category);
      const inbound = shipment.direction === "INBOUND";
      if (inbound) row.inbound += line.quantity;
      else row.outbound += line.quantity;

      row.movements.push({
        shipmentId: shipment.id,
        direction: shipment.direction,
        quantity: line.quantity,
        scheduledFor: shipment.scheduledFor.toISOString(),
        status: shipment.status,
        sourceName: shipment.sourceName,
      });

      if (inbound) {
        const iso = shipment.scheduledFor.toISOString();
        if (!row.nextArrival || iso < row.nextArrival) row.nextArrival = iso;
      }
    }
  }

  const pars = new Map(parLevels.map((p) => [keyOf(p.name, p.unit), p.minQuantity]));

  for (const row of rows.values()) {
    row.projected = row.onHand + row.inbound - row.outbound;
    row.parLevel = pars.get(row.key) ?? null;
    row.status = classify(row);
    row.movements.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }

  return [...rows.values()].sort((a, b) => {
    const rank = { SHORT: 0, WATCH: 1, OK: 2 } as const;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.name.localeCompare(b.name);
  });
}

/**
 * Without a par level we can only speak to direction of travel: running to zero
 * is short, shrinking or largely expiring is worth watching.
 */
function classify(row: ProjectionRow): ProjectionStatus {
  if (row.parLevel !== null) {
    if (row.projected < row.parLevel) return "SHORT";
    if (row.projected < row.parLevel * 1.25) return "WATCH";
    return "OK";
  }
  if (row.projected <= 0) return "SHORT";
  const usable = row.onHand - row.expiringSoon;
  if (row.projected < row.onHand || usable <= 0) return "WATCH";
  return "OK";
}
