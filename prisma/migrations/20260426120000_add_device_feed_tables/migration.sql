-- Fair feed + category affinity (Fuddy): tables referenced by findAllFair / recordDwellEvents

-- CreateTable
CREATE TABLE "DeviceCardImpression" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "lastShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCardImpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCategoryAffinity" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCategoryAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCardImpression_deviceId_lastShownAt_idx" ON "DeviceCardImpression"("deviceId", "lastShownAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCardImpression_deviceId_cardId_key" ON "DeviceCardImpression"("deviceId", "cardId");

-- CreateIndex
CREATE INDEX "DeviceCategoryAffinity_deviceId_idx" ON "DeviceCategoryAffinity"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCategoryAffinity_deviceId_category_key" ON "DeviceCategoryAffinity"("deviceId", "category");

-- AddForeignKey
ALTER TABLE "DeviceCardImpression" ADD CONSTRAINT "DeviceCardImpression_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
