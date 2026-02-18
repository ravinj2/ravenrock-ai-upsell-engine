/*
  Warnings:

  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `Settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `aiCallsThisMonth` on the `Settings` table. All the data in the column will be lost.
  - You are about to drop the column `aiUsageMonth` on the `Settings` table. All the data in the column will be lost.
  - You are about to drop the column `limit` on the `Settings` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `Settings` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to drop the column `meta` on the `WidgetEvent` table. All the data in the column will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Session";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "upsellMode" TEXT NOT NULL DEFAULT 'collection',
    "manualVariantIds" TEXT NOT NULL DEFAULT '',
    "fallbackVariantIds" TEXT NOT NULL DEFAULT '',
    "maxRecommendations" INTEGER NOT NULL DEFAULT 3,
    "excludeGiftCards" BOOLEAN NOT NULL DEFAULT true,
    "excludeOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "redirectToCart" BOOLEAN NOT NULL DEFAULT true,
    "widgetLocale" TEXT NOT NULL DEFAULT 'auto',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiMonthlyLimit" INTEGER NOT NULL DEFAULT 1000,
    "aiUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "aiResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiFallbackMode" TEXT NOT NULL DEFAULT 'collection',
    "aiMessageText" TEXT NOT NULL DEFAULT 'Based on your browsing, we think you''ll love these',
    "fallbackMessageText" TEXT NOT NULL DEFAULT 'You might also like',
    "triggerType" TEXT NOT NULL DEFAULT 'time',
    "triggerDelaySec" INTEGER NOT NULL DEFAULT 20,
    "autoOpen" BOOLEAN NOT NULL DEFAULT true,
    "upsellDelaySec" INTEGER NOT NULL DEFAULT 2,
    "frequencyHours" INTEGER NOT NULL DEFAULT 24
);
INSERT INTO "new_Settings" ("aiEnabled", "aiFallbackMode", "aiMessageText", "aiMonthlyLimit", "createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackMessageText", "fallbackVariantIds", "id", "manualVariantIds", "redirectToCart", "shop", "updatedAt", "upsellMode", "widgetLocale") SELECT "aiEnabled", "aiFallbackMode", "aiMessageText", "aiMonthlyLimit", "createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackMessageText", "fallbackVariantIds", "id", "manualVariantIds", "redirectToCart", "shop", "updatedAt", "upsellMode", coalesce("widgetLocale", 'auto') AS "widgetLocale" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
CREATE TABLE "new_WidgetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shop" TEXT NOT NULL,
    "sessionId" TEXT,
    "path" TEXT,
    "type" TEXT NOT NULL,
    "productHandle" TEXT,
    "currentVariant" TEXT,
    "upsellVariant" TEXT,
    "count" INTEGER,
    "trigger" TEXT,
    "analyticsAllowed" BOOLEAN
);
INSERT INTO "new_WidgetEvent" ("analyticsAllowed", "count", "createdAt", "currentVariant", "id", "path", "productHandle", "sessionId", "shop", "trigger", "type", "upsellVariant") SELECT "analyticsAllowed", "count", "createdAt", "currentVariant", "id", "path", "productHandle", "sessionId", "shop", "trigger", "type", "upsellVariant" FROM "WidgetEvent";
DROP TABLE "WidgetEvent";
ALTER TABLE "new_WidgetEvent" RENAME TO "WidgetEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
