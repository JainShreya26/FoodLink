import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const body = (await request.json()) as { flagId?: string; message?: string };
  if (!body.flagId) return Response.json({ error: "Missing flag." }, { status: 400 });

  const flag = await prisma.flag.findUnique({ where: { id: body.flagId } });
  if (!flag) return Response.json({ error: "Flag not found." }, { status: 404 });
  if (flag.foodBankId === bankId) {
    return Response.json({ error: "That's your own flag." }, { status: 400 });
  }
  if (flag.status !== "OPEN") {
    return Response.json({ error: "This flag is closed." }, { status: 400 });
  }

  // One request per bank per flag — reuse if it already exists.
  const existing = await prisma.request.findFirst({
    where: { flagId: flag.id, requesterBankId: bankId },
  });
  if (existing) return Response.json({ ok: true, requestId: existing.id, existing: true });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.request.create({
      data: { flagId: flag.id, requesterBankId: bankId },
    });

    await tx.requestEvent.create({
      data: { requestId: row.id, actorBankId: bankId, action: "CREATED" },
    });

    if (body.message?.trim()) {
      await tx.message.create({
        data: {
          requestId: row.id,
          senderBankId: bankId,
          text: body.message.trim(),
        },
      });
    }
    return row;
  });

  return Response.json({ ok: true, requestId: created.id });
}
