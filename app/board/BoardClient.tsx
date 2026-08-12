"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RADIUS_OPTIONS } from "@/lib/geo";
import type { RequestStage } from "@/lib/requests";
import { HandoverSummary, StageBadge, StageProgress } from "@/components/RequestStage";
import BoardMap, { type MapHome } from "./BoardMap";

type MyRequest = {
  id: string;
  status: string;
  stage: RequestStage;
  agreedQuantity: number | null;
  finalQuantity: number | null;
  scheduledFor: string | null;
  handoverNote: string | null;
};

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
  activeRequestCount: number;
  myRequestId: string | null;
  myRequest: MyRequest | null;
};

export default function BoardClient({ bankName }: { bankName: string }) {
  const router = useRouter();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [home, setHome] = useState<MapHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyFlagId, setBusyFlagId] = useState<string | null>(null);

  // Filters
  const [radius, setRadius] = useState<number>(50);
  const [search, setSearch] = useState("");
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
   * The board is the *network's* offer. Your own postings live on /postings,
   * where the responses to them are the point — mixing the two into one grid
   * meant neither read clearly.
   */
  const mine = useMemo(() => flags?.filter((f) => f.isMine) ?? [], [flags]);

  /** Everything except the radius, so the distance hint blames only distance. */
  const withinFilters = useMemo(() => {
    if (!flags) return [];
    const q = search.trim().toLowerCase();
    return flags
      .filter((f) => !f.isMine)
      .filter((f) =>
        q
          ? f.itemName.toLowerCase().includes(q) ||
            f.bankName.toLowerCase().includes(q)
          : true,
      );
  }, [flags, search]);

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

  const surplus = visible.filter((f) => f.type === "SURPLUS");
  const shortage = visible.filter((f) => f.type === "SHORTAGE");

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

  const myOpenResponses = flags
    ? flags.filter((f) => !f.isMine && f.myRequest && f.myRequest.status === "OPEN")
        .length
    : 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Network Board</h1>
          <p className="text-sm text-stone-500">
            What other food banks near {bankName} are offering and asking for.
          </p>
        </div>
        <Link
          href="/postings"
          className="rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          📋 Your postings
          {mine.length > 0 && (
            <span className="ml-1.5 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[11px] text-white">
              {mine.length}
            </span>
          )}
        </Link>
      </div>

      {myOpenResponses > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          You have {myOpenResponses} open conversation
          {myOpenResponses === 1 ? "" : "s"} on this board —{" "}
          <Link href="/requests" className="font-medium text-emerald-700 underline decoration-dotted underline-offset-2">
            see all requests
          </Link>
        </p>
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search item or food bank"
          placeholder="Search item or food bank…"
          className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
        />

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

      {/* Surplus left, shortage right — the two are different jobs and reading
          them as one interleaved list made neither scannable. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <Column
          title="Surplus offered"
          hint="Food you can take"
          tone="surplus"
          flags={surplus}
          loading={flags === null}
          busyFlagId={busyFlagId}
          onRespond={respond}
          onSelectBank={setSelectedBankId}
          activeBankId={activeBankId}
        />
        <Column
          title="Shortages posted"
          hint="Food they need"
          tone="shortage"
          flags={shortage}
          loading={flags === null}
          busyFlagId={busyFlagId}
          onRespond={respond}
          onSelectBank={setSelectedBankId}
          activeBankId={activeBankId}
        />
      </div>

      {flags && visible.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
          No postings from other food banks match your filters. Try widening the
          radius or clearing the search.
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  hint,
  tone,
  flags,
  loading,
  busyFlagId,
  onRespond,
  onSelectBank,
  activeBankId,
}: {
  title: string;
  hint: string;
  tone: "surplus" | "shortage";
  flags: Flag[];
  loading: boolean;
  busyFlagId: string | null;
  onRespond: (f: Flag) => void;
  onSelectBank: (id: string | null) => void;
  activeBankId: string | null;
}) {
  const surplus = tone === "surplus";

  return (
    <section>
      <div
        className={`flex items-baseline gap-2 border-b-2 px-1 pb-2 ${
          surplus ? "border-emerald-600" : "border-amber-500"
        }`}
      >
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        <span className="text-xs text-stone-400">{hint}</span>
        <span className="ml-auto text-xs font-medium text-stone-500">
          {flags.length}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {loading && (
          <p className="py-6 text-center text-sm text-stone-400">Loading board…</p>
        )}
        {!loading && flags.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
            Nothing here right now.
          </div>
        )}
        {flags.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            busy={busyFlagId === flag.id}
            onRespond={() => onRespond(flag)}
            onSelectBank={() =>
              onSelectBank(activeBankId === flag.bankId ? null : flag.bankId)
            }
          />
        ))}
      </div>
    </section>
  );
}

function FlagCard({
  flag,
  busy,
  onRespond,
  onSelectBank,
}: {
  flag: Flag;
  busy: boolean;
  onRespond: () => void;
  onSelectBank: () => void;
}) {
  const surplus = flag.type === "SURPLUS";
  const mine = flag.myRequest;

  return (
    <div
      className={`rounded-xl border p-4 ${
        surplus
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-amber-200 bg-amber-50/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{flag.itemName}</h3>
        <span className="shrink-0 text-xs text-stone-500">
          {flag.distanceMiles} mi away
        </span>
      </div>
      <p className="text-sm text-stone-600">
        {flag.quantity} {flag.unit} {surplus ? "available" : "needed"}
      </p>

      <button
        onClick={onSelectBank}
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
          &ldquo;{flag.note}&rdquo;
        </p>
      )}

      <p className="mt-2 text-xs text-stone-500">
        Contact: <span className="font-medium">{flag.contactName}</span> ·{" "}
        {flag.contactInfo}
      </p>

      {/* Where my own response stands — quantity, date, progress — so the state
          of play is readable without opening the thread. */}
      {mine ? (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-stone-500">
              Your request
            </span>
            <StageBadge stage={mine.stage} />
          </div>
          <div className="mt-2">
            <StageProgress stage={mine.stage} />
          </div>
          <div className="mt-2">
            <HandoverSummary
              stage={mine.stage}
              agreedQuantity={mine.agreedQuantity}
              finalQuantity={mine.finalQuantity}
              scheduledFor={mine.scheduledFor}
              handoverNote={mine.handoverNote}
              unit={flag.unit}
            />
          </div>
          <Link
            href={`/requests/${mine.id}`}
            className="mt-2.5 inline-block rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            💬 Open chat →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onRespond}
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              surplus
                ? "bg-emerald-700 hover:bg-emerald-600"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            {busy ? "Opening…" : surplus ? "💬 Request this" : "💬 Offer to help"}
          </button>
          {flag.activeRequestCount > 0 && (
            <span className="text-xs text-stone-500">
              {flag.activeRequestCount} other food bank
              {flag.activeRequestCount === 1 ? " has" : "s have"} replied
            </span>
          )}
        </div>
      )}
    </div>
  );
}
