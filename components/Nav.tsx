import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import NavLinks from "./NavLinks";

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
      {/* Wraps: on phones the links drop to their own row rather than pushing
          the bank name and Logout off the side of the screen. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight whitespace-nowrap">
          🥫 FoodLink
        </Link>

        {authed && <NavLinks />}

        <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
          {bank && (
            <span
              title={bank.name}
              className="max-w-[10rem] truncate rounded-full bg-emerald-700 px-3 py-1 whitespace-nowrap lg:max-w-none"
            >
              {bank.name}
            </span>
          )}
          {authed && (
            <form action={logout}>
              <button
                type="submit"
                className="whitespace-nowrap text-emerald-200 hover:text-white hover:underline"
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
