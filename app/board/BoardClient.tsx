"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RADIUS_OPTIONS } from "@/lib/geo";
import PostFlagForm from "./PostFlagForm";
import BoardMap, { type MapHome } from "./BoardMap";

type Flag = {
  id: string;
  type: "SURPLUS" | "SHORTAGE";
  itemName: string;
  quantity: number;
  unit: string;
  contactName: string;
  contactInfo: string;
  note: string | null;
  createdAt: string;
  bankId: string;
  bankName: string;
  bankAddress: string | null;
  bankLatitude: number;
  bankLongitude: number;
  isMine: boolean;
  distanceMiles: number;
  requestCount: number;
  myRequestId: string | null;
};

type TypeFilter = "ALL" | "SURPLUS" | "SHORTAGE";

export default function BoardClient({ bankName }: { bankName: string }) {
  const router = useRouter();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [home, setHome] = useState<MapHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyFlagId, setBusyFlagId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [radius, setRadius] = useState<number>(50);
  const [search, setSearch] = useState("");
  const [includeMine, setIncludeMine] = useState(true);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/flags");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the board");
      setFlags(data.flags);
      setHome(data.me ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Everything except the radius. Kept separate so the distance hint below can
   * count only the flags the radius is actually responsible for hiding —
   * counting against the raw list blamed distance for a type or search miss.
   */
  const withinFilters = useMemo(() => {
    if (!flags) return [];
    const q = search.trim().toLowerCase();
    return flags
      .filter((f) => (typeFilter === "ALL" ? true : f.type === typeFilter))
      .filter((f) => (includeMine ? true : !f.isMine))
      .filter((f) =>
        q
          ? f.itemName.toLowerCase().includes(q) ||
            f.bankName.toLowerCase().includes(q)
          : true,
      );
  }, [flags, typeFilter, includeMine, search]);

  /** Everything the filters allow — this is what the map plots. */
  const matching = useMemo(
    () =>
      withinFilters
        .filter((f) => f.distanceMiles <= radius)
        .sort((a, b) => a.distanceMiles - b.distanceMiles),
    [withinFilters, radius],
  );

  // A bank that drops out of the filtered set stops counting as selected,
  // derived rather than reset in an effect so the two can't disagree.
  const selectedBankName =
    matching.find((f) => f.bankId === selectedBankId)?.bankName ?? null;
  const activeBankId = selectedBankName ? selectedBankId : null;

  /** The cards additionally narrow to whichever bank is picked on the map. */
  const visible = useMemo(
    () =>
      activeBankId ? matching.filter((f) => f.bankId === activeBankId) : matching,
    [matching, activeBankId],
  );

  const outsideRadius = withinFilters.length - matching.length;
  const nearestOutside = Math.min(
    ...withinFilters
      .filter((f) => f.distanceMiles > radius)
      .map((f) => f.distanceMiles),
  );

  const respond = async (flag: Flag) => {
    if (flag.myRequestId) {
      router.push(`/requests/${flag.myRequestId}`);
      return;
    }
    setBusyFlagId(flag.id);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagId: flag.id,
          message:
            flag.type === "SURPLUS"
              ? `Hi ${flag.contactName} — we'd like to take the ${flag.itemName}. When can we arrange pickup?`
              : `Hi ${flag.contactName} — we can help with the ${flag.itemName}. How much do you still need?`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send request");
      router.push(`/requests/${data.requestId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send request");
      setBusyFlagId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Network Board</h1>
          <p className="text-sm text-stone-500">
            Surplus and shortages posted by food banks near {bankName}.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          {showForm ? "Close" : "+ Post Flag"}
        </button>
      </div>

      {showForm && (
        <PostFlagForm
          onPosted={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {/* Map */}
      <div className="mt-4">
        <BoardMap
          flags={matching}
          home={home}
          selectedBankId={activeBankId}
          onSelectBank={setSelectedBankId}
        />
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
            {(["ALL", "SURPLUS", "SHORTAGE"] as TypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  typeFilter === t
                    ? "bg-white shadow-sm text-stone-900"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {t === "ALL" ? "All" : t === "SURPLUS" ? "Surplus" : "Shortage"}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search item or food bank"
            placeholder="Search item or food bank…"
            className="min-w-[200px] flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          />

          <label className="flex items-center gap-2 whitespace-nowrap text-xs text-stone-600">
            <input
              type="checkbox"
              checked={includeMine}
              onChange={(e) => setIncludeMine(e.target.checked)}
              className="accent-emerald-700"
            />
            Show my flags
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
          <label htmlFor="radius" className="whitespace-nowrap text-xs font-medium text-stone-600">
            📍 Within <span className="font-semibold text-emerald-700">{radius} mi</span>
          </label>
          <input
            id="radius"
            type="range"
            min={RADIUS_OPTIONS[0]}
            max={RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]}
            step={5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="min-w-[160px] flex-1 accent-emerald-700"
          />
          <div className="flex gap-1">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  radius === r
                    ? "bg-emerald-700 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {outsideRadius > 0 && (
          <p className="mt-3 text-xs text-stone-500">
            {outsideRadius} matching flag{outsideRadius === 1 ? "" : "s"} sit
            {outsideRadius === 1 ? "s" : ""} beyond {radius} miles — the nearest
            is {nearestOutside} mi away.{" "}
            <button
              onClick={() =>
                setRadius(
                  RADIUS_OPTIONS.find((r) => r >= nearestOutside) ??
                    RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1],
                )
              }
              className="font-medium text-emerald-700 underline decoration-dotted underline-offset-2 hover:text-emerald-900"
            >
              Widen the search
            </button>
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {selectedBankName && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
          <span className="text-teal-900">
            Showing <span className="font-semibold">{selectedBankName}</span> only —
            picked on the map.
          </span>
          <button
            onClick={() => setSelectedBankId(null)}
            className="text-xs font-medium text-teal-700 hover:text-teal-900"
          >
            Show all {matching.length}
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {visible.map((flag) => {
          const surplus = flag.type === "SURPLUS";
          return (
            <div
              key={flag.id}
              className={`rounded-xl border p-4 ${
                surplus
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-amber-200 bg-amber-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap ${
                    surplus
                      ? "bg-emerald-700 text-white"
                      : "bg-amber-600 text-white"
                  }`}
                >
                  {surplus ? "Surplus" : "Shortage"}
                </span>
                <span className="text-xs text-stone-500">
                  {flag.distanceMiles} mi away
                </span>
              </div>

              <h3 className="mt-2 text-lg font-semibold">{flag.itemName}</h3>
              <p className="text-sm text-stone-600">
                {flag.quantity} {flag.unit}{" "}
                {surplus ? "available" : "needed"}
              </p>

              <button
                onClick={() =>
                  setSelectedBankId(
                    activeBankId === flag.bankId ? null : flag.bankId,
                  )
                }
                title="Show this food bank on the map"
                className="mt-2 block text-left text-sm font-medium underline decoration-stone-300 decoration-dotted underline-offset-2 hover:decoration-stone-600"
              >
                {flag.bankName}
              </button>
              {flag.bankAddress && (
                <p className="text-xs text-stone-500">{flag.bankAddress}</p>
              )}

              {flag.note && (
                <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-stone-600">
                  “{flag.note}”
                </p>
              )}

              <p className="mt-2 text-xs text-stone-500">
                Contact: <span className="font-medium">{flag.contactName}</span> ·{" "}
                {flag.contactInfo}
              </p>

              <div className="mt-3 flex items-center justify-between">
                {flag.isMine ? (
                  <span className="text-xs text-stone-500">
                    Your flag · {flag.requestCount} response
                    {flag.requestCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <button
                    onClick={() => respond(flag)}
                    disabled={busyFlagId === flag.id}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                      surplus
                        ? "bg-emerald-700 hover:bg-emerald-600"
                        : "bg-amber-600 hover:bg-amber-500"
                    }`}
                  >
                    {busyFlagId === flag.id
                      ? "Opening…"
                      : flag.myRequestId
                        ? "Open chat →"
                        : surplus
                          ? "Request this"
                          : "Offer to help"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {flags && visible.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
          No flags match your filters. Try widening the radius or clearing the search.
        </div>
      )}
      {!flags && !error && (
        <p className="mt-6 text-center text-sm text-stone-400">Loading board…</p>
      )}
    </div>
  );
}
