-- Barème par acte (maxUnitPrice) — décision du 25/10/2026.
--
-- Constat : la colonne existe depuis 20260829010000_actuarial_fixes, mais
-- AUCUNE ligne "ProductGuarantee" ne la renseignait. Le moteur l'applique
-- pourtant (domain/engine.ts → FEE_SCHEDULE_EXCEEDED), et la CGA §2 publie
-- « Max par acte » sur quatre formules : le bridage tarifaire promis aux
-- adhérents n'était appliqué nulle part. Cause du trou : les deux seeds
-- (prisma/seed.ts, prisma/seed-catalogue.ts) déclaraient les montants mais ne
-- les passaient pas au create() — une réinstallation reproduisait donc un
-- catalogue sans barème. Les deux sont corrigés dans le même commit.
--
-- Grille retenue = celle déjà publiée dans la CGA pour ESS, CONF, ENT-PERF et
-- ENT-VIP. La formule Famille, dont la CGA affichait « — » partout, reprend
-- les tarifs de référence de CONF : même réseau de prestataires, formule
-- au-dessus. Une formule familiale ne peut pas être plus restrictive que
-- l'individuelle qu'elle surclasse sur le même acte, sinon la promesse publiée
-- (taux 85-90 %, 3 000 000 de plafond) devient inatteignable.
--
-- Maternité et optique restent volontairement à NULL : ce sont des forfaits
-- (un accouchement, un équipement), le plafond annuel EST le plafond de
-- l'acte. Y écrire un barème égal au plafond annuel n'ajouterait aucune
-- contrainte tout en laissant croire à une limite qui n'existe pas.
--
-- Hospitalisation : 45 000 par journée, identique sur les cinq formules. Le
-- moteur plafonne une LIGNE de réclamation, pas une journée : la déclaration
-- doit détailler les journées, une ligne par jour. Ce point d'exploitation est
-- rappelé dans la CGA et dans le formulaire de déclaration côté adhérent.
--
-- Idempotent : les valeurs sont absolues, rejouer le SQL ne change rien.

UPDATE "ProductGuarantee" AS pg
SET "maxUnitPrice" = v.cap
FROM (VALUES
  -- Socle (réseau de base, 30 % de ticket modérateur)
  ('ESS', 'HOSPITALIZATION', 45000),
  ('ESS', 'CONSULTATION',    10000),
  ('ESS', 'PHARMACY',        15000),
  ('ESS', 'LABORATORY',      10000),

  -- Confort : barème déjà publié par la CGA
  ('CONF', 'HOSPITALIZATION', 45000),
  ('CONF', 'CONSULTATION',    12000),
  ('CONF', 'PHARMACY',        30000),
  ('CONF', 'LABORATORY',      15000),
  ('CONF', 'SPECIALIZED',     15000),
  ('CONF', 'DENTAL',          15000),

  -- Famille : mêmes tarifs de référence que Confort (même réseau)
  ('FAM', 'HOSPITALIZATION', 45000),
  ('FAM', 'CONSULTATION',    12000),
  ('FAM', 'PHARMACY',        30000),
  ('FAM', 'LABORATORY',      15000),
  ('FAM', 'SPECIALIZED',     15000),
  ('FAM', 'DENTAL',          15000),

  -- Entreprise Performance : grille de maîtrise des coûts (plafond 500 000)
  ('ENT-PERF', 'HOSPITALIZATION', 45000),
  ('ENT-PERF', 'CONSULTATION',    10000),
  ('ENT-PERF', 'PHARMACY',        25000),
  ('ENT-PERF', 'LABORATORY',      10000),

  -- Entreprise Cadre / VIP : réseau premium
  ('ENT-VIP', 'HOSPITALIZATION', 45000),
  ('ENT-VIP', 'CONSULTATION',    20000),
  ('ENT-VIP', 'PHARMACY',        40000),
  ('ENT-VIP', 'LABORATORY',      25000),
  ('ENT-VIP', 'SPECIALIZED',     25000),
  ('ENT-VIP', 'DENTAL',          15000)
) AS v(product_code, category, cap)
JOIN "Product" p ON p."code" = v.product_code
JOIN "Guarantee" g ON g."category" = v.category
WHERE pg."productId" = p."id"
  AND pg."guaranteeId" = g."id";
