-- Fonds de solidarité mutualiste : journal des mouvements + part de solidarité
-- sur les clôtures. Les excédents alimentent le fonds, qui couvre les
-- déficits des contrats en difficulté (au lieu de les facturer aux malades).

CREATE TABLE IF NOT EXISTS "SolidarityMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "contractId" TEXT,
  "reference" TEXT,
  "meta" TEXT NOT NULL DEFAULT '{}',
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SolidarityMovement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SolidarityMovement_kind_idx" ON "SolidarityMovement"("kind");
CREATE INDEX IF NOT EXISTS "SolidarityMovement_contractId_idx" ON "SolidarityMovement"("contractId");

ALTER TABLE "ContractClosure" ADD COLUMN IF NOT EXISTS "solidarityShare" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ContractClosure" ADD COLUMN IF NOT EXISTS "solidarityContribution" INTEGER NOT NULL DEFAULT 0;
