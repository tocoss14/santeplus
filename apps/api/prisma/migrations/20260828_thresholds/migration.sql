-- Add per-product and per-act thresholds for prior authorization
ALTER TABLE "Product" ADD COLUMN "thirdPartyAuthThreshold" INTEGER;
ALTER TABLE "Act" ADD COLUMN "authThreshold" INTEGER;

