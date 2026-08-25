-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3),
ADD COLUMN     "realizationNote" TEXT;

-- AlterTable
ALTER TABLE "ClaimItem" ADD COLUMN     "actId" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "practitioner" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "unitPrice" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "referencePrice" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Act_code_key" ON "Act"("code");

-- CreateIndex
CREATE INDEX "Act_categoryId_idx" ON "Act"("categoryId");

-- CreateIndex
CREATE INDEX "Act_active_idx" ON "Act"("active");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

