-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "upsellMode" TEXT NOT NULL DEFAULT 'collection',
    "manualVariantIds" TEXT NOT NULL DEFAULT '',
    "fallbackVariantIds" TEXT NOT NULL DEFAULT '',
    "limit" INTEGER NOT NULL DEFAULT 3,
    "excludeGiftCards" BOOLEAN NOT NULL DEFAULT false,
    "excludeOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
