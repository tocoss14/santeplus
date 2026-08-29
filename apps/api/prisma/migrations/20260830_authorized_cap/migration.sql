-- Add authorizedAmount hard cap for invoicing
ALTER TABLE "Claim" ADD COLUMN "authorizedAmount" INTEGER;

