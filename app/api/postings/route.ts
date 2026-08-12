import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { requestStage } from "@/lib/requests";

/**
 * Your own side of the board: what this food bank has posted, and who answered.
 *
 * Deliberately separate from /api/flags — that answers "what is the network
 * offering me", this answers "what is happening to my asks". Mixing the two
 * into one grid was the thing that made the board hard to read.
 */
export async function GET() {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const [flags, banks] = await Promise.all([
    prisma.flag.findMany({
      where: { foodBankId: bankId },
      include: {
        requests: {
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            _count: { select: { messages: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.foodBank.findMany({ select: { id: true, name: true, address: true } }),
  ]);

  const bankById = new Map(banks.map((b) => [b.id, b]));

  return Response.json({
    postings: flags.map((f) => {
      const responses = f.requests.map((r) => {
        const other = bankById.get(r.requesterBankId);
        return {
          id: r.id,
          stage: requestStage(r),
          status: r.status,
          bankName: other?.name ?? "Unknown food bank",
          bankAddress: other?.address ?? null,
          agreedQuantity: r.agreedQuantity,
          finalQuantity: r.finalQuantity,
          scheduledFor: r.scheduledFor?.toISOString() ?? null,
          handoverNote: r.handoverNote,
          cancelReason: r.cancelReason,
          messageCount: r._count.messages,
          lastMessage: r.messages[0]?.text ?? null,
          lastMessageAt: r.messages[0]?.createdAt.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      });

      return {
        id: f.id,
        type: f.type,
        itemName: f.itemName,
        quantity: f.quantity,
        unit: f.unit,
        contactName: f.contactName,
        contactInfo: f.contactInfo,
        note: f.note,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
        responses,
        /** What is still in play, so the header can lead with the live number. */
        openCount: responses.filter(
          (r) => r.status !== "CANCELLED" && r.status !== "COMPLETED",
        ).length,
        committedQuantity: responses
          .filter((r) => r.status === "COMPLETED")
          .reduce((sum, r) => sum + (r.finalQuantity ?? 0), 0),
      };
    }),
  });
}
