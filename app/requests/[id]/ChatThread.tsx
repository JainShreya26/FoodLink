"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/Dialog";
import { StageProgress } from "@/components/RequestStage";
import { requestStage } from "@/lib/requests";

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
  SCHEDULED: "Handover booked",
  COMPLETED: "Transfer completed",
  CANCELLED: "Request cancelled",
  REOPENED: "Request reopened",
  REVERSED: "Transfer reversed",
};

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
  scheduledFor,
  handoverNote,
  maxQuantity,
  unit,
  itemName,
}: {
  requestId: string;
  initialStatus: string;
  finalQuantity: number | null;
  agreedQuantity: number | null;
  scheduledFor: string | null;
  handoverNote: string | null;
  maxQuantity: number;
  unit: string;
  itemName: string;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [finalQty, setFinalQty] = useState<number | null>(finalQuantity);
  const [agreedQty, setAgreedQty] = useState<number | null>(agreedQuantity);
  const [available, setAvailable] = useState<number>(maxQuantity);
  const [flagStatus, setFlagStatus] = useState<string>("OPEN");
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState(String(agreedQuantity ?? maxQuantity));
  const [when, setWhen] = useState(toLocalInput(scheduledFor));
  const [bookedFor, setBookedFor] = useState<string | null>(scheduledFor);
  const [note, setNote] = useState(handoverNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAgreedRef = useRef<number | null>(agreedQuantity);
  const lastScheduledRef = useRef<string | null>(scheduledFor);

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
      setFlagStatus(data.flagStatus ?? "OPEN");
      setCancelReason(data.cancelReason ?? null);
      // Adopt a *newly* proposed number so the field isn't stranded on whatever
      // this tab loaded with — but only on a change, or the 3s poll would fight
      // whatever the user is typing.
      if (
        data.agreedQuantity != null &&
        data.agreedQuantity !== lastAgreedRef.current
      ) {
        setQty(String(data.agreedQuantity));
      }
      lastAgreedRef.current = data.agreedQuantity ?? null;

      // Same rule for the booking: adopt the other side's date when it changes,
      // otherwise leave whatever is being typed alone.
      setBookedFor(data.scheduledFor ?? null);
      if (data.scheduledFor !== lastScheduledRef.current) {
        setWhen(toLocalInput(data.scheduledFor ?? null));
        setNote(data.handoverNote ?? "");
      }
      lastScheduledRef.current = data.scheduledFor ?? null;
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

  /** Shared by Propose and Mark Complete — neither can act on a bad number. */
  const readQty = (): number | null => {
    const value = Number(qty);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a quantity greater than 0.");
      return null;
    }
    if (value > available) {
      setError(`Only ${available} ${unit} are still on this flag.`);
      return null;
    }
    return value;
  };

  const propose = () => {
    const value = readQty();
    if (value === null) return;
    act("", { agreedQuantity: value }, "PATCH");
  };

  const book = () => {
    if (!when) {
      setError("Pick a date and time for the handover.");
      return;
    }
    act(
      "",
      {
        scheduledFor: new Date(when).toISOString(),
        handoverNote: note.trim() || null,
      },
      "PATCH",
    );
  };

  const unbook = () => act("", { scheduledFor: null, handoverNote: null }, "PATCH");

  const complete = async () => {
    const value = readQty();
    if (value === null) return;
    const ok = await dialog.confirm({
      title: "Mark this request complete?",
      body: (
        <>
          {value} {unit} of {itemName} moves now, and both food banks&apos;
          inventory is updated. It can be reversed afterwards.
        </>
      ),
      confirmLabel: `Transfer ${value} ${unit}`,
    });
    if (ok) act("/complete", { quantity: value });
  };

  const cancel = async () => {
    const reason = await dialog.prompt({
      title: "Cancel this request?",
      body: "The other food bank sees the reason in the thread. You can reopen it later.",
      label: "Why? (optional)",
      placeholder: "Already covered, too far to drive…",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it open",
      tone: "danger",
    });
    if (reason === null) return;
    act("/cancel", { reason });
  };

  const reopen = () => act("/reopen", {});

  const reverse = async () => {
    const reason = await dialog.prompt({
      title: "Reverse this transfer?",
      body: (
        <>
          {finalQty} {unit} of {itemName} goes back to the sender and the request
          returns to open.
        </>
      ),
      label: "Why? (optional)",
      placeholder: "Wrong pallet, short count on arrival…",
      confirmLabel: "Reverse transfer",
      tone: "danger",
    });
    if (reason === null) return;
    act("/reverse", { reason });
  };

  const done = status === "COMPLETED";
  const cancelled = status === "CANCELLED";
  // An open request against a flag that has been fully allocated has nothing
  // left to move — offering a 0-max quantity box is a dead end.
  const exhausted = available <= 0 || flagStatus === "CLOSED";
  const open = status === "OPEN";
  const stage = requestStage({
    status,
    agreedQuantity: agreedQty,
    scheduledFor: bookedFor,
  });

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase whitespace-nowrap ${
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

      {/* Talking → agreed → booked → delivered, at a glance. */}
      <div className="mt-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
        <StageProgress stage={stage} />
        <p className="mt-1.5 text-xs text-stone-500">
          {agreedQty !== null || finalQty !== null
            ? `${finalQty ?? agreedQty} ${unit}`
            : "Quantity not agreed"}
          {" · "}
          {bookedFor
            ? new Date(bookedFor).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "no pickup booked"}
          {note ? ` · ${note}` : ""}
        </p>
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
            aria-label="Message"
            placeholder="Type a message…"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
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
          {exhausted ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This flag is fully allocated — all of the {itemName} has been
              transferred on other requests. Nothing is left to move here, so
              close this conversation out or ask them to post a fresh flag.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="transfer-qty" className="text-sm text-stone-600">
                Quantity:
              </label>
              <input
                id="transfer-qty"
                type="number"
                min="0"
                max={available}
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm"
              />
              <span className="text-sm text-stone-500">
                {unit}{" "}
                <span className="text-xs text-stone-400">
                  of {available} available
                </span>
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
          )}

          {/* "How much" is only half a commitment — this is the "when". */}
          {!exhausted && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label
                    htmlFor="handover-when"
                    className="block text-xs font-medium text-stone-600"
                  >
                    Handover
                  </label>
                  <input
                    id="handover-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="mt-1 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                  />
                </div>
                <div className="min-w-[160px] flex-1">
                  <label
                    htmlFor="handover-note"
                    className="block text-xs font-medium text-stone-600"
                  >
                    Who and where (optional)
                  </label>
                  <input
                    id="handover-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ray collects, dock 4"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1 text-sm"
                  />
                </div>
                <button
                  onClick={book}
                  disabled={busy}
                  className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {bookedFor ? "Update booking" : "🚚 Book pickup"}
                </button>
                {bookedFor && (
                  <button
                    onClick={unbook}
                    disabled={busy}
                    className="rounded px-2 py-1.5 text-xs text-stone-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

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
