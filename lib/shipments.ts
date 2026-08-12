import { z } from "zod";

export const DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export const SOURCE_TYPES = ["DONOR", "USDA", "RESCUE", "PURCHASE", "TRANSFER"] as const;

/**
 * SCHEDULED  → booked, nobody has confirmed
 * CONFIRMED  → driver or donor confirmed the window
 * DELAYED    → confirmed but running late, etaMinutes carries the estimate
 * ARRIVED    → at the dock, not yet counted in
 * RECEIVED   → counted into inventory; stops counting toward projection
 * CANCELLED  → not coming; stops counting toward projection
 */
export const STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "DELAYED",
  "ARRIVED",
  "RECEIVED",
  "CANCELLED",
] as const;

export type ShipmentStatus = (typeof STATUSES)[number];

/** Statuses that still represent food expected to move. */
export const PENDING_STATUSES: ShipmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "DELAYED",
  "ARRIVED",
];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  DELAYED: "Delayed",
  ARRIVED: "Arrived",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export const SOURCE_LABELS: Record<(typeof SOURCE_TYPES)[number], string> = {
  DONOR: "Donor",
  USDA: "USDA / TEFAP",
  RESCUE: "Retail rescue",
  PURCHASE: "Purchased",
  TRANSFER: "Network transfer",
};

const lineSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(40),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  expiryDate: z.string().nullable().optional(),
});

export const shipmentSchema = z.object({
  direction: z.enum(DIRECTIONS),
  sourceType: z.enum(SOURCE_TYPES),
  sourceName: z.string().max(120).nullable().optional(),
  scheduledFor: z.string().min(1),
  windowEnd: z.string().nullable().optional(),
  driverName: z.string().max(80).nullable().optional(),
  driverPhone: z.string().max(40).nullable().optional(),
  driverConsent: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item."),
});

export const shipmentPatchSchema = shipmentSchema.partial().extend({
  status: z.enum(STATUSES).optional(),
  etaMinutes: z.number().int().min(0).max(2880).nullable().optional(),
});
