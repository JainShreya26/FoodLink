import { z } from "zod";
import { prisma } from "./prisma";

/**
 * The only way the AI assistant is allowed to read data.
 *
 * Every function here takes `bankId` as its first argument and applies it to the
 * WHERE clause itself. The model chooses a function and its arguments; it never
 * composes SQL, so it cannot reach another food bank's rows even if the prompt
 * is manipulated into trying.
 */

export const CATEGORIES = [
  "Protein",
  "Grain",
  "Vegetable",
  "Fruit",
  "Dairy",
  "Other",
] as const;

const MAX_ROWS = 200;

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/* ------------------------------------------------------------------ */
/* Argument schemas — also fed to Claude as the tool input schemas      */
/* ------------------------------------------------------------------ */

export const listInventoryArgs = z.object({
  category: z.enum(CATEGORIES).optional()
    .describe("Restrict to one food category."),
  search: z.string().min(1).max(80).optional()
    .describe("Case-insensitive substring match on the item name."),
  source: z.string().min(1).max(80).optional()
    .describe("Substring match on where the food came from, e.g. 'Safeway'."),
  expiringWithinDays: z.number().int().min(0).max(3650).optional()
    .describe("Only items with an expiry date this many days out or sooner."),
  expiryState: z.enum(["any", "expired", "unexpired", "dated", "undated"])
    .optional()
    .describe("Filter by expiry status. Defaults to 'any'."),
  sortBy: z.enum(["expiry", "quantity", "name", "newest"]).optional()
    .describe("Sort order. Defaults to 'expiry' (soonest first)."),
  limit: z.number().int().min(1).max(MAX_ROWS).optional()
    .describe(`Maximum rows to return (max ${MAX_ROWS}, default 50).`),
});

export const totalsArgs = z.object({
  groupBy: z.enum(["category", "unit", "source", "categoryAndUnit"])
    .describe(
      "What to group by. Quantities are only meaningful within a single unit, " +
        "so prefer 'categoryAndUnit' when reporting sums.",
    ),
});

export const networkListingsArgs = z.object({
  type: z.enum(["SURPLUS", "SHORTAGE"]).optional()
    .describe("Restrict to surplus offers or shortage requests."),
  search: z.string().min(1).max(80).optional()
    .describe("Substring match on the flagged item name."),
  withinMiles: z.number().min(1).max(3000).optional()
    .describe("Only listings from food banks within this straight-line radius."),
  limit: z.number().int().min(1).max(100).optional(),
});

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type InventoryRow = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  source: string | null;
};

export async function listInventory(
  bankId: string,
  args: z.infer<typeof listInventoryArgs>,
): Promise<{ rows: InventoryRow[]; truncated: boolean }> {
  const {
    category,
    search,
    source,
    expiringWithinDays,
    expiryState = "any",
    sortBy = "expiry",
    limit = 50,
  } = args;

  const now = new Date();
  const where: Record<string, unknown> = { foodBankId: bankId, deletedAt: null };

  if (category) where.category = category;
  if (search) where.name = { contains: search };
  if (source) where.source = { contains: source };

  const expiry: Record<string, unknown> = {};
  if (expiringWithinDays !== undefined) {
    expiry.lte = daysFromNow(expiringWithinDays);
  }
  if (expiryState === "expired") expiry.lt = now;
  if (expiryState === "unexpired") expiry.gte = now;

  if (expiryState === "undated") {
    where.expiryDate = null;
  } else if (Object.keys(expiry).length > 0) {
    where.expiryDate = expiry;
  } else if (expiryState === "dated") {
    where.expiryDate = { not: null };
  }

  const orderBy =
    sortBy === "quantity"
      ? { quantity: "desc" as const }
      : sortBy === "name"
        ? { name: "asc" as const }
        : sortBy === "newest"
          ? { createdAt: "desc" as const }
          : { expiryDate: "asc" as const };

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy,
    take: limit + 1,
  });

  const truncated = items.length > limit;
  const rows = items.slice(0, limit).map((i) => ({
    name: i.name,
    category: i.category,
    quantity: i.quantity,
    unit: i.unit,
    expiryDate: i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : null,
    daysUntilExpiry: i.expiryDate
      ? Math.round((i.expiryDate.getTime() - now.getTime()) / 86_400_000)
      : null,
    source: i.source,
  }));

  return { rows, truncated };
}

export async function inventoryTotals(
  bankId: string,
  { groupBy }: z.infer<typeof totalsArgs>,
) {
  const by =
    groupBy === "categoryAndUnit"
      ? (["category", "unit"] as const)
      : ([groupBy] as const);

  const groups = await prisma.inventoryItem.groupBy({
    by: [...by],
    where: { foodBankId: bankId, deletedAt: null },
    _sum: { quantity: true },
    _count: { _all: true },
  });

  return groups
    .map((g) => ({
      category: "category" in g ? g.category : undefined,
      unit: "unit" in g ? g.unit : undefined,
      source: "source" in g ? g.source : undefined,
      totalQuantity: g._sum.quantity ?? 0,
      lineItems: g._count._all,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);
}

/**
 * Open flags from across the network. This is the same data every signed-in bank
 * already sees on the board, annotated with distance from the caller.
 */
export async function networkListings(
  bankId: string,
  args: z.infer<typeof networkListingsArgs>,
) {
  const { distanceMiles } = await import("./geo");
  const me = await prisma.foodBank.findUnique({ where: { id: bankId } });
  if (!me) return [];

  const flags = await prisma.flag.findMany({
    where: {
      status: "OPEN",
      ...(args.type ? { type: args.type } : {}),
      ...(args.search ? { itemName: { contains: args.search } } : {}),
    },
    include: { foodBank: true },
    orderBy: { createdAt: "desc" },
  });

  return flags
    .map((f) => ({
      type: f.type,
      itemName: f.itemName,
      quantity: f.quantity,
      unit: f.unit,
      foodBank: f.foodBank.name,
      isMine: f.foodBankId === bankId,
      note: f.note,
      milesAway: Number(
        distanceMiles(
          me.latitude,
          me.longitude,
          f.foodBank.latitude,
          f.foodBank.longitude,
        ).toFixed(1),
      ),
    }))
    .filter((f) => args.withinMiles === undefined || f.milesAway <= args.withinMiles)
    .sort((a, b) => a.milesAway - b.milesAway)
    .slice(0, args.limit ?? 25);
}
