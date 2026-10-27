-- ═══════════════════════════════════════════════════════════════════════
-- 1. Forfait Famille : composition incluse + suppléments au-delà
-- ═══════════════════════════════════════════════════════════════════════
-- La cotisation de base d'une formule peut désormais couvrir plusieurs
-- personnes (forfait familial). Défauts neutres : 1 adulte (l'assuré
-- principal) et 0 enfant, ce qui laisse Essentielle et Confort inchangées
-- (moteur : adultes au-delà de 1, tous les enfants facturés).
ALTER TABLE "Product" ADD COLUMN "includedAdults" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN "includedChildren" INTEGER NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Rachat de carence hospitalisation (option payante)
-- ═══════════════════════════════════════════════════════════════════════
-- carenceBuyoutRate = surprime en % de la cotisation annuelle ; 0 = option
-- non proposée sur le produit. carenceBuyout sur le contrat = option
-- souscrite : le moteur de sinistre n'oppose plus la carence hospitalisation.
ALTER TABLE "Product" ADD COLUMN "carenceBuyoutRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contract" ADD COLUMN "carenceBuyout" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Grille Famille : forfait 2 adultes + 3 enfants, suppléments au-delà
-- ═══════════════════════════════════════════════════════════════════════
-- Avant cette grille, pricePerAdditionalAdultAnnual et pricePerChildAnnual
-- valaient 0 : un foyer de 1 comme de 5 personnes payait 75 000 FCFA, et
-- l'accueil d'un membre supplémentaire était gratuit (fuite actuarielle).
-- Le forfait couvre maintenant 2 adultes + 3 enfants ; au-delà, chaque
-- adulte supplémentaire est facturé 30 000 FCFA/an et chaque enfant
-- 18 000 FCFA/an (ratio adulte/enfant 1,67, identique à Essentielle).
-- Le quota d'ayants droit passe à 10 et les autres ayants droit (grands-
-- parents, adulte à charge) sont admis : c'est le sens des « foyers
-- élargis » qui motive les suppléments.
UPDATE "Product" SET
  "includedAdults" = 2,
  "includedChildren" = 3,
  "pricePerAdditionalAdultAnnual" = 30000,
  "pricePerChildAnnual" = 18000,
  "beneficiaryRules" = '{"spouse":true,"childMaxAge":21,"otherAllowed":true,"maxBeneficiaries":10}'
WHERE "code" = 'FAM';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Rachat de carence proposé sur les trois formules individuelles
-- ═══════════════════════════════════════════════════════════════════════
-- Surprime de 25 % de la cotisation annuelle. Le taux est une surprime de
-- première année (anti-sélection) : elle doit être ajustée sur les ratios
-- constatés, produit par produit, depuis l'administration.
UPDATE "Product" SET "carenceBuyoutRate" = 25 WHERE "code" IN ('ESS', 'CONF', 'FAM');
