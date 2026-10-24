-- Réparation de la formule Famille.
--
-- La migration 20261019000000_update_formulas a créé le produit 'FAM' sans
-- aucune ligne "ProductGuarantee". Or le moteur (domain/engine.ts) répond
-- EXCLUDED à toute catégorie dépourvue de règle : les adhérents Famille
-- payaient donc 75 000 FCFA/an sans aucune couverture, et toute demande de
-- remboursement était rejetée.
--
-- Plafond global : déjà ramené à 3 000 000 par la grille prudente d'octobre
-- 2026 (20261021000000_update_tarifs_prudents). La somme des plafonds par
-- catégorie ci-dessous (2 340 000) reste strictement en dessous, donc le
-- plafond global mord avant — cohérent avec les quatre autres formules.
--
-- maxUnitPrice reste NULL, comme sur les quatre autres formules : le barème
-- par acte n'est appliqué nulle part aujourd'hui. Le renseigner ici seulement
-- rendrait la nouvelle formule plus restrictive que ses aînées pour la même
-- promesse publiée — ce point se règle pour tout le catalogue, pas dans une
-- migration de réparation.
--
-- Les lignes "Guarantee" sont créées seulement si leur catégorie est absente :
-- sur la base de production elles existent déjà (le catalogue a été seedé), sur
-- une base construite par `migrate deploy` seul elles n'existent pas — sans ce
-- bloc, l'insertion ci-dessous ne trouverait aucune garantie à rattacher et la
-- migration réussirait en ne réparant rien, ce qui est le pire des cas.

INSERT INTO "Guarantee" ("id", "code", "name", "category", "active", "sortOrder", "basePrice")
SELECT v.id, v.code::text, v.name::text, v.category::text, true,
       v.sort_order::int, v.base_price::int
FROM (VALUES
  ('famcat-hospitalization', 'HOSP', 'Hospitalisation',   'HOSPITALIZATION', 1, 25000),
  ('famcat-consultation',    'CONS', 'Consultations',     'CONSULTATION',    2,  8000),
  ('famcat-pharmacy',        'PHAR', 'Pharmacie',         'PHARMACY',        3, 12000),
  ('famcat-laboratory',      'LABO', 'Analyses & imagerie','LABORATORY',     4, 10000),
  ('famcat-specialized',     'SPEC', 'Soins spécialisés', 'SPECIALIZED',     5, 15000),
  ('famcat-maternity',       'MAT',  'Maternité',         'MATERNITY',       6, 18000),
  ('famcat-dental',          'DENT', 'Soins dentaires',   'DENTAL',          7,  6000),
  ('famcat-optical',         'OPT',  'Optique',           'OPTICAL',         8,  5000)
) AS v(id, code, name, category, sort_order, base_price)
WHERE NOT EXISTS (
  SELECT 1 FROM "Guarantee" g WHERE g."category" = v.category::text
);

-- Idempotence : le NOT EXISTS évite un doublon si la ligne existe déjà (base
-- de dev seedée depuis le catalogue, par exemple).
INSERT INTO "ProductGuarantee" (
  "id","productId","guaranteeId","annualLimit","familyLimit","rate",
  "minRate","maxRate","minLimit","maxLimit","limitStep","pricePerLimitStep",
  "copayRate","maxUnitPrice","mandatory","customizable"
)
SELECT
  'fam-g-' || lower(v.category),
  p."id",
  g."id",
  v.annual_limit, NULL, v.rate,
  v.rate, v.rate, v.annual_limit, v.annual_limit, 0, 0,
  v.copay, NULL, true, false
FROM (VALUES
  ('HOSPITALIZATION',  800000, 85, 15),
  ('CONSULTATION',     200000, 90, 10),
  ('PHARMACY',         400000, 75, 25),
  ('LABORATORY',       100000, 80, 20),
  ('SPECIALIZED',      300000, 85, 15),
  ('MATERNITY',        400000, 85, 15),
  ('DENTAL',            80000, 70, 30),
  ('OPTICAL',           60000, 70, 30)
) AS v(category, annual_limit, rate, copay)
JOIN LATERAL (
  -- Une seule garantie par catégorie : le catalogue en compte une par
  -- catégorie, mais on reste déterministe si une base en contient plusieurs.
  SELECT g2."id"
  FROM "Guarantee" g2
  WHERE g2."category" = v.category
  ORDER BY g2."sortOrder" ASC, g2."code" ASC
  LIMIT 1
) g ON TRUE
JOIN "Product" p ON p."code" = 'FAM'
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProductGuarantee" pg
  WHERE pg."productId" = p."id" AND pg."guaranteeId" = g."id"
);
