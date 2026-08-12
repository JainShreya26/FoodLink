"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/Dialog";

type Item = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null; // ISO
  source: string | null;
};

type Draft = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null; // YYYY-MM-DD
  source: string | null;
};

const CATEGORIES = ["Protein", "Grain", "Vegetable", "Fruit", "Dairy", "Other"];
const DAY = 24 * 60 * 60 * 1000;

function toDateInput(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** inline-block + nowrap: an inline badge that wraps splits its own pill in two. */
const BADGE = "inline-block rounded px-2 py-0.5 whitespace-nowrap";

function ExpiryBadge({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-stone-400">—</span>;
  const date = new Date(iso);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / DAY);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (daysLeft < 0)
    return (
      <span className={`${BADGE} bg-red-100 text-red-700`}>
        {dateStr} · expired
      </span>
    );
  if (daysLeft <= 14)
    return (
      <span className={`${BADGE} bg-amber-100 text-amber-700`}>
        {dateStr} · {daysLeft === 0 ? "today" : `${daysLeft}d left`}
      </span>
    );
  return <span className="text-stone-600">{dateStr}</span>;
}

type HistoryEvent = {
  id: string;
  action: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  changes: string | null;
  note: string | null;
  actorBankName: string;
  createdAt: string;
};

const ACTION_STYLES: Record<string, string> = {
  CREATED: "bg-emerald-100 text-emerald-700",
  UPDATED: "bg-sky-100 text-sky-700",
  DELETED: "bg-red-100 text-red-700",
  RESTORED: "bg-emerald-100 text-emerald-700",
  TRANSFER_IN: "bg-indigo-100 text-indigo-700",
  TRANSFER_OUT: "bg-amber-100 text-amber-700",
  TRANSFER_REVERSED: "bg-stone-200 text-stone-600",
};

function describe(e: HistoryEvent): string {
  switch (e.action) {
    case "CREATED":
      return `Added — ${e.quantityAfter}`;
    case "DELETED":
      return `Removed${e.note ? ` — ${e.note}` : ""}`;
    case "RESTORED":
      return "Restored to inventory";
    case "TRANSFER_IN":
      return `Received via transfer${e.note ? ` — ${e.note}` : ""}`;
    case "TRANSFER_OUT":
      return `Sent via transfer${e.note ? ` — ${e.note}` : ""}`;
    case "TRANSFER_REVERSED":
      return `Transfer reversed${e.note ? ` — ${e.note}` : ""}`;
    case "UPDATED": {
      if (!e.changes) return "Edited";
      try {
        const parsed = JSON.parse(e.changes) as Record<
          string,
          { from: unknown; to: unknown }
        >;
        return Object.entries(parsed)
          .map(([f, c]) => `${f}: ${c.from ?? "—"} → ${c.to ?? "—"}`)
          .join(", ");
      } catch {
        return "Edited";
      }
    }
    default:
      return e.action;
  }
}

export default function InventoryTable({
  items,
  removedCount = 0,
}: {
  items: Item[];
  removedCount?: number;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);

  const [showRemoved, setShowRemoved] = useState(false);
  const [removed, setRemoved] = useState<Item[] | null>(null);

  const openHistory = async (item: Item) => {
    if (historyId === item.id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(item.id);
    setHistory(null);
    try {
      const res = await fetch(`/api/inventory/${item.id}`);
      const data = await res.json();
      if (res.ok) setHistory(data.events);
    } catch {
      setHistory([]);
    }
  };

  const loadRemoved = async () => {
    const next = !showRemoved;
    setShowRemoved(next);
    if (!next) return;
    try {
      const res = await fetch("/api/inventory?removed=1");
      const data = await res.json();
      if (res.ok) setRemoved(data.items);
    } catch {
      setRemoved([]);
    }
  };

  const restore = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setRemoved((prev) => prev?.filter((i) => i.id !== id) ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item: Item) => {
    setError(null);
    setEditingId(item.id);
    setDraft({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      expiryDate: toDateInput(item.expiryDate),
      source: item.source,
    });
  };

  const cancel = () => {
    setEditingId(null);
    setDraft(null);
  };

  const save = async () => {
    if (!editingId || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      cancel();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: Item) => {
    const note = await dialog.prompt({
      title: `Remove ${item.name} from inventory?`,
      body: (
        <>
          {item.quantity} {item.unit} comes off the shelf. Nothing is deleted —
          the item stays under &ldquo;removed items&rdquo; with its full history.
        </>
      ),
      label: "Why is it going?",
      placeholder: "spoiled, distributed, miscount…",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (note === null) return; // cancelled
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      if (historyId === item.id) setHistoryId(null);
      setRemoved(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          {/* Fixed widths: without them the edit row's inputs resize every
              column and the whole table jumps sideways on entering edit mode. */}
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[19%]" />
            <col className="w-[19%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="bg-stone-100 text-left text-stone-600">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Quantity</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              editingId === item.id && draft ? (
                <tr key={item.id} className="border-t border-stone-100 bg-emerald-50/40">
                  <td className="px-2 py-1.5">
                    <input
                      value={draft.name}
                      aria-label="Item name"
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="w-full rounded border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={draft.category}
                      aria-label="Category"
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      className="w-full rounded border border-stone-300 px-2 py-1"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={draft.quantity}
                        aria-label="Quantity"
                        onChange={(e) =>
                          setDraft({ ...draft, quantity: Number(e.target.value) })
                        }
                        className="w-full min-w-0 rounded border border-stone-300 px-2 py-1"
                      />
                      <input
                        value={draft.unit}
                        aria-label="Unit"
                        onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                        className="w-full min-w-0 rounded border border-stone-300 px-2 py-1"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={draft.expiryDate ?? ""}
                      aria-label="Expiry date"
                      onChange={(e) =>
                        setDraft({ ...draft, expiryDate: e.target.value || null })
                      }
                      className="w-full rounded border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={draft.source ?? ""}
                      aria-label="Source"
                      onChange={(e) =>
                        setDraft({ ...draft, source: e.target.value || null })
                      }
                      className="w-full rounded border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={save}
                      disabled={busy}
                      className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={cancel}
                      disabled={busy}
                      className="ml-1 rounded px-2.5 py-1 text-xs text-stone-500 hover:text-stone-700"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <Fragment key={item.id}>
                <tr className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{item.name}</td>
                  <td className="px-4 py-2">
                    <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs whitespace-nowrap">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-4 py-2">
                    <ExpiryBadge iso={item.expiryDate} />
                  </td>
                  <td className="px-4 py-2 text-stone-500">{item.source ?? "—"}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => openHistory(item)}
                      disabled={busy}
                      aria-expanded={historyId === item.id}
                      title={`History for ${item.name}`}
                      className={`rounded px-2 py-1 text-xs hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent ${
                        historyId === item.id
                          ? "text-emerald-700"
                          : "text-stone-500 hover:text-emerald-700"
                      }`}
                    >
                      ⏱ History
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      disabled={busy}
                      title={`Edit ${item.name}`}
                      className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-emerald-700 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      ✎ Edit
                    </button>
                    <button
                      onClick={() => remove(item)}
                      disabled={busy}
                      aria-label={`Remove ${item.name}`}
                      title={`Remove ${item.name}`}
                      className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </td>
                </tr>

                {historyId === item.id && (
                  <tr className="border-t border-stone-100 bg-stone-50/70">
                    <td colSpan={6} className="px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        History
                      </p>
                      {history === null ? (
                        <p className="text-xs text-stone-400">Loading…</p>
                      ) : history.length === 0 ? (
                        <p className="text-xs text-stone-400">
                          No events recorded for this item.
                        </p>
                      ) : (
                        <ol className="space-y-1.5">
                          {history.map((e) => (
                            <li key={e.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  ACTION_STYLES[e.action] ?? "bg-stone-200 text-stone-600"
                                }`}
                              >
                                {e.action.replace(/_/g, " ").toLowerCase()}
                              </span>
                              <span className="text-stone-700">{describe(e)}</span>
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
                        </ol>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ),
            )}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-400">
                  No inventory yet — add some above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {removedCount > 0 && (
        <div className="mt-3">
          <button
            onClick={loadRemoved}
            className="text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            {showRemoved ? "▾" : "▸"} {removedCount} removed item
            {removedCount === 1 ? "" : "s"} — kept with full history
          </button>

          {showRemoved && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-dashed border-stone-300 bg-stone-50">
              {/* Same column grid as the table above, so this reads as a
                  separate section rather than a misaligned continuation. */}
              <table className="w-full min-w-[860px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[20%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[19%]" />
                  <col className="w-[19%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead className="text-left text-xs text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Quantity</th>
                    <th className="px-4 py-2 font-medium">Expiry</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {removed === null ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-xs text-stone-400">
                        Loading…
                      </td>
                    </tr>
                  ) : (
                    removed.map((item) => (
                      <tr key={item.id} className="border-t border-stone-200">
                        <td className="px-4 py-2 text-stone-500 line-through">
                          {item.name}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-block rounded-full bg-stone-200/70 px-2 py-0.5 text-xs whitespace-nowrap text-stone-500">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-stone-400">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-2 text-stone-400">
                          {item.expiryDate
                            ? new Date(item.expiryDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-stone-400">{item.source ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => restore(item.id)}
                            disabled={busy}
                            className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                          >
                            ↩ Restore
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  {removed?.length === 0 && (
                    <tr className="border-t border-stone-200">
                      <td colSpan={6} className="px-4 py-3 text-xs text-stone-400">
                        Nothing removed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
