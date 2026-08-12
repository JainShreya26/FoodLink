import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { distanceMiles } from "@/lib/geo";
import { requestStage } from "@/lib/requests";

async function currentBankId() {
  return (await cookies()).get("bankId")?.value ?? null;
}

/** All open flags across the network, annotated with distance from your bank. */
export async function GET() {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const me = await prisma.foodBank.findUnique({ where: { id: bankId } });
  if (!me) return Response.json({ error: "Unknown food bank." }, { status: 401 });

  const flags = await prisma.flag.findMany({
    where: { status: "OPEN" },
    include: {
      foodBank: true,
      requests: {
        select: {
          id: true,
          requesterBankId: true,
          status: true,
          agreedQuantity: true,
          finalQuantity: true,
          scheduledFor: true,
          handoverNote: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    me: {
      id: me.id,
      name: me.name,
      address: me.address,
      latitude: me.latitude,
      longitude: me.longitude,
    },
    flags: flags.map((f) => {
      const mine = f.requests.find((r) => r.requesterBankId === bankId) ?? null;
      return {
      id: f.id,
      type: f.type,
      itemName: f.itemName,
      quantity: f.quantity,
      unit: f.unit,
      contactName: f.contactName,
      contactInfo: f.contactInfo,
      note: f.note,
      createdAt: f.createdAt.toISOString(),
      bankId: f.foodBankId,
      bankName: f.foodBank.name,
      bankAddress: f.foodBank.address,
      bankLatitude: f.foodBank.latitude,
      bankLongitude: f.foodBank.longitude,
      isMine: f.foodBankId === bankId,
      distanceMiles: Number(
        distanceMiles(
          me.latitude,
          me.longitude,
          f.foodBank.latitude,
          f.foodBank.longitude,
        ).toFixed(1),
      ),
      requestCount: f.requests.length,
      /** Live responses only — cancelled ones shouldn't inflate the count. */
      activeRequestCount: f.requests.filter((r) => r.status !== "CANCELLED").length,
      myRequestId: mine?.id ?? null,
      // Everything the board card needs to show where my own response stands,
      // so a dispatcher can read the state of play without opening the thread.
      myRequest: mine
        ? {
            id: mine.id,
            status: mine.status,
            stage: requestStage(mine),
            agreedQuantity: mine.agreedQuantity,
            finalQuantity: mine.finalQuantity,
            scheduledFor: mine.scheduledFor?.toISOString() ?? null,
            handoverNote: mine.handoverNote,
          }
        : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = await currentBankId();
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const body = (await request.json()) as {
    type?: string;
    itemName?: string;
    quantity?: number;
    unit?: string;
    contactName?: string;
    contactInfo?: string;
    note?: string;
  };

  if (body.type !== "SURPLUS" && body.type !== "SHORTAGE") {
    return Response.json({ error: "Type must be SURPLUS or SHORTAGE." }, { status: 400 });
  }
  if (!body.itemName?.trim()) {
    return Response.json({ error: "Food item is required." }, { status: 400 });
  }
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Quantity must be greater than 0." }, { status: 400 });
  }
  if (!body.unit?.trim()) {
    return Response.json({ error: "Unit is required." }, { status: 400 });
  }
  if (!body.contactName?.trim() || !body.contactInfo?.trim()) {
    return Response.json({ error: "Contact name and phone/email are required." }, { status: 400 });
  }

  const flag = await prisma.flag.create({
    data: {
      foodBankId: bankId,
      type: body.type,
      itemName: body.itemName.trim(),
      quantity,
      unit: body.unit.trim(),
      contactName: body.contactName.trim(),
      contactInfo: body.contactInfo.trim(),
      note: body.note?.trim() || null,
    },
  });

  return Response.json({ ok: true, flag });
}
