import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { loadRequestForBank } from "@/lib/requests";

async function guard(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };
  const req = await loadRequestForBank(id, bankId);
  if (!req) return { error: "Request not found.", status: 404 as const };
  return { req, bankId };
}

/** Polled every few seconds by the chat thread. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });

  const [messages, events, banks] = await Promise.all([
    prisma.message.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" } }),
    prisma.requestEvent.findMany({
      where: { requestId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.foodBank.findMany(),
  ]);

  const bankNames = new Map(banks.map((b) => [b.id, b.name] as const));

  return Response.json({
    status: g.req.status,
    finalQuantity: g.req.finalQuantity,
    agreedQuantity: g.req.agreedQuantity,
    cancelReason: g.req.cancelReason,
    availableQuantity: g.req.flag.quantity,
    flagStatus: g.req.flag.status,
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      senderBankId: m.senderBankId,
      senderBankName: bankNames.get(m.senderBankId) ?? "Unknown",
      mine: m.senderBankId === g.bankId,
    })),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      detail: e.detail,
      actorBankName: bankNames.get(e.actorBankId) ?? "Unknown",
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });

  const body = (await request.json()) as { text?: string };
  if (!body.text?.trim()) {
    return Response.json({ error: "Message is empty." }, { status: 400 });
  }

  await prisma.message.create({
    data: { requestId: id, senderBankId: g.bankId, text: body.text.trim() },
  });

  return Response.json({ ok: true });
}
