import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function RequestsPage() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  const requests = await prisma.request.findMany({
    where: {
      OR: [{ requesterBankId: bank.id }, { flag: { foodBankId: bank.id } }],
    },
    include: {
      flag: { include: { foodBank: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const bankNames = new Map(
    (await prisma.foodBank.findMany()).map((b) => [b.id, b.name] as const),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Requests</h1>
      <p className="text-sm text-stone-500">
        Conversations {bank.name} is part of, in both directions.
      </p>

      <div className="mt-4 space-y-3">
        {requests.map((r) => {
          const iPosted = r.flag.foodBankId === bank.id;
          const otherBankName = iPosted
            ? (bankNames.get(r.requesterBankId) ?? "Unknown")
            : r.flag.foodBank.name;
          const surplus = r.flag.type === "SURPLUS";
          const done = r.status === "COMPLETED";
          const cancelled = r.status === "CANCELLED";

          return (
            <Link
              key={r.id}
              href={`/requests/${r.id}`}
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-emerald-400"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    surplus ? "bg-emerald-700 text-white" : "bg-amber-600 text-white"
                  }`}
                >
                  {surplus ? "Surplus" : "Shortage"}
                </span>
                <span className="font-semibold">{r.flag.itemName}</span>
                <span className="text-sm text-stone-500">
                  {done
                    ? `${r.finalQuantity} ${r.flag.unit} transferred`
                    : `${r.flag.quantity} ${r.flag.unit}`}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    done
                      ? "bg-stone-200 text-stone-600"
                      : cancelled
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {done ? "Completed" : cancelled ? "Cancelled" : "Open"}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-600">
                {iPosted ? "You posted · " : "You responded · "}
                <span className="font-medium">{otherBankName}</span>
              </p>
              {r.messages[0] && (
                <p className="mt-1 truncate text-xs text-stone-400">
                  {r.messages[0].text}
                </p>
              )}
            </Link>
          );
        })}

        {requests.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
            No requests yet. Head to the{" "}
            <Link href="/board" className="text-emerald-700 underline">
              Network Board
            </Link>{" "}
            to respond to a flag.
          </div>
        )}
      </div>
    </div>
  );
}
