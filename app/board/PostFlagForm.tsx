"use client";

import { useState } from "react";

const UNITS = ["lbs", "cases", "cans", "boxes", "jars", "gallons", "dozen", "each"];

export default function PostFlagForm({ onPosted }: { onPosted: () => void }) {
  const [type, setType] = useState<"SURPLUS" | "SHORTAGE">("SURPLUS");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [contactName, setContactName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          itemName,
          quantity: Number(quantity),
          unit,
          contactName,
          contactInfo,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post flag");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post flag");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
    >
      <h2 className="font-semibold">Post a flag to the network</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="flag-item" className="text-xs font-medium text-stone-600">
            Food item
          </label>
          <input
            id="flag-item"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
            placeholder="e.g. canned corn, baby formula"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <span className="text-xs font-medium text-stone-600">
            Do you have too much, or do you need this?
          </span>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setType("SURPLUS")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                type === "SURPLUS"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-stone-300 bg-white text-stone-600 hover:border-emerald-400"
              }`}
            >
              Surplus — we have extra
            </button>
            <button
              type="button"
              onClick={() => setType("SHORTAGE")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                type === "SHORTAGE"
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-stone-300 bg-white text-stone-600 hover:border-amber-400"
              }`}
            >
              Shortage — we need this
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="flag-qty" className="text-xs font-medium text-stone-600">
            {type === "SURPLUS" ? "Quantity available" : "Quantity required"}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="flag-qty"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="300"
              className="w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Unit"
              className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="flag-contact-name" className="text-xs font-medium text-stone-600">
            Contact name
          </label>
          <input
            id="flag-contact-name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            placeholder="Maria Lopez"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="flag-contact-info" className="text-xs font-medium text-stone-600">
            Phone or email
          </label>
          <input
            id="flag-contact-info"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            required
            placeholder="(510) 555-0142 or maria@foodbank.org"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="flag-note" className="text-xs font-medium text-stone-600">
            Note (optional)
          </label>
          <input
            id="flag-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Must move by Friday, no refrigeration available"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post to network"}
        </button>
      </div>
    </form>
  );
}
