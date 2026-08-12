"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  text: string;
  createdAt: string;
  senderBankName: string;
  mine: boolean;
};

type RequestEvent = {
  id: string;
  action: string;
  detail: string | null;
  actorBankName: string;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Request opened",
  QUANTITY_PROPOSED: "Quantity proposed",
  COMPLETED: "Transfer completed",
  CANCELLED: "Request cancelled",
  REOPENED: "Request reopened",
  REVERSED: "Transfer reversed",
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-stone-200 text-stone-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function ChatThread({
  requestId,
  initialStatus,
  finalQuantity,
  agreedQuantity,
  maxQuantity,
  unit,
  itemName,
}: {
  requestId: string;
  initialStatus: string;
  finalQuantity: number | null;
  agreedQuantity: number | null;
  maxQuantity: number;
  unit: string;
  itemName: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [finalQty, setFinalQty] = useState<number | null>(finalQuantity);
  const [agreedQty, setAgreedQty] = useState<number | null>(agreedQuantity);
  const [available, setAvailable] = useState<number>(maxQuantity);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState(String(agreedQuantity ?? maxQuantity));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/messages`);
      const data = await res.json();
      if (!res.ok) return;
      setMessages(data.messages);
      setEvents(data.events ?? []);
      setStatus(data.status);
      setFinalQty(data.finalQuantity);
      setAgreedQty(data.agreedQuantity);
      setAvailable(data.availableQuantity ?? maxQuantity);
      setCancelReason(data.cancelReason ?? null);
    } catch {
      // transient network hiccup — the next poll will catch up
    }
  }, [requestId, maxQuantity]);

  // Poll every 3s so both food banks see each other's messages live.
  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not send");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  };

  /** Every lifecycle action goes through here so busy/error handling is uniform. */
  const act = async (
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "PATCH" = "POST",
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work");
      await load();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const propose = () => {
    const value = Number(qty);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    act("", { agreedQuantity: value }, "PATCH");
  };

  const complete = () => {
    const value = Number(qty);
    if (!confirm(`Mark complete and transfer ${value} ${unit} of ${itemName}?`)) return;
    act("/complete", { quantity: value });
  };

  const cancel = () => {
    const reason = prompt("Cancel this request. Why? (optional)", "");
    if (reason === null) return;
    act("/cancel", { reason });
  };

  const reopen = () => act("/reopen", {});

  const reverse = () => {
    const reason = prompt(
      `Reverse this transfer? ${finalQty} ${unit} of ${itemName} goes back to the sender and the request returns to open.\n\nWhy? (optional)`,
      "",
    );
    if (reason === null) return;
    act("/reverse", { reason });
  };

  const done = status === "COMPLETED";
  const cancelled = status === "CANCELLED";
  const open = status === "OPEN";

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
            STATUS_STYLES[status] ?? "bg-stone-100 text-stone-600"
          }`}
        >
          {status.toLowerCase()}
        </span>
        {open && agreedQty !== null && (
          <span className="text-xs text-stone-500">
            Proposed: <span className="font-medium">{agreedQty} {unit}</span>
          </span>
        )}
        <button
          onClick={() => setShowLog((v) => !v)}
          className="ml-auto text-xs text-stone-400 hover:text-stone-600"
        >
          {showLog ? "Hide" : "Show"} activity log ({events.length})
        </button>
      </div>

      {showLog && (
        <ol className="mt-2 space-y-1 rounded-xl border border-stone-200 bg-stone-50 p-3">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className="font-medium text-stone-700">
                {EVENT_LABELS[e.action] ?? e.action}
              </span>
              {e.detail && <span className="text-stone-500">{e.detail}</span>}
              <span className="ml-auto text-stone-400">
                {e.actorBankName} ·{" "}
                {new Date(e.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-xs text-stone-400">Nothing logged yet.</li>
          )}
        </ol>
      )}

      <div className="mt-2 h-[380px] space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.mine
                  ? "rounded-br-sm bg-emerald-700 text-white"
                  : "rounded-bl-sm bg-stone-100 text-stone-800"
              }`}
            >
              {!m.mine && (
                <p className="mb-0.5 text-[11px] font-medium text-stone-500">
                  {m.senderBankName}
                </p>
              )}
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p
                className={`mt-0.5 text-[10px] ${
                  m.mine ? "text-emerald-200" : "text-stone-400"
                }`}
              >
                {new Date(m.createdAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-stone-400">
            No messages yet — say hello to arrange the transfer.
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Messaging stays available in every state except completed. */}
      {!done && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}

      {open && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-600">Quantity:</span>
            <input
              type="number"
              min="0"
              max={available}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-stone-500">
              {unit} <span className="text-xs text-stone-400">of {available} available</span>
            </span>
            <button
              onClick={propose}
              disabled={busy}
              title="Put a number on the table without committing"
              className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Propose
            </button>
            <button
              onClick={complete}
              disabled={busy}
              className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy ? "Working…" : "✓ Mark Complete"}
            </button>
          </div>
          <div className="mt-2 border-t border-stone-100 pt-2">
            <button
              onClick={cancel}
              disabled={busy}
              className="text-xs text-stone-400 hover:text-red-600 disabled:opacity-50"
            >
              Cancel this request
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-center text-sm text-stone-600">
            ✅ Completed — {finalQty} {unit} of {itemName} transferred and inventory
            updated on both sides.
          </p>
          <div className="mt-2 text-center">
            <button
              onClick={reverse}
              disabled={busy}
              className="text-xs text-stone-400 hover:text-amber-700 disabled:opacity-50"
            >
              ↺ Reverse this transfer
            </button>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-700">
            Cancelled{cancelReason ? ` — ${cancelReason}` : ""}.
          </p>
          <button
            onClick={reopen}
            disabled={busy}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            ↩ Reopen request
          </button>
        </div>
      )}
    </div>
  );
}
