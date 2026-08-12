"use client";

import { useState } from "react";
import { DIRECTIONS, SOURCE_LABELS, SOURCE_TYPES } from "@/lib/shipments";

export type ShipmentLine = {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
};

export type Shipment = {
  id: string;
  direction: string;
  sourceType: string;
  sourceName: string | null;
  scheduledFor: string;
  windowEnd: string | null;
  status: string;
  driverName: string | null;
  driverPhone: string | null;
  driverConsent: boolean;
  etaMinutes: number | null;
  note: string | null;
  lines: ShipmentLine[];
};

const CATEGORIES = ["Protein", "Grain", "Vegetable", "Fruit", "Dairy", "Other"];

const emptyLine = (): ShipmentLine => ({
  name: "",
  category: "Other",
  quantity: 0,
  unit: "lbs",
  expiryDate: null,
});

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const defaultWhen = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
};

export default function DeliveryForm({
  existing,
  onDone,
  onCancel,
}: {
  existing: Shipment | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [direction, setDirection] = useState(existing?.direction ?? "INBOUND");
  const [sourceType, setSourceType] = useState(existing?.sourceType ?? "DONOR");
  const [sourceName, setSourceName] = useState(existing?.sourceName ?? "");
  const [scheduledFor, setScheduledFor] = useState(
    existing ? toLocalInput(existing.scheduledFor) : defaultWhen(),
  );
  const [windowEnd, setWindowEnd] = useState(
    existing ? toLocalInput(existing.windowEnd) : "",
  );
  const [driverName, setDriverName] = useState(existing?.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(existing?.driverPhone ?? "");
  const [driverConsent, setDriverConsent] = useState(existing?.driverConsent ?? false);
  const [note, setNote] = useState(existing?.note ?? "");
  const [lines, setLines] = useState<ShipmentLine[]>(
    existing?.lines.length ? existing.lines : [emptyLine()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<ShipmentLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (clean.length === 0) {
      setError("Add at least one item with a quantity.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        direction,
        sourceType,
        sourceName: sourceName.trim() || null,
        scheduledFor: new Date(scheduledFor).toISOString(),
        windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
        driverName: driverName.trim() || null,
        driverPhone: driverPhone.trim() || null,
        driverConsent,
        note: note.trim() || null,
        lines: clean.map((l) => ({
          name: l.name.trim(),
          category: l.category,
          quantity: Number(l.quantity),
          unit: l.unit.trim(),
          expiryDate: l.expiryDate,
        })),
      };

      const res = await fetch(
        existing ? `/api/shipments/${existing.id}` : "/api/shipments",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save delivery");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save delivery");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {existing ? "Edit delivery" : "Schedule a delivery"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-stone-600">
          Direction
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d === "INBOUND" ? "Coming in" : "Going out"}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-stone-600">
          Source
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Who
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Safeway Broadway, USDA TEFAP, Berkeley Food Pantry…"
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-stone-600">
          Expected
          <input
            type="datetime-local"
            required
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-stone-600">
          Window ends (optional)
          <input
            type="datetime-local"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-stone-600">
          Driver
          <input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Name"
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-stone-600">
          Driver phone
          <input
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            placeholder="(555) 555-0100"
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={driverConsent}
          onChange={(e) => setDriverConsent(e.target.checked)}
          className="mt-0.5 accent-emerald-700"
        />
        <span>
          This driver has agreed to receive automated check-in texts at that
          number.{" "}
          <span className="text-stone-400">
            Required before FoodLink will message them — consent has to be on
            record, not assumed.
          </span>
        </span>
      </label>

      {/* Lines */}
      <div>
        <p className="text-xs font-medium text-stone-600">What&apos;s on it</p>
        <div className="mt-1 space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={line.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Item"
                className="min-w-[140px] flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
              <select
                value={line.category}
                onChange={(e) => update(i, { category: e.target.value })}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={line.quantity || ""}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                placeholder="Qty"
                className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
              <input
                value={line.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
                placeholder="unit"
                className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={line.expiryDate ?? ""}
                onChange={(e) => update(i, { expiryDate: e.target.value || null })}
                title="Best-by date"
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                disabled={lines.length === 1}
                className="rounded px-2 py-1 text-xs text-stone-400 hover:text-red-600 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((p) => [...p, emptyLine()])}
          className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
        >
          + Add another item
        </button>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note — dock 3, needs pallet jack, call on arrival…"
        className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : existing ? "Save changes" : "Schedule delivery"}
        </button>
      </div>
    </form>
  );
}
