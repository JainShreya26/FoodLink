import { prisma } from "./prisma";

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
