-- CreateTable
CREATE TABLE "WidgetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sessionId" TEXT,
    "path" TEXT,
    "productHandle" TEXT,
    "currentVariant" TEXT,
    "upsellVariant" TEXT,
    "count" INTEGER,
    "trigger" TEXT,
    "analyticsAllowed" BOOLEAN,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WidgetEvent_shop_createdAt_idx" ON "WidgetEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "WidgetEvent_shop_type_createdAt_idx" ON "WidgetEvent"("shop", "type", "createdAt");
