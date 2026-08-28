-- Add emergency override columns to Claim
ALTER TABLE "Claim" ADD COLUMN "emergencyOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Claim" ADD COLUMN "emergencyJustification" TEXT;
ALTER TABLE "Claim" ADD COLUMN "emergencyActorId" TEXT;
ALTER TABLE "Claim" ADD COLUMN "emergencyAt" TIMESTAMP(3);

