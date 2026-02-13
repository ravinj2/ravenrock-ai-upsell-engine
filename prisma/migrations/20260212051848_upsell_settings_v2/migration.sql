/*
  Warnings:

  - You are about to drop the column `variantIds` on the `UpsellSettings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UpsellSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "upsellMode" TEXT NOT NULL DEFAULT 'collection',
    "manualVariantIds" TEXT NOT NULL DEFAULT '',
    "fallbackVariantIds" TEXT NOT NULL DEFAULT '',
    "limit" INTEGER NOT NULL DEFAULT 3,
    "excludeGiftCards" BOOLEAN NOT NULL DEFAULT true,
    "excludeOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UpsellSettings" ("createdAt", "id", "shop", "updatedAt", "upsellMode") SELECT "createdAt", "id", "shop", "updatedAt", "upsellMode" FROM "UpsellSettings";
DROP TABLE "UpsellSettings";
ALTER TABLE "new_UpsellSettings" RENAME TO "UpsellSettings";
CREATE UNIQUE INDEX "UpsellSettings_shop_key" ON "UpsellSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
