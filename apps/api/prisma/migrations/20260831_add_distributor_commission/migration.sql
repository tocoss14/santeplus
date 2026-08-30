-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentDistributorId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'AMBASSADOR',
    "territory" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "commissionRate" INTEGER NOT NULL DEFAULT 10,
    "renewalRate" INTEGER NOT NULL DEFAULT 3,
    "overrideRate" INTEGER NOT NULL DEFAULT 0,
    "totalRecruited" INTEGER NOT NULL DEFAULT 0,
    "totalPremiumGenerated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "contractId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "baseAmount" INTEGER NOT NULL,
    "rate" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "period" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceBonus" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "bonusAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_userId_key" ON "Distributor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_referralCode_key" ON "Distributor"("referralCode");

-- CreateIndex
CREATE INDEX "Distributor_referralCode_idx" ON "Distributor"("referralCode");

-- CreateIndex
CREATE INDEX "Distributor_level_idx" ON "Distributor"("level");

-- CreateIndex
CREATE INDEX "Distributor_status_idx" ON "Distributor"("status");

-- CreateIndex
CREATE INDEX "Commission_distributorId_status_idx" ON "Commission"("distributorId", "status");

-- CreateIndex
CREATE INDEX "Commission_type_status_idx" ON "Commission"("type", "status");

-- CreateIndex
CREATE INDEX "Commission_period_idx" ON "Commission"("period");

-- CreateIndex
CREATE INDEX "PerformanceBonus_distributorId_period_idx" ON "PerformanceBonus"("distributorId", "period");

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_parentDistributorId_fkey" FOREIGN KEY ("parentDistributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceBonus" ADD CONSTRAINT "PerformanceBonus_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumns to User
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddColumns to Contract
ALTER TABLE "Contract" ADD COLUMN "distributorId" TEXT;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
