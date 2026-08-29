-- Add encrypted columns for medical data (dual-write with plain columns)
ALTER TABLE "Consultation" ADD COLUMN "motifEnc" TEXT;
ALTER TABLE "Consultation" ADD COLUMN "diagnosticEnc" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "noteEnc" TEXT;
