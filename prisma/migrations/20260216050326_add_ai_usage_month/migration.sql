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
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiMonthlyLimit" INTEGER NOT NULL DEFAULT 1000,
    "aiCallsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "aiUsageMonth" TEXT NOT NULL DEFAULT '',
    "aiFallbackMode" TEXT NOT NULL DEFAULT 'collection',
    "aiMessageText" TEXT NOT NULL DEFAULT 'Based on your browsing, we think you''ll love these',
    "fallbackMessageText" TEXT NOT NULL DEFAULT 'You might also like',
    "widgetLocale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("aiCallsThisMonth", "aiEnabled", "aiFallbackMode", "aiMessageText", "aiMonthlyLimit", "createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackMessageText", "fallbackVariantIds", "id", "limit", "manualVariantIds", "redirectToCart", "shop", "updatedAt", "upsellMode") SELECT "aiCallsThisMonth", "aiEnabled", "aiFallbackMode", "aiMessageText", "aiMonthlyLimit", "createdAt", "excludeGiftCards", "excludeOutOfStock", "fallbackMessageText", "fallbackVariantIds", "id", "limit", "manualVariantIds", "redirectToCart", "shop", "updatedAt", "upsellMode" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
