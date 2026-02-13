-- CreateTable
CREATE TABLE "UpsellSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "upsellMode" TEXT NOT NULL DEFAULT 'collection',
    "variantIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UpsellSettings_shop_key" ON "UpsellSettings"("shop");
