-- CreateEnum
CREATE TYPE "ItemState" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ItemVisibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('picture', 'video', 'audio', 'drawing', 'article', 'interview', 'document', 'other');

-- CreateEnum
CREATE TYPE "DateKind" AS ENUM ('unknown', 'single', 'range');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('day', 'month', 'year', 'decade');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "kobId" TEXT,
    "state" "ItemState" NOT NULL DEFAULT 'active',
    "visibility" "ItemVisibility" NOT NULL DEFAULT 'private',
    "version" INTEGER NOT NULL DEFAULT 1,
    "workingRevisionId" TEXT,
    "publishedRevisionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRevision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "types" "ItemType"[],
    "dateKind" "DateKind" NOT NULL DEFAULT 'unknown',
    "dateStart" DATE,
    "dateEnd" DATE,
    "datePrecision" "DatePrecision",
    "dateApproximate" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "otherNames" TEXT[],
    "familyOnly" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "otherNames" TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRevisionPerson" (
    "revisionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "ItemRevisionPerson_pkey" PRIMARY KEY ("revisionId","personId")
);

-- CreateTable
CREATE TABLE "ItemRevisionPlace" (
    "revisionId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "ItemRevisionPlace_pkey" PRIMARY KEY ("revisionId","placeId")
);

-- CreateTable
CREATE TABLE "EditorialAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_kobId_key" ON "Item"("kobId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_workingRevisionId_key" ON "Item"("workingRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_publishedRevisionId_key" ON "Item"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "Item_state_visibility_idx" ON "Item"("state", "visibility");

-- CreateIndex
CREATE INDEX "ItemRevision_itemId_idx" ON "ItemRevision"("itemId");

-- CreateIndex
CREATE INDEX "ItemRevisionPerson_personId_idx" ON "ItemRevisionPerson"("personId");

-- CreateIndex
CREATE INDEX "ItemRevisionPlace_placeId_idx" ON "ItemRevisionPlace"("placeId");

-- CreateIndex
CREATE INDEX "EditorialAudit_targetId_idx" ON "EditorialAudit"("targetId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_workingRevisionId_fkey" FOREIGN KEY ("workingRevisionId") REFERENCES "ItemRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "ItemRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevision" ADD CONSTRAINT "ItemRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevisionPerson" ADD CONSTRAINT "ItemRevisionPerson_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ItemRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevisionPerson" ADD CONSTRAINT "ItemRevisionPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevisionPlace" ADD CONSTRAINT "ItemRevisionPlace_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ItemRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevisionPlace" ADD CONSTRAINT "ItemRevisionPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

