-- Plafond annuel de reste à charge par contrat/produit (null = désactivé).
-- Champ optionnel : aucun comportement imposé aux produits existants.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "oopAnnualCap" INTEGER;
