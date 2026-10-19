-- Mise à jour du catalogue produits vers les 4 formules du prompt mutualité agréée
-- (Essentielle, Confort, Famille, Entreprise). Les anciennes formules (Excellence)
-- sont archivées pour ne plus apparaître dans le simulateur.

UPDATE "Product"
SET "name" = 'Santé Essentielle',
    "basePremiumAnnual" = 15000,
    "pricePerAdditionalAdultAnnual" = 15000,
    "pricePerChildAnnual" = 4000,
    "globalAnnualCap" = 500000,
    "oopAnnualCap" = 200000,
    "ageLoadings" = '[{"minAge":15,"maxAge":29,"factor":1.0},{"minAge":30,"maxAge":39,"factor":1.13},{"minAge":40,"maxAge":49,"factor":1.33},{"minAge":50,"maxAge":59,"factor":1.6},{"minAge":60,"maxAge":120,"factor":1.87}]'
WHERE "code" = 'ESS';

UPDATE "Product"
SET "name" = 'Santé Confort',
    "basePremiumAnnual" = 25000,
    "pricePerAdditionalAdultAnnual" = 25000,
    "pricePerChildAnnual" = 7000,
    "globalAnnualCap" = 1500000,
    "oopAnnualCap" = 150000,
    "ageLoadings" = '[{"minAge":15,"maxAge":29,"factor":1.0},{"minAge":30,"maxAge":39,"factor":1.13},{"minAge":40,"maxAge":49,"factor":1.33},{"minAge":50,"maxAge":59,"factor":1.6},{"minAge":60,"maxAge":120,"factor":1.87}]'
WHERE "code" = 'CONF';

-- Archiver l'ancienne formule Excellence (non prévue dans les 4 formules agréées)
UPDATE "Product" SET "status" = 'ARCHIVED' WHERE "code" = 'EXC';

-- Créer la formule Famille si elle n'existe pas
INSERT INTO "Product" ("id","code","name","clientType","status","sortOrder","description","minAge","maxAge","waitingPeriodDays","basePremiumAnnual","pricePerAdditionalAdultAnnual","pricePerChildAnnual","thirdPartyAuthThreshold","globalAnnualCap","oopAnnualCap","ageLoadings","beneficiaryRules","eligibilityConditions","createdAt","updatedAt")
SELECT 'famille-product', 'FAM', 'Santé Famille', 'INDIVIDUAL', 'ACTIVE', 3, 'Forfait familial : 2 adultes + 3 enfants maximum.', 0, 65, 30, 78000, 0, 0, 200000, 4000000, 200000, '[]', '{"spouse":true,"childMaxAge":21,"otherAllowed":false,"maxBeneficiaries":5}', '{"waitingPeriodDays":{"default":30,"hospitalization":90,"maternity":270},"copayRate":10}', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Product" WHERE "code" = 'FAM');
