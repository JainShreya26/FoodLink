import { cookies } from "next/headers";
import { prisma } from "./prisma";

/** Returns the food bank the user picked on the home page, or null. */
export async function getCurrentBank() {
  const store = await cookies();
  const bankId = store.get("bankId")?.value;
  if (!bankId) return null;
  return prisma.foodBank.findUnique({ where: { id: bankId } });
}
