-- Provider public registration fields
ALTER TABLE "Provider" ADD COLUMN "registrationStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Provider" ADD COLUMN "registrationNote" TEXT;
ALTER TABLE "Provider" ADD COLUMN "contactFirstName" TEXT;
ALTER TABLE "Provider" ADD COLUMN "contactLastName" TEXT;
ALTER TABLE "Provider" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Provider" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Provider" ADD COLUMN "registrationDocs" TEXT NOT NULL DEFAULT '[]';
