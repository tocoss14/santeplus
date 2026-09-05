-- Sync comptabilite OHADA + referentiels + GED/RGPD (objets crees via db push en prod)
-- Idempotent : IF NOT EXISTS / DO block, reapplicable sans risque sur prod et CI

-- CreateTable Account
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable Journal
CREATE TABLE IF NOT EXISTS "Journal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable AccountingEntry
CREATE TABLE IF NOT EXISTS "AccountingEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable Branch
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable Disease
CREATE TABLE IF NOT EXISTS "Disease" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Disease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "Account_code_key" ON "Account"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Journal_code_key" ON "Journal"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_code_key" ON "Branch"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Disease_code_key" ON "Disease"("code");
CREATE INDEX IF NOT EXISTS "AccountingEntry_journalId_idx" ON "AccountingEntry"("journalId");
CREATE INDEX IF NOT EXISTS "AccountingEntry_accountId_idx" ON "AccountingEntry"("accountId");
CREATE INDEX IF NOT EXISTS "AccountingEntry_date_idx" ON "AccountingEntry"("date");
CREATE INDEX IF NOT EXISTS "AccountingEntry_referenceType_referenceId_idx" ON "AccountingEntry"("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "AccountingEntry_period_idx" ON "AccountingEntry"("period");

-- AddForeignKey (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable : nouvelles colonnes (idempotent)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "diseaseId" TEXT;
ALTER TABLE "Act" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "FileObject" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "FileObject" ADD COLUMN IF NOT EXISTS "tags" TEXT;
ALTER TABLE "FileObject" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FileObject" ADD COLUMN IF NOT EXISTS "previousVersionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentGivenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentIp" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

-- AddForeignKey colonnes (idempotent)
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Claim" ADD CONSTRAINT "Claim_diseaseId_fkey" FOREIGN KEY ("diseaseId") REFERENCES "Disease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Act" ADD CONSTRAINT "Act_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
