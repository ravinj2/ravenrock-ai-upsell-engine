/*
  Warnings:

  - You are about to drop the `UpsellSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "UpsellSettings_shop_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UpsellSettings";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "upsellMode" TEXT NOT NULL DEFAULT 'collection',
    "manualVariantIds" TEXT NOT NULL DEFAULT '',
    "fallbackVariantIds" TEXT NOT NULL DEFAULT '',
    "limit" INTEGER NOT NULL DEFAULT 3,
    "excludeGiftCards" BOOLEAN NOT NULL DEFAULT false,
    "excludeOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "redirectToCart" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackVariantIds", "id", "limit", "manualVariantIds", "shop", "updatedAt", "upsellMode") SELECT "createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackVariantIds", "id", "limit", "manualVariantIds", "shop", "updatedAt", "upsellMode" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
