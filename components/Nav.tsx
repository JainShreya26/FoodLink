import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";

async function logout() {
  "use server";
  const store = await cookies();
  store.delete("auth");
  store.delete("bankId"); // lastBankId survives so the next login picks a different bank
  redirect("/login");
}

export default async function Nav() {
  const authed = await isAuthed();
  const bank = authed ? await getCurrentBank() : null;

  return (
    <header className="border-b border-emerald-900/10 bg-emerald-800 text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🥫 FoodLink
        </Link>
        {authed && (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Inventory
            </Link>
            <Link href="/projection" className="hover:underline">
              Projection
            </Link>
            <Link href="/chat" className="hover:underline">
              Chat
            </Link>
            <Link href="/board" className="hover:underline">
              Board
            </Link>
            <Link href="/requests" className="hover:underline">
              Requests
            </Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {bank && (
            <span className="rounded-full bg-emerald-700 px-3 py-1">{bank.name}</span>
          )}
          {authed && (
            <form action={logout}>
              <button
                type="submit"
                className="text-emerald-200 hover:text-white hover:underline"
              >
                Logout
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
