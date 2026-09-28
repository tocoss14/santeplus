-- Modèles financiers versionnés : V1_LEGACY gelé (ARCHIVÉ, READ ONLY) et
-- V2_MUTUAL mutualiste (cible des nouveaux contrats). Migration 100 % additive
-- et idempotente : aucune table, colonne ou règle V1 n'est supprimée ni
-- modifiée ; les écritures historiques ne sont ni recalculées ni réétiquetées.

CREATE TABLE IF NOT EXISTS "FinancialModelVersion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "engineVersion" TEXT NOT NULL DEFAULT 'V1',
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialModelVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialModelVersion_code_key" ON "FinancialModelVersion"("code");

-- État initial conforme à la règle « V1 gelé, V2 cible » :
--   V1_LEGACY → ARCHIVÉ (READ_ONLY, historique intouchable) ;
--   V2_MUTUAL → ACTIVE (modèle par défaut des nouveaux contrats).
INSERT INTO "FinancialModelVersion" ("id", "code", "label", "status", "engineVersion", "activatedAt", "archivedAt", "updatedAt")
SELECT 'fmv_v1_legacy', 'V1_LEGACY', 'V1 — Legacy (historique gelé)', 'ARCHIVED', 'V1', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "FinancialModelVersion" WHERE "code" = 'V1_LEGACY');

INSERT INTO "FinancialModelVersion" ("id", "code", "label", "status", "engineVersion", "activatedAt", "archivedAt", "updatedAt")
SELECT 'fmv_v2_mutual', 'V2_MUTUAL', 'V2 — Mutualiste (modèle cible)', 'ACTIVE', 'V2', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "FinancialModelVersion" WHERE "code" = 'V2_MUTUAL');

-- Rattachement des contrats : les existants restent en V1 tant qu'une
-- migration officielle n'a pas été décidée (jamais de conversion silencieuse).
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "financialModelVersionId" TEXT NOT NULL DEFAULT 'fmv_v1_legacy';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "migrationStatus" TEXT;
UPDATE "Contract" SET "financialModelVersionId" = 'fmv_v1_legacy'
WHERE "financialModelVersionId" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_financialModelVersionId_idx" ON "Contract"("financialModelVersionId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contract_financialModelVersionId_fkey') THEN
    ALTER TABLE "Contract" ADD CONSTRAINT "Contract_financialModelVersionId_fkey"
      FOREIGN KEY ("financialModelVersionId") REFERENCES "FinancialModelVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Migrations contrôlées ANALYSIS → … → CERTIFICATION (volontaires, tracées).
CREATE TABLE IF NOT EXISTS "FinancialModelMigration" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ANALYSIS',
    "analysis" TEXT,
    "snapshot" TEXT,
    "verification" TEXT,
    "createdBy" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialModelMigration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinancialModelMigration_contractId_idx" ON "FinancialModelMigration"("contractId");
CREATE INDEX IF NOT EXISTS "FinancialModelMigration_status_idx" ON "FinancialModelMigration"("status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialModelMigration_contractId_fkey') THEN
    ALTER TABLE "FinancialModelMigration" ADD CONSTRAINT "FinancialModelMigration_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialModelMigration_fromVersionId_fkey') THEN
    ALTER TABLE "FinancialModelMigration" ADD CONSTRAINT "FinancialModelMigration_fromVersionId_fkey"
      FOREIGN KEY ("fromVersionId") REFERENCES "FinancialModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialModelMigration_toVersionId_fkey') THEN
    ALTER TABLE "FinancialModelMigration" ADD CONSTRAINT "FinancialModelMigration_toVersionId_fkey"
      FOREIGN KEY ("toVersionId") REFERENCES "FinancialModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Journal financier : chaque écriture porte la version du modèle qui l'a
-- produite. Les écritures historiques restent sans valeur (passé V1 intact).
ALTER TABLE "AccountingEntry" ADD COLUMN IF NOT EXISTS "financialModelVersion" TEXT;
CREATE INDEX IF NOT EXISTS "AccountingEntry_financialModelVersion_idx" ON "AccountingEntry"("financialModelVersion");

-- Permission dédiée : archivage / réactivation / migration des modèles.
INSERT INTO "RolePermission" ("id", "role", "permissionKey")
SELECT 'INSURANCE_MANAGER:financial-model.admin', 'INSURANCE_MANAGER', 'financial-model.admin'
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" WHERE "role" = 'INSURANCE_MANAGER' AND "permissionKey" = 'financial-model.admin');

-- Les deux modèles sont connus même si le seed n'a pas tourné récemment.
INSERT INTO "SystemConfig" ("key", "value")
SELECT 'financial-models.seeded', 'true'
WHERE NOT EXISTS (SELECT 1 FROM "SystemConfig" WHERE "key" = 'financial-models.seeded');

-- Alerte hebdomadaire de solvabilité V2 : défauts découvrables via
-- /admin/config (activée, seuil 100 % de couverture des engagements).
INSERT INTO "SystemConfig" ("key", "value")
SELECT 'v2SolvencyAlert.enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM "SystemConfig" WHERE "key" = 'v2SolvencyAlert.enabled');
INSERT INTO "SystemConfig" ("key", "value")
SELECT 'v2SolvencyAlert.threshold', '1'
WHERE NOT EXISTS (SELECT 1 FROM "SystemConfig" WHERE "key" = 'v2SolvencyAlert.threshold');
