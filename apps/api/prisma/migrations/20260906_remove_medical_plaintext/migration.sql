-- ═══════════════════════════════════════════════════════════════════════════
-- Sécurité : suppression des doublons EN CLAIR des champs médicaux.
-- Les colonnes chiffrées (motifEnc, diagnosticEnc, noteEnc) deviennent la
-- source de vérité. Le masquage applicatif (canAccessMedical) reste inchangé.
--
-- ⚠️ AVANT de déployer cette migration sur une base avec des données :
-- exécuter d'abord le backfill une seule fois :
--   cd apps/api && npx tsx scripts/backfill-medical-enc.ts
-- (chiffre motif/diagnostic/note dans les colonnes *Enc si elles sont vides)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Consultation" DROP COLUMN IF EXISTS "motif";
ALTER TABLE "Consultation" DROP COLUMN IF EXISTS "diagnostic";
ALTER TABLE "Prescription" DROP COLUMN IF EXISTS "note";