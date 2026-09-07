-- CTS core : config produit/contrat + TechnicalAccount + CtsJournal + FundCall + CtsAlert + ContractClosure + FraudCase
-- Idempotent : IF NOT EXISTS / DO block, reapplicable sans risque sur prod et CI

-- AlterTable Product : config CTS JSON
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ctsConfig" TEXT NOT NULL DEFAULT '{}';

-- AlterTable ProductGuarantee : plafond foyer
ALTER TABLE "ProductGuarantee" ADD COLUMN IF NOT EXISTS "familyLimit" INTEGER;

-- AlterTable Contract : surcharges CTS
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "ctsOverride" TEXT;

-- CreateTable TechnicalAccount
CREATE TABLE IF NOT EXISTS "TechnicalAccount" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "primeSubscribed" INTEGER NOT NULL DEFAULT 0,
    "primeBilled" INTEGER NOT NULL DEFAULT 0,
    "primeCollected" INTEGER NOT NULL DEFAULT 0,
    "primeUnpaid" INTEGER NOT NULL DEFAULT 0,
    "managementFees" INTEGER NOT NULL DEFAULT 0,
    "benefitBudget" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "committed" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "consumptionRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provisionalResult" INTEGER NOT NULL DEFAULT 0,
    "fundCallsTotal" INTEGER NOT NULL DEFAULT 0,
    "renewalCredit" INTEGER NOT NULL DEFAULT 0,
    "deficit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TechnicalAccount_contractId_key" ON "TechnicalAccount"("contractId");

-- CreateTable CtsJournal
CREATE TABLE IF NOT EXISTS "CtsJournal" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "providerId" TEXT,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "oldBalance" INTEGER NOT NULL,
    "newBalance" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtsJournal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CtsJournal_contractId_idx" ON "CtsJournal"("contractId");
CREATE INDEX IF NOT EXISTS "CtsJournal_type_idx" ON "CtsJournal"("type");

-- CreateTable FundCall
CREATE TABLE IF NOT EXISTS "FundCall" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "targetAmount" INTEGER NOT NULL,
    "minimum" INTEGER NOT NULL DEFAULT 0,
    "recommended" INTEGER NOT NULL DEFAULT 0,
    "chosenAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "paymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FundCall_contractId_idx" ON "FundCall"("contractId");
CREATE INDEX IF NOT EXISTS "FundCall_status_idx" ON "FundCall"("status");

-- CreateTable CtsAlert
CREATE TABLE IF NOT EXISTS "CtsAlert" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CtsAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CtsAlert_contractId_idx" ON "CtsAlert"("contractId");
CREATE INDEX IF NOT EXISTS "CtsAlert_status_idx" ON "CtsAlert"("status");

-- CreateTable ContractClosure
CREATE TABLE IF NOT EXISTS "ContractClosure" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "finalConsumed" INTEGER NOT NULL DEFAULT 0,
    "finalCommitted" INTEGER NOT NULL DEFAULT 0,
    "surplus" INTEGER NOT NULL DEFAULT 0,
    "carryRate" INTEGER NOT NULL DEFAULT 70,
    "renewalCredit" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'DEDUCT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractClosure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContractClosure_contractId_key" ON "ContractClosure"("contractId");
CREATE INDEX IF NOT EXISTS "ContractClosure_status_idx" ON "ContractClosure"("status");

-- CreateTable FraudCase
CREATE TABLE IF NOT EXISTS "FraudCase" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "providerId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "linkedAuditIds" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FraudCase_status_idx" ON "FraudCase"("status");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "TechnicalAccount" ADD CONSTRAINT "TechnicalAccount_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CtsJournal" ADD CONSTRAINT "CtsJournal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FundCall" ADD CONSTRAINT "FundCall_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CtsAlert" ADD CONSTRAINT "CtsAlert_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ContractClosure" ADD CONSTRAINT "ContractClosure_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FraudCase" ADD CONSTRAINT "FraudCase_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FraudCase" ADD CONSTRAINT "FraudCase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
