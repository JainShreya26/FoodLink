-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodBank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" REAL NOT NULL DEFAULT 0,
    "longitude" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_FoodBank" ("id", "name") SELECT "id", "name" FROM "FoodBank";
DROP TABLE "FoodBank";
ALTER TABLE "new_FoodBank" RENAME TO "FoodBank";
CREATE UNIQUE INDEX "FoodBank_name_key" ON "FoodBank"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
