-- AlterTable: Ajouter les colonnes de sécurité
ALTER TABLE "User" ADD COLUMN "isEstablishmentAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Provider" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
