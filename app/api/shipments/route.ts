import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { parseExpiry } from "@/lib/expiry";
import { shipmentSchema } from "@/lib/shipments";

async function currentBankId() {
  if (!(await isAuthed())) return null;
  return (await cookies()).get("bankId")?.value ?? null;
}

export async function GET() {
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "Not signed in." }, { status: 401 });

  const shipments = await prisma.shipment.findMany({
    where: { foodBankId: bankId },
    include: { lines: true },
    orderBy: { scheduledFor: "asc" },
  });

  return Response.json({
    shipments: shipments.map((s) => ({
      ...s,
      scheduledFor: s.scheduledFor.toISOString(),
      windowEnd: s.windowEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      lines: s.lines.map((l) => ({
        ...l,
        expiryDate: l.expiryDate ? l.expiryDate.toISOString().slice(0, 10) : null,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "Not signed in." }, { status: 401 });

  const parsed = shipmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid delivery." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const scheduledFor = new Date(body.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    return Response.json({ error: "Invalid scheduled date." }, { status: 400 });
  }

  const shipment = await prisma.shipment.create({
    data: {
      foodBankId: bankId,
      direction: body.direction,
      sourceType: body.sourceType,
      sourceName: body.sourceName?.trim() || null,
      scheduledFor,
      windowEnd: body.windowEnd ? new Date(body.windowEnd) : null,
      driverName: body.driverName?.trim() || null,
      driverPhone: body.driverPhone?.trim() || null,
      driverConsent: body.driverConsent ?? false,
      note: body.note?.trim() || null,
      lines: {
        create: body.lines.map((l) => ({
          name: l.name.trim(),
          category: l.category,
          quantity: l.quantity,
          unit: l.unit.trim(),
          expiryDate: parseExpiry(l.expiryDate ?? null),
        })),
      },
    },
    include: { lines: true },
  });

  return Response.json({ ok: true, shipment });
}
