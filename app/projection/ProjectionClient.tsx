"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useDialog } from "@/components/Dialog";
import DeliveryForm, { type Shipment } from "./DeliveryForm";
import { OUTCOME_LABELS, type Outcome } from "@/lib/checkin";
import { SOURCE_LABELS, STATUSES, STATUS_LABELS, type ShipmentStatus } from "@/lib/shipments";

type CheckIn = {
  id: string;
  channel: string;
  requestedAt: string;
  respondedAt: string | null;
  outcome: string | null;
  etaMinutes: number | null;
  deliveryStatus: string;
  deliveryDetail: string | null;
};

const OUTCOME_STYLES: Record<string, string> = {
  ON_TIME: "bg-emerald-100 text-emerald-700",
  DELAYED: "bg-amber-100 text-amber-700",
  NOT_COMING: "bg-red-100 text-red-700",
  UNREACHABLE: "bg-stone-200 text-stone-600",
};

type Row = {
  key: string;
  name: string;
  unit: string;
  category: string;
  onHand: number;
  inbound: number;
  outbound: number;
  projected: number;
  parLevel: number | null;
  status: "SHORT" | "WATCH" | "OK";
  expired: number;
  expiringSoon: number;
  nextArrival: string | null;
  movements: {
    shipmentId: string;
    direction: string;
    quantity: number;
    scheduledFor: string;
    status: string;
    sourceName: string | null;
  }[];
};

const HORIZONS = [7, 14, 30, 60];

const STATUS_STYLES = {
  SHORT: "bg-red-100 text-red-700",
  WATCH: "bg-amber-100 text-amber-700",
  OK: "bg-emerald-100 text-emerald-700",
} as const;

