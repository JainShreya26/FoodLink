import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { loadRequestForBank, transferDirection } from "@/lib/requests";
import ChatThread from "./ChatThread";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  const { id } = await params;
  const req = await loadRequestForBank(id, bank.id);
  if (!req) notFound();

  const iPosted = req.flag.foodBankId === bank.id;
  const requesterBank = await prisma.foodBank.findUnique({
    where: { id: req.requesterBankId },
  });
  const otherBank = iPosted ? requesterBank : req.flag.foodBank;
  const you = " (you)";

  const { giverBankId } = transferDirection(
    req.flag.type,
    req.flag.foodBankId,
    req.requesterBankId,
  );
  const iAmGiver = giverBankId === bank.id;
  const surplus = req.flag.type === "SURPLUS";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/requests" className="text-sm text-stone-500 hover:text-stone-700">
        ← All requests
      </Link>

      <div
        className={`mt-2 rounded-xl border p-4 ${
          surplus
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-amber-200 bg-amber-50/50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
              surplus ? "bg-emerald-700 text-white" : "bg-amber-600 text-white"
            }`}
          >
            {surplus ? "Surplus" : "Shortage"}
          </span>
          <h1 className="text-xl font-bold">{req.flag.itemName}</h1>
          <span className="text-sm text-stone-600">
            {req.flag.quantity} {req.flag.unit}
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Posted by{" "}
          <span className="font-medium">
            {req.flag.foodBank.name}
            {iPosted && you}
          </span>{" "}
          · responded by{" "}
          <span className="font-medium">
            {requesterBank?.name}
            {!iPosted && you}
          </span>
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Contact: {req.flag.contactName} · {req.flag.contactInfo}
        </p>
        {req.flag.note && (
          <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-stone-600">
            “{req.flag.note}”
          </p>
        )}
        <p className="mt-2 text-xs font-medium text-stone-500">
          {iAmGiver
            ? `You supply the ${req.flag.itemName} → ${otherBank?.name}`
            : `${otherBank?.name} supplies the ${req.flag.itemName} → you`}
        </p>
      </div>

      <ChatThread
        requestId={req.id}
        initialStatus={req.status}
        finalQuantity={req.finalQuantity}
        agreedQuantity={req.agreedQuantity}
        maxQuantity={req.flag.quantity}
        unit={req.flag.unit}
        itemName={req.flag.itemName}
      />
    </div>
  );
}
