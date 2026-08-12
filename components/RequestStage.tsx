import { STAGES, STAGE_LABELS, type RequestStage } from "@/lib/requests";

const STAGE_STYLES: Record<RequestStage, string> = {
  TALKING: "bg-sky-100 text-sky-700",
  AGREED: "bg-indigo-100 text-indigo-700",
  SCHEDULED: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-stone-200 text-stone-500",
};

export function StageBadge({ stage }: { stage: RequestStage }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STAGE_STYLES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

/**
 * Four dots, one per stage. Small enough to sit inside a card, and it answers
 * "how far along is this" without making anyone read the thread.
 */
export function StageProgress({ stage }: { stage: RequestStage }) {
  if (stage === "CANCELLED") {
    return (
      <p className="text-[11px] text-stone-400">Cancelled — nothing scheduled.</p>
    );
  }
  const current = STAGES.indexOf(stage as (typeof STAGES)[number]);

  return (
    <ol className="flex items-center gap-1" aria-label={`Progress: ${STAGE_LABELS[stage]}`}>
      {STAGES.map((s, i) => {
        const reached = i <= current;
        return (
          <li key={s} className="flex flex-1 items-center gap-1">
            <span
              title={STAGE_LABELS[s]}
              className={`h-1.5 w-full rounded-full ${
                reached ? "bg-emerald-600" : "bg-stone-200"
              }`}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** The one-line summary of a commitment: how much, when, and any handover note. */
export function HandoverSummary({
  stage,
  agreedQuantity,
  finalQuantity,
  scheduledFor,
  handoverNote,
  unit,
}: {
  stage: RequestStage;
  agreedQuantity: number | null;
  finalQuantity: number | null;
  scheduledFor: string | null;
  handoverNote: string | null;
  unit: string;
}) {
  const quantity = finalQuantity ?? agreedQuantity;
  const when = scheduledFor
    ? new Date(scheduledFor).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const bits: string[] = [];
  if (quantity !== null) {
    bits.push(
      `${quantity} ${unit}${stage === "DONE" ? " transferred" : ""}`,
    );
  } else {
    bits.push("quantity not agreed");
  }
  bits.push(when ? when : "no pickup booked");

  return (
    <p className="text-xs text-stone-600">
      {bits.join(" · ")}
      {handoverNote && (
        <span className="block text-[11px] text-stone-400">{handoverNote}</span>
      )}
    </p>
  );
}
