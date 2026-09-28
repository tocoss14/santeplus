-- Historisation hebdomadaire de la marge de solvabilité du portefeuille V2.
-- Un point par semaine ISO (clé unique) écrit par le job d'alerte, même sans
-- breach : le graphique admin survit aux reconstructions de données et remonte
-- sur plusieurs années. Additif pur — aucune table ou colonne V1 touchée.

CREATE TABLE IF NOT EXISTS "V2SolvencySnapshot" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "solvencyRatio" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "breach" BOOLEAN NOT NULL DEFAULT false,
    "contractsCount" INTEGER NOT NULL DEFAULT 0,
    "contributions" INTEGER NOT NULL DEFAULT 0,
    "engagedClaims" INTEGER NOT NULL DEFAULT 0,
    "paidClaims" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V2SolvencySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "V2SolvencySnapshot_weekKey_key" ON "V2SolvencySnapshot"("weekKey");
CREATE INDEX IF NOT EXISTS "V2SolvencySnapshot_weekStart_idx" ON "V2SolvencySnapshot"("weekStart");
