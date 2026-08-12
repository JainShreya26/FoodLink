"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DraftItem = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  source: string | null;
};

const CATEGORIES = ["Protein", "Grain", "Vegetable", "Fruit", "Dairy", "Other"];

const EXAMPLE = `Hi team — big drop-off today from the Safeway on Broadway:
40 cases canned corn (best by Dec), about 200 lbs white rice,
and fifteen jars of peanut butter. Also picked up ~30 lbs of
apples from Hidden Star Orchards, those need to move within 2 weeks.`;

export default function AddInventory() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[] | null>(null);

  const reset = () => {
    setText("");
    setItems(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const extract = async () => {
    setBusy("extract");
    setError(null);
    try {
      const form = new FormData();
      form.set("text", text);
      const file = fileRef.current?.files?.[0];
      if (file) form.set("file", file);

      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      if (!data.items?.length) {
        setError("No food items found in that input — try adding more detail.");
        return;
      }
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!items) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) =>
      prev ? prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)) : prev,
    );

  const remove = (idx: number) =>
    setItems((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
      >
        + Add Inventory (AI)
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      {!items ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Add inventory from anything</h2>
            <button
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              Cancel
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Paste a donation email, type a rough note, or upload a file (txt, csv,
            or a photo of a delivery note). The AI will structure it.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={EXAMPLE}
            className="mt-3 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.md,image/png,image/jpeg,image/webp,image/gif"
              className="text-sm text-stone-600 file:mr-2 file:rounded-lg file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm hover:file:bg-stone-300"
            />
            <button
              onClick={extract}
              disabled={busy !== null}
              className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "extract" ? "Extracting…" : "✨ Extract with AI"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Here&apos;s what I understood — edit anything, then confirm
            </h2>
            <button
              onClick={() => setItems(null)}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              ← Back
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-left text-stone-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Expiry</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="px-2 py-1.5">
                      <input
                        value={it.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="w-full rounded border border-stone-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={it.category}
                        onChange={(e) => update(i, { category: e.target.value })}
                        className="rounded border border-stone-200 px-2 py-1"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={it.quantity}
                        onChange={(e) =>
                          update(i, { quantity: Number(e.target.value) })
                        }
                        className="w-20 rounded border border-stone-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={it.unit}
                        onChange={(e) => update(i, { unit: e.target.value })}
                        className="w-20 rounded border border-stone-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={it.expiryDate ?? ""}
                        onChange={(e) =>
                          update(i, { expiryDate: e.target.value || null })
                        }
                        className="rounded border border-stone-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={it.source ?? ""}
                        onChange={(e) =>
                          update(i, { source: e.target.value || null })
                        }
                        className="w-full rounded border border-stone-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => remove(i)}
                        title="Remove row"
                        className="text-stone-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={save}
              disabled={busy !== null || items.length === 0}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "save"
                ? "Saving…"
                : `✓ Confirm & save ${items.length} item${items.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
