import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { projectInventory } from "@/lib/projection";

const HORIZONS = [7, 14, 30, 60] as const;

async function currentBankId() {
  if (!(await isAuthed())) return null;
  return (await cookies()).get("bankId")?.value ?? null;
}

export async function GET(request: Request) {
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "Not signed in." }, { status: 401 });

  const raw = Number(new URL(request.url).searchParams.get("days") ?? 14);
  const days = (HORIZONS as readonly number[]).includes(raw) ? raw : 14;

  return Response.json({ days, rows: await projectInventory(bankId, days) });
}

const parSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(20),
  minQuantity: z.number().min(0),
});

/** Set or clear the minimum a bank wants to keep on hand. */
export async function PUT(request: Request) {
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "Not signed in." }, { status: 401 });

  const parsed = parSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid par level." }, { status: 400 });
  }
  const { name, unit, minQuantity } = parsed.data;

  if (minQuantity === 0) {
    await prisma.parLevel.deleteMany({ where: { foodBankId: bankId, name, unit } });
    return Response.json({ ok: true, cleared: true });
  }

  const parLevel = await prisma.parLevel.upsert({
    where: { foodBankId_name_unit: { foodBankId: bankId, name, unit } },
    update: { minQuantity },
    create: { foodBankId: bankId, name, unit, minQuantity },
  });

  return Response.json({ ok: true, parLevel });
}
