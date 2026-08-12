import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { parseExpiry } from "@/lib/expiry";
import { recordEvent } from "@/lib/inventory-history";

type IncomingItem = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  source: string | null;
};

export async function GET(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const removed = new URL(request.url).searchParams.get("removed") === "1";

  const items = await prisma.inventoryItem.findMany({
    where: { foodBankId: bankId, deletedAt: removed ? { not: null } : null },
    orderBy: removed ? { deletedAt: "desc" } : { createdAt: "desc" },
  });
  return Response.json({ items });
}

export async function POST(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const body = (await request.json()) as { items?: IncomingItem[]; note?: string };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: "No items to save." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const i of body.items!) {
      const item = await tx.inventoryItem.create({
        data: {
          foodBankId: bankId,
          name: String(i.name),
          category: String(i.category),
          quantity: Number(i.quantity) || 0,
          unit: String(i.unit),
          expiryDate: parseExpiry(i.expiryDate),
          source: i.source ? String(i.source) : null,
        },
      });
      await recordEvent(tx, {
        itemId: item.id,
        foodBankId: bankId,
        itemName: item.name,
        action: "CREATED",
        actorBankId: bankId,
        quantityAfter: item.quantity,
        note: body.note ?? null,
      });
      rows.push(item);
    }
    return rows;
  });

  return Response.json({ ok: true, count: created.length });
}
