-- Suppression définitive des franchises produit : normaliser puis retirer les colonnes.
-- Le moteur de remboursement ignore déjà ces champs ; cette migration évite
-- toute configuration future ou existante incohérente avec le calcul réel.

UPDATE "ProductGuarantee"
SET "deductibleType" = 'NONE', "deductibleValue" = 0
WHERE "deductibleType" IS DISTINCT FROM 'NONE' OR "deductibleValue" IS DISTINCT FROM 0;

ALTER TABLE "ProductGuarantee"
  DROP COLUMN IF EXISTS "deductibleType",
  DROP COLUMN IF EXISTS "deductibleValue";
