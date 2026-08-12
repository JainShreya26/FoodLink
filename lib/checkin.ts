import { randomBytes } from "node:crypto";

/**
 * The check-in ladder, rung by rung:
 *
 *   1. SMS with a one-tap link   ← built
 *   2. automated voice call      ← not built; needs telephony + a realtime
 *                                  voice stack. The CheckIn.channel field
 *                                  already carries "VOICE" so it can slot in.
 *   3. a human dispatcher rings  ← surfaced as UNREACHABLE for someone to action
 *
 * Rung 1 exists because a parked driver tapping one button beats a phone call
 * they cannot safely take while moving.
 */

export const OUTCOMES = ["ON_TIME", "DELAYED", "NOT_COMING", "UNREACHABLE"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ON_TIME: "On time",
  DELAYED: "Running late",
  NOT_COMING: "Not coming",
  UNREACHABLE: "No response",
};

/** How long a check-in link stays good. */
export const LINK_TTL_HOURS = 24;

/** 32 bytes of entropy — this is the only thing guarding the link. */
export const newToken = () => randomBytes(32).toString("hex");

/**
 * A driver's answer decides the shipment's status. Deterministic on purpose:
 * the check-in records what was said, it does not interpret it.
 */
export function statusForOutcome(outcome: Outcome): string | null {
  switch (outcome) {
    case "ON_TIME":
      return "CONFIRMED";
    case "DELAYED":
      return "DELAYED";
    case "NOT_COMING":
      return "CANCELLED";
    case "UNREACHABLE":
      return null; // leave the booking alone; a human decides
  }
}

export function buildMessage(input: {
  bankName: string;
  when: Date;
  link: string;
  driverName: string | null;
}): string {
  const when = input.when.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const hi = input.driverName ? `Hi ${input.driverName.split(" ")[0]} — ` : "";
  return `${hi}${input.bankName} here. Still on for your ${when} delivery? One tap: ${input.link} (automated message, reply STOP to opt out)`;
}

/** Preset delay options, in minutes — enough for one thumb. */
export const DELAY_CHOICES = [15, 30, 60, 120] as const;
