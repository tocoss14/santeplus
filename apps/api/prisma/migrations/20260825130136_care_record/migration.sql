-- CreateTable CareRecord
CREATE TABLE "CareRecord" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "providerId" TEXT,
    "consultationId" TEXT,
    "prescriptionId" TEXT,
    "deliveryId" TEXT,
    "claimId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareRecord_reference_key" ON "CareRecord"("reference");
CREATE UNIQUE INDEX "CareRecord_consultationId_key" ON "CareRecord"("consultationId");
CREATE UNIQUE INDEX "CareRecord_prescriptionId_key" ON "CareRecord"("prescriptionId");
CREATE UNIQUE INDEX "CareRecord_deliveryId_key" ON "CareRecord"("deliveryId");
CREATE UNIQUE INDEX "CareRecord_claimId_key" ON "CareRecord"("claimId");
CREATE INDEX "CareRecord_patientUserId_idx" ON "CareRecord"("patientUserId");
CREATE INDEX "CareRecord_providerId_idx" ON "CareRecord"("providerId");
CREATE INDEX "CareRecord_status_idx" ON "CareRecord"("status");

-- CreateTable CareRecordEvent
CREATE TABLE "CareRecordEvent" (
    "id" TEXT NOT NULL,
    "careRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareRecordEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CareRecordEvent_careRecordId_idx" ON "CareRecordEvent"("careRecordId");
CREATE INDEX "CareRecordEvent_type_idx" ON "CareRecordEvent"("type");

-- AddForeignKey
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecordEvent" ADD CONSTRAINT "CareRecordEvent_careRecordId_fkey" FOREIGN KEY ("careRecordId") REFERENCES "CareRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;