"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/components/Dialog";
import { DELAY_CHOICES } from "@/lib/checkin";

type Delivery = {
  foodBankName: string;
  address: string | null;
  direction: string;
  scheduledFor: string;
  windowEnd: string | null;
  driverName: string | null;
  note: string | null;
  lines: { name: string; quantity: number; unit: string }[];
};

type State = {
  expired: boolean;
  answered: boolean;
  outcome: string | null;
  etaMinutes: number | null;
  delivery: Delivery;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Thumb-sized targets — this gets used one-handed, parked, in a hurry. */
const BUTTON =
  "w-full rounded-2xl px-6 py-5 text-lg font-semibold transition active:scale-[0.99]";

export default function CheckInClient({ token }: { token: string }) {
  const dialog = useDialog();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askDelay, setAskDelay] = useState(false);
  const [done, setDone] = useState<{ outcome: string; eta: number | null } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/checkin/${token}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? "This link is not valid.");
        setState(data);
        if (data.answered) setDone({ outcome: data.outcome, eta: data.etaMinutes });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const answer = async (outcome: string, etaMinutes: number | null = null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, etaMinutes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your answer.");
      setDone({ outcome, eta: etaMinutes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  };

  // A driver landing here has no account and no other way back into the app, so
  // a bare sentence on a white page is a dead end. Say what this was and what
  // to do instead.
  if (error && !state) {
    return (
      <Shell>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-3xl">🥫</p>
          <h1 className="mt-2 text-xl font-bold">This check-in link is closed</h1>
          <p className="mt-2 text-sm text-stone-600">{error}</p>
          <p className="mt-4 text-sm text-stone-600">
            Check-in links last 24 hours and can only be used once. If you still
            need to reach the warehouse about a delivery, call the number on your
            run sheet.
          </p>
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="text-center text-stone-400">Loading…</p>
      </Shell>
    );
  }

  const d = state.delivery;

  return (
    <Shell>
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
        {d.direction === "INBOUND" ? "Delivery to" : "Pickup from"}
      </p>
      <h1 className="text-2xl font-bold">{d.foodBankName}</h1>
      {d.address && <p className="text-sm text-stone-500">{d.address}</p>}

      <div className="mt-4 rounded-xl bg-stone-100 p-4">
        <p className="text-sm text-stone-500">Expected</p>
        <p className="text-lg font-semibold">{fmt(d.scheduledFor)}</p>
        <p className="mt-2 text-sm text-stone-600">
          {d.lines.map((l) => `${l.quantity} ${l.unit} ${l.name}`).join(" · ")}
        </p>
        {d.note && <p className="mt-2 text-xs text-stone-500">{d.note}</p>}
      </div>

      {state.expired && !done && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
          This link has expired — it was only good for 24 hours. Please call{" "}
          {d.foodBankName} directly on the number from your run sheet.
        </p>
      )}

      {done ? (
        <div className="mt-6 rounded-2xl bg-emerald-50 p-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-semibold text-emerald-900">
            {done.outcome === "ON_TIME" && "Thanks — we'll see you then."}
            {done.outcome === "DELAYED" &&
              `Thanks — we've told the warehouse you're about ${done.eta} minutes behind.`}
            {done.outcome === "NOT_COMING" &&
              "Thanks for letting us know. We've cancelled this one."}
            {/* Fallback so a status set from the dispatcher's side (UNREACHABLE)
                never renders a tick with nothing next to it. */}
            {!["ON_TIME", "DELAYED", "NOT_COMING"].includes(done.outcome) &&
              "Thanks — your answer is already recorded."}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            You can close this page.
          </p>
        </div>
      ) : (
        !state.expired && (
          <div className="mt-6 space-y-3">
            {!askDelay ? (
              <>
                <button
                  onClick={() => answer("ON_TIME")}
                  disabled={busy}
                  className={`${BUTTON} bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50`}
                >
                  👍 On time
                </button>
                <button
                  onClick={() => setAskDelay(true)}
                  disabled={busy}
                  className={`${BUTTON} bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50`}
                >
                  🕐 Running late
                </button>
                <button
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Tell them you can't make this delivery?",
                      body: `${d.foodBankName} will see this straight away and the booking is cancelled.`,
                      confirmLabel: "Yes, I can't make it",
                      cancelLabel: "Go back",
                      tone: "danger",
                    });
                    if (ok) answer("NOT_COMING");
                  }}
                  disabled={busy}
                  className={`${BUTTON} border-2 border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-50`}
                >
                  ✕ Can&apos;t make it
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm font-medium text-stone-600">
                  Roughly how late?
                </p>
                {DELAY_CHOICES.map((m) => (
                  <button
                    key={m}
                    onClick={() => answer("DELAYED", m)}
                    disabled={busy}
                    className={`${BUTTON} bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50`}
                  >
                    {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}
                  </button>
                ))}
                <button
                  onClick={() => setAskDelay(false)}
                  className="w-full py-2 text-sm text-stone-500 hover:text-stone-700"
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        )
      )}

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-8 text-center text-[11px] text-stone-400">
        Automated check-in from FoodLink. Your answer is shared with{" "}
        {d.foodBankName} only.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md py-6">{children}</div>;
}
