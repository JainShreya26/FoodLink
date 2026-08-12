import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { LINK_TTL_HOURS, buildMessage, newToken } from "@/lib/checkin";
import { sendSms, smsMode } from "@/lib/notify";

async function authorize(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { foodBank: true },
  });
  if (!shipment || shipment.foodBankId !== bankId)
    return { error: "Delivery not found.", status: 404 as const };
  return { shipment, bankId };
}

/** Check-in history for one delivery. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const checkIns = await prisma.checkIn.findMany({
    where: { shipmentId: id },
    orderBy: { requestedAt: "desc" },
  });

  return Response.json({ mode: smsMode(), checkIns });
}

/** Ask the driver whether they are still coming. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { shipment } = auth;

  if (["RECEIVED", "CANCELLED"].includes(shipment.status)) {
    return Response.json(
      { error: "This delivery is already closed out." },
      { status: 400 },
    );
  }
  if (!shipment.driverPhone) {
    return Response.json(
      { error: "Add a driver phone number to this delivery first." },
      { status: 400 },
    );
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000);

  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const link = `${proto}://${host}/checkin/${token}`;

  const body = buildMessage({
    bankName: shipment.foodBank.name,
    when: shipment.scheduledFor,
    link,
    driverName: shipment.driverName,
  });

  const result = await sendSms({
    to: shipment.driverPhone,
    body,
    consent: shipment.driverConsent,
  });

  const checkIn = await prisma.checkIn.create({
    data: {
      shipmentId: id,
      token,
      channel: "SMS",
      expiresAt,
      deliveryStatus: result.status,
      deliveryDetail: result.detail,
    },
  });

  // The link is returned either way — if nothing was sent, a dispatcher can
  // still read it out or paste it into their own messaging app.
  return Response.json({
    ok: true,
    checkIn,
    link,
    message: body,
    delivery: result,
    mode: smsMode(),
  });
}
