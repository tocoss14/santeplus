-- Flexible formula system: guarantee-level pricing
-- Guarantee basePrice
ALTER TABLE "Guarantee" ADD COLUMN "basePrice" INTEGER NOT NULL DEFAULT 0;

-- ProductGuarantee: flexible rate/limit ranges + pricing
ALTER TABLE "ProductGuarantee" ADD COLUMN "minRate" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ProductGuarantee" ADD COLUMN "maxRate" INTEGER NOT NULL DEFAULT 95;
ALTER TABLE "ProductGuarantee" ADD COLUMN "minLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductGuarantee" ADD COLUMN "maxLimit" INTEGER NOT NULL DEFAULT 10000000;
ALTER TABLE "ProductGuarantee" ADD COLUMN "limitStep" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "ProductGuarantee" ADD COLUMN "pricePerLimitStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductGuarantee" ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProductGuarantee" ADD COLUMN "customizable" BOOLEAN NOT NULL DEFAULT false;
-- rate column: allow null for customizable guarantees
ALTER TABLE "ProductGuarantee" ALTER COLUMN "rate" DROP NOT NULL;
