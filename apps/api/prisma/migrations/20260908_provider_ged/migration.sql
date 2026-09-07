-- GED prestataire : FileObject.ownerId nullable (documents pré-compte d'inscription).
-- Idempotent, sans perte (aucune ligne existante n'a ownerId NULL avant ce changement
-- car la colonne était NOT NULL).

ALTER TABLE "FileObject" ALTER COLUMN "ownerId" DROP NOT NULL;
