-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "useCase" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "duration" INTEGER,
    "aspectRatio" TEXT,
    "seed" INTEGER,
    "status" TEXT NOT NULL,
    "providerJobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "progress" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resultAssetId" TEXT,
    CONSTRAINT "Job_resultAssetId_fkey" FOREIGN KEY ("resultAssetId") REFERENCES "AssetReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_resultAssetId_key" ON "Job"("resultAssetId");
