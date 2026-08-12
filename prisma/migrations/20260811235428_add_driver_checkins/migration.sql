-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "respondedAt" DATETIME,
    "outcome" TEXT,
    "etaMinutes" INTEGER,
    "note" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryDetail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBankId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT,
    "scheduledFor" DATETIME NOT NULL,
    "windowEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "driverName" TEXT,
    "driverPhone" TEXT,
    "etaMinutes" INTEGER,
    "note" TEXT,
    "driverConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_foodBankId_fkey" FOREIGN KEY ("foodBankId") REFERENCES "FoodBank" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" ("createdAt", "direction", "driverName", "driverPhone", "etaMinutes", "foodBankId", "id", "note", "scheduledFor", "sourceName", "sourceType", "status", "updatedAt", "windowEnd") SELECT "createdAt", "direction", "driverName", "driverPhone", "etaMinutes", "foodBankId", "id", "note", "scheduledFor", "sourceName", "sourceType", "status", "updatedAt", "windowEnd" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_foodBankId_scheduledFor_idx" ON "Shipment"("foodBankId", "scheduledFor");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_token_key" ON "CheckIn"("token");

-- CreateIndex
CREATE INDEX "CheckIn_shipmentId_requestedAt_idx" ON "CheckIn"("shipmentId", "requestedAt");
