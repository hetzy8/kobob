-- CreateEnum
CREATE TYPE "ItemOrigin" AS ENUM ('family', 'internet');

-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('unknown', 'needs_clarification', 'cleared');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('needs_review', 'reviewed');

-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('original', 'thumbnail', 'display');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'verified', 'failed');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "origin" "ItemOrigin" NOT NULL DEFAULT 'family',
ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'reviewed',
ADD COLUMN     "rightsStatus" "RightsStatus" NOT NULL DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "ExternalSource" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "publishedText" TEXT NOT NULL DEFAULT '',
    "license" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExternalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "role" "MediaRole" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'pending',
    "failureCode" TEXT,
    "originalFilename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCatalogRecord" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "row" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCatalogRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalSource_itemId_idx" ON "ExternalSource"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_storageKey_key" ON "MediaFile"("storageKey");

-- CreateIndex
CREATE INDEX "MediaFile_status_idx" ON "MediaFile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_itemId_role_key" ON "MediaFile"("itemId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCatalogRecord_itemId_key" ON "ItemCatalogRecord"("itemId");

-- CreateIndex
CREATE INDEX "Item_state_reviewStatus_idx" ON "Item"("state", "reviewStatus");

-- AddForeignKey
ALTER TABLE "ExternalSource" ADD CONSTRAINT "ExternalSource_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCatalogRecord" ADD CONSTRAINT "ItemCatalogRecord_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
