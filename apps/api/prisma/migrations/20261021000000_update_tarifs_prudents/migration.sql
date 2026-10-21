-- Mise à jour vers la grille tarifaire prudente (oct 2026)
-- Essentielle : 25 000 / 27 000 / 33 000 / 42 000 FCFA/an
-- Confort : 28 000 / 33 000 / 40 000 / 50 000 / 65 000 FCFA/an
-- Famille : forfaits 75 000 à 115 000 FCFA/an
-- Entreprise : dégressif 19 000 à 28 000 FCFA/salarié

UPDATE "Product" SET "basePremiumAnnual" = 25000, "pricePerAdditionalAdultAnnual" = 25000, "pricePerChildAnnual" = 15000, "globalAnnualCap" = 600000, "oopAnnualCap" = 200000, "ageLoadings" = '[{"minAge":15,"maxAge":29,"factor":1.0},{"minAge":30,"maxAge":39,"factor":1.0},{"minAge":40,"maxAge":49,"factor":1.08},{"minAge":50,"maxAge":59,"factor":1.32},{"minAge":60,"maxAge":120,"factor":1.68}]' WHERE "code" = 'ESS';
UPDATE "Product" SET "basePremiumAnnual" = 28000, "pricePerAdditionalAdultAnnual" = 28000, "pricePerChildAnnual" = 22000, "globalAnnualCap" = 1800000, "oopAnnualCap" = 150000, "ageLoadings" = '[{"minAge":15,"maxAge":29,"factor":1.0},{"minAge":30,"maxAge":39,"factor":1.18},{"minAge":40,"maxAge":49,"factor":1.43},{"minAge":50,"maxAge":59,"factor":1.79},{"minAge":60,"maxAge":120,"factor":2.32}]' WHERE "code" = 'CONF';
UPDATE "Product" SET "basePremiumAnnual" = 75000, "pricePerAdditionalAdultAnnual" = 0, "pricePerChildAnnual" = 0, "globalAnnualCap" = 3000000, "oopAnnualCap" = 200000, "ageLoadings" = '[]' WHERE "code" = 'FAM';
UPDATE "Product" SET "status" = 'ARCHIVED' WHERE "code" = 'EXC';
