"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/Dialog";
import { HandoverSummary, StageBadge, StageProgress } from "@/components/RequestStage";
import type { RequestStage } from "@/lib/requests";
import PostFlagForm from "../board/PostFlagForm";

type Response = {
  id: string;
  stage: RequestStage;
  status: string;
  bankName: string;
  bankAddress: string | null;
  agreedQuantity: number | null;
  finalQuantity: number | null;
  scheduledFor: string | null;
  handoverNote: string | null;
  cancelReason: string | null;
  messageCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

type Posting = {
  id: string;
  type: "SURPLUS" | "SHORTAGE";
  itemName: string;
  quantity: number;
  unit: string;
  contactName: string;
  contactInfo: string;
  note: string | null;
  status: string;
  createdAt: string;
  responses: Response[];
  openCount: number;
  committedQuantity: number;
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function PostingsClient({ bankName }: { bankName: string }) {
  const router = useRouter();
  const dialog = useDialog();
  const [postings, setPostings] = useState<Posting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/postings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load your postings");
      setPostings(data.postings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your postings");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (posting: Posting, status: "OPEN" | "CLOSED") => {
    if (status === "CLOSED") {
      const ok = await dialog.confirm({
        title: `Close the ${posting.itemName} posting?`,
        body:
          posting.openCount > 0
            ? `${posting.openCount} food bank${posting.openCount === 1 ? "" : "s"} still ${posting.openCount === 1 ? "has" : "have"} an open conversation. They keep their thread, but the posting comes off the board.`
            : "It comes off the network board. You can put it back at any time.",
        confirmLabel: "Close posting",
      });
      if (!ok) return;
    }
    setBusyId(posting.id);
    setError(null);
    try {
      const res = await fetch(`/api/flags/${posting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update the posting");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the posting");
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (posting: Posting) => {
    const ok = await dialog.confirm({
      title: `Withdraw the ${posting.itemName} posting?`,
      body: "Nobody has replied yet, so this removes it completely.",
      confirmLabel: "Withdraw",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(posting.id);
    setError(null);
    try {
      const res = await fetch(`/api/flags/${posting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not withdraw the posting");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw the posting");
    } finally {
      setBusyId(null);
    }
  };

  const surplus = postings?.filter((p) => p.type === "SURPLUS") ?? [];
  const shortage = postings?.filter((p) => p.type === "SHORTAGE") ?? [];
  const totalResponses =
    postings?.reduce((n, p) => n + p.responses.length, 0) ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/board"
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            ← Network board
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Your postings</h1>
          <p className="text-sm text-stone-500">
            What {bankName} has put on the network, and who replied
            {totalResponses > 0 ? ` · ${totalResponses} response${totalResponses === 1 ? "" : "s"}` : ""}
            .
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

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <Column
          title="Surplus you're offering"
          hint="Food you have spare."
          tone="surplus"
          postings={surplus}
          loading={postings === null}
          openId={openId}
          busyId={busyId}
          onToggle={(id) => setOpenId(openId === id ? null : id)}
          onSetStatus={setStatus}
          onWithdraw={withdraw}
        />
        <Column
          title="Shortages you've asked for"
          hint="Food you need."
          tone="shortage"
          postings={shortage}
          loading={postings === null}
          openId={openId}
          busyId={busyId}
          onToggle={(id) => setOpenId(openId === id ? null : id)}
          onSetStatus={setStatus}
          onWithdraw={withdraw}
        />
      </div>
    </div>
  );
}

function Column({
  title,
  hint,
  tone,
  postings,
  loading,
  openId,
  busyId,
  onToggle,
  onSetStatus,
  onWithdraw,
}: {
  title: string;
  hint: string;
  tone: "surplus" | "shortage";
  postings: Posting[];
  loading: boolean;
  openId: string | null;
  busyId: string | null;
  onToggle: (id: string) => void;
  onSetStatus: (p: Posting, status: "OPEN" | "CLOSED") => void;
  onWithdraw: (p: Posting) => void;
}) {
  const surplus = tone === "surplus";

  return (
    <section>
      <div
        className={`flex items-baseline gap-2 rounded-t-xl border-b-2 px-1 pb-2 ${
          surplus ? "border-emerald-600" : "border-amber-500"
        }`}
      >
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        <span className="text-xs text-stone-400">{hint}</span>
        <span className="ml-auto text-xs font-medium text-stone-500">
          {postings.length}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {loading && (
          <p className="py-6 text-center text-sm text-stone-400">Loading…</p>
        )}
        {!loading && postings.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
            Nothing posted here yet.
          </div>
        )}
        {postings.map((p) => (
          <PostingCard
            key={p.id}
            posting={p}
            expanded={openId === p.id}
            busy={busyId === p.id}
            onToggle={() => onToggle(p.id)}
            onSetStatus={onSetStatus}
            onWithdraw={onWithdraw}
          />
        ))}
      </div>
    </section>
  );
}

function PostingCard({
  posting: p,
  expanded,
  busy,
  onToggle,
  onSetStatus,
  onWithdraw,
}: {
  posting: Posting;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSetStatus: (p: Posting, status: "OPEN" | "CLOSED") => void;
  onWithdraw: (p: Posting) => void;
}) {
  const surplus = p.type === "SURPLUS";
  const closed = p.status === "CLOSED";

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        closed
          ? "border-stone-200 opacity-75"
          : surplus
            ? "border-emerald-200"
            : "border-amber-200"
      }`}
    >
      {/* Header doubles as the disclosure control for the responses below. */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="block w-full px-4 py-3 text-left hover:bg-stone-50"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap ${
              surplus ? "bg-emerald-700 text-white" : "bg-amber-600 text-white"
            }`}
          >
            {surplus ? "Surplus" : "Shortage"}
          </span>
          <span className="font-semibold">{p.itemName}</span>
          <span className="text-sm text-stone-500">
            {p.quantity > 0
              ? `${p.quantity} ${p.unit} ${surplus ? "available" : "needed"}`
              : "fully allocated"}
          </span>
          {closed && (
            <span className="inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-stone-600">
              Closed
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-stone-400">
            {p.responses.length > 0 ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-600">
                {p.responses.length} response{p.responses.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span>no responses yet</span>
            )}
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </span>
        </div>

        {p.note && (
          <p className="mt-1.5 text-xs text-stone-500">&ldquo;{p.note}&rdquo;</p>
        )}
        {p.committedQuantity > 0 && (
          <p className="mt-1 text-xs text-emerald-700">
            {p.committedQuantity} {p.unit} already transferred
          </p>
        )}
      </button>

      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/70 px-4 py-3">
          {p.responses.length === 0 ? (
            <p className="text-xs text-stone-500">
              Nobody has replied yet. It shows on every food bank&apos;s board
              within range — give it a little time, or widen who can see it by
              adding detail to the note.
            </p>
          ) : (
            <ul className="space-y-2">
              {p.responses.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-stone-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.bankName}</span>
                    <StageBadge stage={r.stage} />
                    <Link
                      href={`/requests/${r.id}`}
                      className="ml-auto rounded-lg border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      💬 Open chat
                      {r.messageCount > 0 ? ` (${r.messageCount})` : ""}
                    </Link>
                  </div>

                  <div className="mt-2">
                    <StageProgress stage={r.stage} />
                  </div>

                  <div className="mt-2">
                    <HandoverSummary
                      stage={r.stage}
                      agreedQuantity={r.agreedQuantity}
                      finalQuantity={r.finalQuantity}
                      scheduledFor={r.scheduledFor}
                      handoverNote={r.handoverNote}
                      unit={p.unit}
                    />
                  </div>

                  {r.cancelReason && (
                    <p className="mt-1 text-[11px] text-stone-400">
                      Reason: {r.cancelReason}
                    </p>
                  )}
                  {r.lastMessage && (
                    <p className="mt-1.5 truncate text-[11px] text-stone-400">
                      {r.lastMessage}
                      {r.lastMessageAt ? ` · ${fmtWhen(r.lastMessageAt)}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 text-xs">
            <span className="text-stone-400">
              Posted {fmtWhen(p.createdAt)} · contact {p.contactName} ·{" "}
              {p.contactInfo}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {closed ? (
                <button
                  onClick={() => onSetStatus(p, "OPEN")}
                  disabled={busy || p.quantity <= 0}
                  title={
                    p.quantity <= 0
                      ? "Nothing left on this posting"
                      : "Put it back on the board"
                  }
                  className="rounded px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                >
                  ↩ Reopen
                </button>
              ) : (
                <button
                  onClick={() => onSetStatus(p, "CLOSED")}
                  disabled={busy}
                  className="rounded px-2 py-1 font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-40"
                >
                  ✓ Close posting
                </button>
              )}
              {p.responses.length === 0 && (
                <button
                  onClick={() => onWithdraw(p)}
                  disabled={busy}
                  className="rounded px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  ✕ Withdraw
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
