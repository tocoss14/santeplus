-- Facturation tiers-payant avancée : factures groupées, rejets, avoirs et réconciliations.
-- Idempotent : IF NOT EXISTS / DO block, réapplicable sans risque sur prod et CI.

-- CreateTable BatchInvoice
CREATE TABLE IF NOT EXISTS "BatchInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "totalApproved" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable BatchInvoiceItem
CREATE TABLE IF NOT EXISTS "BatchInvoiceItem" (
    "id" TEXT NOT NULL,
    "batchInvoiceId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "claimItemId" TEXT,
    "actId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "amountRequested" INTEGER NOT NULL,
    "amountApproved" INTEGER NOT NULL DEFAULT 0,
    "amountRejected" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable Rejection
CREATE TABLE IF NOT EXISTS "Rejection" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batchInvoiceId" TEXT NOT NULL,
    "batchInvoiceItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "disputedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rejection_pkey" PRIMARY KEY ("id")
);

-- CreateTable CreditNote
CREATE TABLE IF NOT EXISTS "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "batchInvoiceId" TEXT,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable Reconciliation
CREATE TABLE IF NOT EXISTS "Reconciliation" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expectedAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "notes" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "BatchInvoice_number_key" ON "BatchInvoice"("number");
CREATE INDEX IF NOT EXISTS "BatchInvoice_providerId_status_idx" ON "BatchInvoice"("providerId", "status");
CREATE INDEX IF NOT EXISTS "BatchInvoice_periodStart_periodEnd_idx" ON "BatchInvoice"("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "BatchInvoiceItem_batchInvoiceId_idx" ON "BatchInvoiceItem"("batchInvoiceId");
CREATE INDEX IF NOT EXISTS "BatchInvoiceItem_claimId_idx" ON "BatchInvoiceItem"("claimId");
CREATE INDEX IF NOT EXISTS "BatchInvoiceItem_status_idx" ON "BatchInvoiceItem"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Rejection_code_key" ON "Rejection"("code");
CREATE INDEX IF NOT EXISTS "Rejection_batchInvoiceId_idx" ON "Rejection"("batchInvoiceId");
CREATE INDEX IF NOT EXISTS "Rejection_status_idx" ON "Rejection"("status");
CREATE INDEX IF NOT EXISTS "Rejection_type_idx" ON "Rejection"("type");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_number_key" ON "CreditNote"("number");
CREATE INDEX IF NOT EXISTS "CreditNote_providerId_idx" ON "CreditNote"("providerId");
CREATE INDEX IF NOT EXISTS "CreditNote_batchInvoiceId_idx" ON "CreditNote"("batchInvoiceId");
CREATE INDEX IF NOT EXISTS "CreditNote_status_idx" ON "CreditNote"("status");
CREATE INDEX IF NOT EXISTS "Reconciliation_providerId_idx" ON "Reconciliation"("providerId");
CREATE INDEX IF NOT EXISTS "Reconciliation_status_idx" ON "Reconciliation"("status");
CREATE INDEX IF NOT EXISTS "Reconciliation_periodStart_periodEnd_idx" ON "Reconciliation"("periodStart", "periodEnd");

-- AddForeignKey (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE "BatchInvoice" ADD CONSTRAINT "BatchInvoice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BatchInvoiceItem" ADD CONSTRAINT "BatchInvoiceItem_batchInvoiceId_fkey" FOREIGN KEY ("batchInvoiceId") REFERENCES "BatchInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BatchInvoiceItem" ADD CONSTRAINT "BatchInvoiceItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Rejection" ADD CONSTRAINT "Rejection_batchInvoiceId_fkey" FOREIGN KEY ("batchInvoiceId") REFERENCES "BatchInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Rejection" ADD CONSTRAINT "Rejection_batchInvoiceItemId_fkey" FOREIGN KEY ("batchInvoiceItemId") REFERENCES "BatchInvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_batchInvoiceId_fkey" FOREIGN KEY ("batchInvoiceId") REFERENCES "BatchInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
