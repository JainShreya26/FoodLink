import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AddInventory from "./inventory/AddInventory";
import InventoryTable from "./inventory/InventoryTable";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  const items = await prisma.inventoryItem.findMany({
    where: { foodBankId: bank.id, deletedAt: null },
    orderBy: [{ expiryDate: "asc" }],
  });
  const removedCount = await prisma.inventoryItem.count({
    where: { foodBankId: bank.id, deletedAt: { not: null } },
  });

  return (
    <div>
      <div className="rounded-2xl bg-emerald-800 px-6 py-5 text-white">
        <p className="text-xs uppercase tracking-wide text-emerald-300">
          Your food bank
        </p>
        <h1 className="text-3xl font-bold">{bank.name}</h1>
      </div>

      <h2 className="mt-6 text-xl font-semibold">
        Inventory{" "}
        <span className="text-sm font-normal text-stone-500">
          · {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </h2>

      <AddInventory />

      <InventoryTable
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          unit: i.unit,
          expiryDate: i.expiryDate ? i.expiryDate.toISOString() : null,
          source: i.source,
        }))}
        removedCount={removedCount}
      />
    </div>
  );
}
