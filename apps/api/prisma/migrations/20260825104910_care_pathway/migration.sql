-- AlterTable Act
ALTER TABLE "Act" ADD COLUMN "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiresPriorAuth" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable Medication
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dci" TEXT,
    "dosage" TEXT,
    "form" TEXT,
    "price" INTEGER NOT NULL,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Medication_code_key" ON "Medication"("code");
CREATE INDEX "Medication_active_idx" ON "Medication"("active");

-- CreateTable Consultation
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "providerId" TEXT NOT NULL,
    "practitionerUserId" TEXT,
    "practitionerName" TEXT NOT NULL,
    "specialty" TEXT,
    "motif" TEXT NOT NULL,
    "diagnostic" TEXT,
    "careDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Consultation_reference_key" ON "Consultation"("reference");
CREATE INDEX "Consultation_patientUserId_idx" ON "Consultation"("patientUserId");
CREATE INDEX "Consultation_providerId_idx" ON "Consultation"("providerId");

-- CreateTable Prescription
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "patientUserId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "consultationId" TEXT,
    "providerId" TEXT NOT NULL,
    "prescriberUserId" TEXT NOT NULL,
    "prescriberName" TEXT NOT NULL,
    "specialty" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "renewalsAllowed" INTEGER NOT NULL DEFAULT 0,
    "renewalsUsed" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Prescription_number_key" ON "Prescription"("number");
CREATE UNIQUE INDEX "Prescription_qrToken_key" ON "Prescription"("qrToken");
CREATE INDEX "Prescription_patientUserId_idx" ON "Prescription"("patientUserId");
CREATE INDEX "Prescription_status_idx" ON "Prescription"("status");

-- CreateTable PrescriptionLine
CREATE TABLE "PrescriptionLine" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationId" TEXT,
    "actId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "posology" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrescriptionLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrescriptionLine_prescriptionId_idx" ON "PrescriptionLine"("prescriptionId");

-- CreateTable Delivery
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "coveredAmount" INTEGER NOT NULL,
    "patientAmount" INTEGER NOT NULL,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Delivery_reference_key" ON "Delivery"("reference");
CREATE INDEX "Delivery_prescriptionId_idx" ON "Delivery"("prescriptionId");
CREATE INDEX "Delivery_providerId_idx" ON "Delivery"("providerId");

-- CreateTable DeliveryLine
CREATE TABLE "DeliveryLine" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "lineId" TEXT,
    "medicationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "substitutionNote" TEXT,

    CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);

-- AlterTable Claim
ALTER TABLE "Claim" ADD COLUMN "prescriptionId" TEXT,
ADD COLUMN "deliveryId" TEXT;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescriberUserId_fkey" FOREIGN KEY ("prescriberUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrescriptionLine" ADD CONSTRAINT "PrescriptionLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionLine" ADD CONSTRAINT "PrescriptionLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PrescriptionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Claim" ADD CONSTRAINT "Claim_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;