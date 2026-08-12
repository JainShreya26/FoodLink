import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";

async function guard(id: string) {
  if (!(await isAuthed())) return { error: "Not signed in.", status: 401 as const };
  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return { error: "No food bank selected.", status: 401 as const };

  const flag = await prisma.flag.findUnique({ where: { id } });
  if (!flag) return { error: "Posting not found.", status: 404 as const };
  // Only the bank that posted it can take it down.
  if (flag.foodBankId !== bankId) {
    return { error: "That isn't your posting.", status: 403 as const };
  }
  return { flag, bankId };
}

/** Close a posting once it is covered, or put it back on the board. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });

  const body = (await request.json()) as { status?: string };
  if (body.status !== "OPEN" && body.status !== "CLOSED") {
    return Response.json({ error: "Status must be OPEN or CLOSED." }, { status: 400 });
  }
  if (body.status === "OPEN" && g.flag.quantity <= 0) {
    return Response.json(
      { error: "Nothing left on this posting — post a fresh one instead." },
      { status: 400 },
    );
  }

  await prisma.flag.update({ where: { id }, data: { status: body.status } });
  return Response.json({ ok: true, status: body.status });
}

/**
 * Withdraw a posting entirely. Only allowed while nobody has responded —
 * once a conversation exists it has to stay, or the other bank's thread
 * would vanish from under them. Close it instead.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });

  const responses = await prisma.request.count({ where: { flagId: id } });
  if (responses > 0) {
    return Response.json(
      {
        error: `${responses} food bank${responses === 1 ? " has" : "s have"} already replied — close the posting instead of deleting it.`,
      },
      { status: 400 },
    );
  }

  await prisma.flag.delete({ where: { id } });
  return Response.json({ ok: true });
}
