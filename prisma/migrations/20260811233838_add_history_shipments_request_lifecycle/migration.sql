-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "deletedAt" DATETIME;

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "foodBankId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantityBefore" REAL,
    "quantityAfter" REAL,
    "changes" TEXT,
    "note" TEXT,
    "actorBankId" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_foodBankId_fkey" FOREIGN KEY ("foodBankId") REFERENCES "FoodBank" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "expiryDate" DATETIME,
    CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBankId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minQuantity" REAL NOT NULL,
    CONSTRAINT "ParLevel_foodBankId_fkey" FOREIGN KEY ("foodBankId") REFERENCES "FoodBank" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "actorBankId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flagId" TEXT NOT NULL,
    "requesterBankId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "agreedQuantity" REAL,
    "finalQuantity" REAL,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Request_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "Flag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("createdAt", "finalQuantity", "flagId", "id", "requesterBankId", "status") SELECT "createdAt", "finalQuantity", "flagId", "id", "requesterBankId", "status" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InventoryEvent_itemId_createdAt_idx" ON "InventoryEvent"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_foodBankId_createdAt_idx" ON "InventoryEvent"("foodBankId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_foodBankId_scheduledFor_idx" ON "Shipment"("foodBankId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ParLevel_foodBankId_name_unit_key" ON "ParLevel"("foodBankId", "name", "unit");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_foodBankId_deletedAt_idx" ON "InventoryItem"("foodBankId", "deletedAt");