const SHIPMENT_STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-stone-100 text-stone-600",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  DELAYED: "bg-amber-100 text-amber-700",
  ARRIVED: "bg-sky-100 text-sky-700",
  RECEIVED: "bg-emerald-700 text-white",
  CANCELLED: "bg-stone-200 text-stone-500 line-through",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function ProjectionClient({ bankName }: { bankName: string }) {
  const dialog = useDialog();
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [parDraft, setParDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn[]>>({});
  // Captured per load rather than read during render, so every card measures
  // "how long since we asked" against the same instant.
  const [loadedAt, setLoadedAt] = useState(0);
  const [lastLink, setLastLink] = useState<{
    id: string;
    link: string;
    note: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([
        fetch(`/api/projection?days=${days}`),
        fetch("/api/shipments"),
      ]);
      const pd = await p.json();
      const sd = await s.json();
      if (!p.ok) throw new Error(pd.error ?? "Could not load projection");
      if (!s.ok) throw new Error(sd.error ?? "Could not load deliveries");
      setRows(pd.rows);
      setShipments(sd.shipments);

      // Latest check-in per delivery, so the card can show where the ask stands.
      const pending = (sd.shipments as Shipment[]).filter(
        (s) => !["RECEIVED", "CANCELLED"].includes(s.status),
      );
      const results = await Promise.all(
        pending.map(async (s) => {
          const r = await fetch(`/api/shipments/${s.id}/checkin`);
          return [s.id, r.ok ? ((await r.json()).checkIns as CheckIn[]) : []] as const;
        }),
      );
      setCheckIns(Object.fromEntries(results));
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projection");
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const savePar = async (row: Row) => {
    const raw = parDraft[row.key];
    if (raw === undefined) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    try {
      const res = await fetch("/api/projection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, unit: row.unit, minQuantity: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      setParDraft((p) => {
        const next = { ...p };
        delete next[row.key];
        return next;
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save par level");
    }
  };

  const setStatus = async (shipment: Shipment, status: ShipmentStatus) => {
    if (status === "RECEIVED") {
      const ok = await dialog.confirm({
        title: "Receive this delivery into inventory?",
        body: (
          <>
            These lines are counted onto the shelf now:
            <ul className="mt-1.5 list-disc pl-5">
              {shipment.lines.map((l, i) => (
                <li key={i}>
                  {l.quantity} {l.unit} {l.name}
                </li>
              ))}
            </ul>
          </>
        ),
        confirmLabel: "Receive",
      });
      if (!ok) return;
    }
    setBusyId(shipment.id);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update delivery");
    } finally {
      setBusyId(null);
    }
  };

  const askDriver = async (shipment: Shipment) => {
    setBusyId(shipment.id);
    setError(null);
    setLastLink(null);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/checkin`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not request a check-in");
      setLastLink({
        id: shipment.id,
        link: data.link,
        note: data.delivery.detail as string,
        message: data.message as string,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request a check-in");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (shipment: Shipment) => {
    const ok = await dialog.confirm({
      title: "Delete this scheduled delivery?",
      body: (
        <>
          {shipment.sourceName ?? "This delivery"} on{" "}
          {fmtDateTime(shipment.scheduledFor)} stops counting toward the
          projection. To keep the record instead, set its status to Cancelled.
        </>
      ),
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(shipment.id);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete delivery");
    } finally {
      setBusyId(null);
    }
  };

  const shortCount = rows?.filter((r) => r.status === "SHORT").length ?? 0;
  // Cancelled deliveries are not scheduled and carry no check-in, so they get
  // their own muted section rather than sitting in the live list with an
  // "Ask driver" button that can never do anything.
  const upcoming =
    shipments?.filter((s) => s.status !== "RECEIVED" && s.status !== "CANCELLED") ?? [];
  const cancelled = shipments?.filter((s) => s.status === "CANCELLED") ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projection</h1>
          <p className="text-sm text-stone-500">
            What {bankName} will actually have once scheduled deliveries land.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          {showForm ? "Close" : "+ Schedule Delivery"}
        </button>
      </div>

      {(showForm || editing) && (
        <DeliveryForm
          existing={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Horizon */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <span className="text-sm font-medium text-stone-600">Looking ahead</span>
        <div className="flex gap-1">
          {HORIZONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                days === d
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
        {shortCount > 0 && (
          <span className="ml-auto rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            {shortCount} projected short
          </span>
        )}
      </div>

      {/* Upcoming deliveries */}
      <div className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Scheduled deliveries
        </h2>
        <div className="mt-2 space-y-2">
          {upcoming.map((s) => (
            <DeliveryCard
              key={s.id}
              shipment={s}
              busy={busyId === s.id}
              onStatus={(status) => setStatus(s, status)}
              onEdit={() => {
                setShowForm(false);
                setEditing(s);
              }}
              onDelete={() => remove(s)}
            >
              <CheckInPanel
                shipment={s}
                checkIns={checkIns[s.id] ?? []}
                busy={busyId === s.id}
                onAsk={() => askDriver(s)}
                link={lastLink?.id === s.id ? lastLink : null}
                now={loadedAt}
              />
            </DeliveryCard>
          ))}
          {shipments && upcoming.length === 0 && (
            <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
              Nothing scheduled. Add an expected donation, USDA drop or retail
              rescue run to see it in the projection below.
            </div>
          )}
        </div>

        {cancelled.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowCancelled((v) => !v)}
              aria-expanded={showCancelled}
              className="text-xs font-medium text-stone-500 hover:text-stone-700"
            >
              {showCancelled ? "▾" : "▸"} {cancelled.length} cancelled deliver
              {cancelled.length === 1 ? "y" : "ies"} — not counted in the
              projection
            </button>
            {showCancelled && (
              <div className="mt-2 space-y-2">
                {cancelled.map((s) => (
                  <DeliveryCard
                    key={s.id}
                    shipment={s}
                    busy={busyId === s.id}
                    muted
                    onStatus={(status) => setStatus(s, status)}
                    onEdit={() => {
                      setShowForm(false);
                      setEditing(s);
                    }}
                    onDelete={() => remove(s)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Projection table */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Projected stock · next {days} days
        </h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left text-stone-600">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium text-right">On hand</th>
                <th className="px-4 py-2 font-medium text-right">Inbound</th>
                <th className="px-4 py-2 font-medium text-right">Outbound</th>
                <th className="px-4 py-2 font-medium text-right">Projected</th>
                <th className="px-4 py-2 font-medium text-right">Par</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <Fragment key={row.key}>
                  <tr
                    onClick={() =>
                      setExpanded(expanded === row.key ? null : row.key)
                    }
                    className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium">{row.name}</span>{" "}
                      <span className="text-xs text-stone-400">{row.unit}</span>
                      {row.expired > 0 && (
                        <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-red-700">
                          {row.expired} expired
                        </span>
                      )}
                      {row.expiringSoon > 0 && (
                        <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-700">
                          {row.expiringSoon} expiring
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{row.onHand}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">
                      {row.inbound > 0 ? `+${row.inbound}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-700">
                      {row.outbound > 0 ? `−${row.outbound}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {row.projected}
                    </td>
                    <td
                      className="px-4 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="—"
                        aria-label={`Par level for ${row.name} in ${row.unit}`}
                        value={parDraft[row.key] ?? row.parLevel ?? ""}
                        onChange={(e) =>
                          setParDraft((p) => ({ ...p, [row.key]: e.target.value }))
                        }
                        onBlur={() => savePar(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        title="Minimum you want on hand — set this to make shortages meaningful"
                        className="w-20 rounded border border-stone-200 px-2 py-1 text-right text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                          STATUS_STYLES[row.status]
                        }`}
                      >
                        {row.status === "SHORT"
                          ? "Short"
                          : row.status === "WATCH"
                            ? "Watch"
                            : "OK"}
                      </span>
                      {row.nextArrival && (
                        <span className="ml-2 text-xs text-stone-400">
                          next {fmtDate(row.nextArrival)}
                        </span>
                      )}
                    </td>
                  </tr>

                  {expanded === row.key && (
                    <tr className="border-t border-stone-100 bg-stone-50/70">
                      <td colSpan={7} className="px-4 py-3">
                        {row.movements.length === 0 ? (
                          <p className="text-xs text-stone-400">
                            No scheduled movements in this window — projection is
                            just what&apos;s on the shelf.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {row.movements.map((m, i) => (
                              <li key={i} className="flex items-baseline gap-2 text-xs">
                                <span
                                  className={
                                    m.direction === "INBOUND"
                                      ? "text-emerald-700"
                                      : "text-amber-700"
                                  }
                                >
                                  {m.direction === "INBOUND" ? "+" : "−"}
                                  {m.quantity} {row.unit}
                                </span>
                                <span className="text-stone-500">
                                  {m.sourceName ?? "—"}
                                </span>
                                <span className="ml-auto text-stone-400">
                                  {fmtDate(m.scheduledFor)} ·{" "}
                                  {STATUS_LABELS[m.status as ShipmentStatus] ?? m.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-400">
                    Nothing to project yet — add inventory or schedule a delivery.
                  </td>
                </tr>
              )}
              {!rows && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-400">
                    Loading projection…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Projected = on hand + inbound − outbound within the window. Set a par
          level to say what &ldquo;short&rdquo; means for an item; without one,
          only items running to zero are flagged. Red{" "}
          <span className="text-red-700">expired</span> counts stock already past
          its date — pull it before you count on it.
        </p>
      </div>
    </div>
  );
}

/** One booked movement. `children` is the check-in panel, omitted when cancelled. */
function DeliveryCard({
  shipment: s,
  busy,
  muted = false,
  onStatus,
  onEdit,
  onDelete,
  children,
}: {
  shipment: Shipment;
  busy: boolean;
  muted?: boolean;
  onStatus: (status: ShipmentStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-stone-200 p-3 ${
        muted ? "bg-stone-50" : "bg-white"
      }`}
    >
      <div className={`flex flex-wrap items-center gap-2 ${muted ? "opacity-70" : ""}`}>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase whitespace-nowrap ${
            s.direction === "INBOUND"
              ? "bg-emerald-700 text-white"
              : "bg-amber-600 text-white"
          }`}
        >
          {s.direction === "INBOUND" ? "In" : "Out"}
        </span>
        <span className="font-medium">
          {s.sourceName ?? SOURCE_LABELS[s.sourceType as keyof typeof SOURCE_LABELS]}
        </span>
        <span className="text-sm text-stone-500">{fmtDateTime(s.scheduledFor)}</span>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
            SHIPMENT_STATUS_STYLES[s.status] ?? "bg-stone-100"
          }`}
        >
          {STATUS_LABELS[s.status as ShipmentStatus] ?? s.status}
          {s.status === "DELAYED" && s.etaMinutes ? ` · +${s.etaMinutes}m` : ""}
        </span>
      </div>

      <p className={`mt-1 text-sm text-stone-600 ${muted ? "opacity-70" : ""}`}>
        {s.lines.map((l) => `${l.quantity} ${l.unit} ${l.name}`).join(" · ")}
      </p>
      {s.driverName && (
        <p className="text-xs text-stone-400">
          Driver: {s.driverName}
          {s.driverPhone ? ` · ${s.driverPhone}` : ""}
          {s.driverPhone && !s.driverConsent && (
            <span className="ml-1 text-amber-600">· no text consent</span>
          )}
        </p>
      )}
      {s.note && <p className="mt-1 text-xs text-stone-500">{s.note}</p>}

      {children}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor={`status-${s.id}`}>
          Delivery status
        </label>
        <select
          id={`status-${s.id}`}
          value={s.status}
          onChange={(e) => onStatus(e.target.value as ShipmentStatus)}
          disabled={busy}
          className="rounded-lg border border-stone-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABELS[st]}
            </option>
          ))}
        </select>
        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-emerald-700 disabled:opacity-40"
        >
          ✎ Edit
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          ✕ Delete
        </button>
      </div>
    </div>
  );
}

/**
 * The dispatcher's half of the check-in ladder: ask by text, see the answer, and
 * when nobody answers, get told to pick up the phone.
 */
function CheckInPanel({
  shipment,
  checkIns,
  busy,
  onAsk,
  link,
  now,
}: {
  shipment: Shipment;
  checkIns: CheckIn[];
  busy: boolean;
  onAsk: () => void;
  link: { link: string; note: string; message: string } | null;
  now: number;
}) {
  const latest = checkIns[0];
  const answered = latest?.respondedAt != null;
  const waitedTooLong =
    latest != null &&
    !answered &&
    now - new Date(latest.requestedAt).getTime() > 45 * 60 * 1000;

  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAsk}
          disabled={busy || !shipment.driverPhone}
          title={
            shipment.driverPhone
              ? "Text the driver a one-tap check-in link"
              : "Add a driver phone number first"
          }
          className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
        >
          {busy ? "Asking…" : latest ? "Ask again" : "📱 Ask driver"}
        </button>

        {latest && (
          <>
            {answered ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  OUTCOME_STYLES[latest.outcome ?? ""] ?? "bg-stone-200"
                }`}
              >
                {OUTCOME_LABELS[latest.outcome as Outcome] ?? latest.outcome}
                {latest.etaMinutes ? ` · +${latest.etaMinutes}m` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-600">
                Awaiting reply
              </span>
            )}
            <span className="text-[11px] text-stone-400">
              asked{" "}
              {new Date(latest.requestedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </>
        )}
      </div>

      {/* Rung 3: nobody answered, so a person needs to ring them. */}
      {waitedTooLong && (
        <p className="mt-1.5 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800">
          No reply in 45 minutes — call {shipment.driverName ?? "the driver"}
          {shipment.driverPhone ? ` on ${shipment.driverPhone}` : ""}.
        </p>
      )}

      {/* The fresh preview below carries this same note, so don't say it twice. */}
      {!link && latest && latest.deliveryStatus !== "SENT" && !answered && (
        <p className="mt-1.5 text-[11px] text-stone-500">{latest.deliveryDetail}</p>
      )}

      {link && (
        <div className="mt-2 rounded-lg border border-stone-200 bg-white p-2.5">
          <p className="text-[11px] font-medium text-stone-500">
            What {shipment.driverName ?? "the driver"} gets
            {shipment.driverPhone ? ` at ${shipment.driverPhone}` : ""}
          </p>

          {/* Rendered the way it lands on their phone, so you can read it back
              before it goes anywhere. */}
          <div className="mt-1.5 max-w-sm rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2">
            <p className="text-xs leading-relaxed break-words whitespace-pre-wrap text-stone-800">
              {link.message}
            </p>
          </div>

          <p className="mt-1.5 text-[11px] text-amber-700">{link.note}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <button
              onClick={() => navigator.clipboard?.writeText(link.message)}
              className="rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
            >
              Copy message
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(link.link)}
              className="rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
            >
              Copy link only
            </button>
            <a
              href={link.link}
              target="_blank"
              rel="noreferrer"
              className="rounded px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Open as driver →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
