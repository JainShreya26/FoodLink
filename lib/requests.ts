import { prisma } from "./prisma";

/**
 * How far a conversation has got, derived rather than stored so it can never
 * disagree with the fields it summarises.
 *
 *   TALKING   → someone responded, no number agreed yet
 *   AGREED    → a quantity is on the table
 *   SCHEDULED → a quantity *and* a date, i.e. a real commitment
 *   DONE      → the food moved
 *   CANCELLED → it didn't
 */
export const STAGES = ["TALKING", "AGREED", "SCHEDULED", "DONE"] as const;
export type RequestStage = (typeof STAGES)[number] | "CANCELLED";

export const STAGE_LABELS: Record<RequestStage, string> = {
  TALKING: "Talking",
  AGREED: "Quantity agreed",
  SCHEDULED: "Pickup booked",
  DONE: "Delivered",
  CANCELLED: "Cancelled",
};

export function requestStage(req: {
  status: string;
  agreedQuantity: number | null;
  scheduledFor: Date | string | null;
}): RequestStage {
  if (req.status === "CANCELLED") return "CANCELLED";
  if (req.status === "COMPLETED") return "DONE";
  if (req.scheduledFor) return "SCHEDULED";
  if (req.agreedQuantity !== null) return "AGREED";
  return "TALKING";
}

/**
 * A request always has two sides. For a SURPLUS flag the poster gives and the
 * requester receives; for a SHORTAGE flag the requester supplies and the poster
 * receives.
 */
export function transferDirection(flagType: string, posterBankId: string, requesterBankId: string) {
  return flagType === "SURPLUS"
    ? { giverBankId: posterBankId, receiverBankId: requesterBankId }
    : { giverBankId: requesterBankId, receiverBankId: posterBankId };
}

/** Load a request with both sides, verifying the viewer is a participant. */
export async function loadRequestForBank(requestId: string, bankId: string) {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { flag: { include: { foodBank: true } } },
  });
  if (!req) return null;

  const isParticipant =
    req.requesterBankId === bankId || req.flag.foodBankId === bankId;
  if (!isParticipant) return null;

  return req;
}
