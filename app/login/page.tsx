import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_USER, ADMIN_PASSWORD, isAuthed } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const userId = formData.get("userId");
  const password = formData.get("password");

  if (userId !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    redirect("/login?error=1");
  }

  const store = await cookies();

  // Assign a random food bank — preferring one you weren't just signed in as,
  // so logging out and back in lets you see the network from the other side.
  const banks = await prisma.foodBank.findMany();
  const previousBankId = store.get("lastBankId")?.value;
  const pool = banks.filter((b) => b.id !== previousBankId);
  const choices = pool.length > 0 ? pool : banks;
  const bank = choices[Math.floor(Math.random() * choices.length)];

  store.set("auth", "ok", { httpOnly: true, path: "/" });
  if (bank) {
    store.set("bankId", bank.id, { httpOnly: true, path: "/" });
    store.set("lastBankId", bank.id, { httpOnly: true, path: "/" });
  }
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthed()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold">Sign in to FoodLink</h1>
        <p className="mt-1 text-center text-sm text-stone-500">
          AI-powered inventory &amp; food sharing
        </p>

        <form action={login} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="userId" className="text-sm font-medium text-stone-700">
              User ID
            </label>
            <input
              id="userId"
              name="userId"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              placeholder="admin"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-stone-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">Invalid user ID or password.</p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-stone-400">
          Demo credentials: <code>admin</code> / <code>admin123</code>
        </p>
      </div>
    </div>
  );
}
