-- Choix du modèle de gestion du risque par contrat : MUTUALITE (défaut,
-- solidaire) ou INDIVIDUEL (auto-assuré, sortie de mutualité après 24 mois).
-- Le Fonds de solidarité reste unique : alimenté et utilisé uniquement par
-- les contrats en MUTUALITE.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "riskModel" TEXT NOT NULL DEFAULT 'MUTUALITE';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "riskModelSince" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "riskModelChangedAt" TIMESTAMP(3);

-- Les contrats existants sont réputés en MUTUALITE depuis leur création.
UPDATE "Contract" SET "riskModelSince" = "createdAt" WHERE "riskModelSince" IS NULL;

ALTER TABLE "SolidarityMovement" ADD COLUMN IF NOT EXISTS "riskModel" TEXT;
UPDATE "SolidarityMovement" sm
SET "riskModel" = c."riskModel"
FROM "Contract" c
WHERE sm."contractId" = c."id" AND sm."riskModel" IS NULL;
