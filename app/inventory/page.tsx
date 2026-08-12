import { redirect } from "next/navigation";

// Inventory now lives on the home page.
export default function InventoryPage() {
  redirect("/");
}
