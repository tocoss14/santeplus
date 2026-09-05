-- Create adhesion fee columns
ALTER TABLE "Contract" ADD COLUMN "adhesionFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contract" ADD COLUMN "adhesionPaidAt" TIMESTAMP(3);
