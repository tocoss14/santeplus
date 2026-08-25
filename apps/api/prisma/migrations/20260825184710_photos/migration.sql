-- AlterTable User
ALTER TABLE "User" ADD COLUMN "photoFileId" TEXT;

-- AlterTable Beneficiary
ALTER TABLE "Beneficiary" ADD COLUMN "photoFileId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "FileObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "FileObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;