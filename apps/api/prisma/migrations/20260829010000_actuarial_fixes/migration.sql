-- Actuarial corrections for technical result viability
-- 1. Add age-based loading to Product
ALTER TABLE "Product" ADD COLUMN "ageLoadings" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "globalAnnualCap" INTEGER NOT NULL DEFAULT 5000000;

-- 2. Add copay and fee schedule control to ProductGuarantee
ALTER TABLE "ProductGuarantee" ADD COLUMN "copayRate" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "ProductGuarantee" ADD COLUMN "maxUnitPrice" INTEGER;

-- 3. Fix default frequency factors (monthly 1.06 → 1.08)
UPDATE "Product" SET "frequencyFactors" = '{"ANNUAL":1,"QUARTERLY":1.03,"MONTHLY":1.08}' WHERE "frequencyFactors" = '{"ANNUAL":1,"QUARTERLY":1.03,"MONTHLY":1.06}';

-- 4. Fix default waiting period (0 → 30 days)
UPDATE "Product" SET "waitingPeriodDays" = 30 WHERE "waitingPeriodDays" = 0;
