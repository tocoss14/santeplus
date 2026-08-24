const pptxgen = require('pptxgenjs');

const TEAL = '0F766E';
const TEAL_DARK = '134E4A';
const TEAL_SOFT = 'CCFBF1';
const LIGHT = 'F0FDFA';
const INK = '1E293B';
const MUTED = '64748B';
const AMBER = 'D97706';
const WHITE = 'FFFFFF';
const BORDER = 'CBD5E1';

const HFONT = 'Cambria';
const BFONT = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'SantePlus Benin';
pres.title = 'SantePlus - Proposition de partenariat assureur';

const W = 13.33;

function title(slide, text, color = INK) {
  slide.addText(text, {
    x: 0.6, y: 0.45, w: 12.13, h: 0.75,
    fontFace: HFONT, fontSize: 29, bold: true, color, margin: 0,
  });
}

function kicker(slide, text) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.16, w: 12.13, h: 0.3,
    fontFace: BFONT, fontSize: 10.5, bold: true, color: TEAL, charSpacing: 2, margin: 0,
  });
}

function chip(slide, x, y, text, opts = {}) {
  const d = opts.d ?? 0.5;
  slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color: opts.color ?? TEAL } });
  slide.addText(text, {
    x: x - 0.1, y: y - 0.02, w: d + 0.2, h: d + 0.04,
    align: 'center', valign: 'middle', fontFace: BFONT,
    fontSize: opts.fontSize ?? 14, bold: true, color: opts.textColor ?? WHITE, margin: 0,
  });
}

function card(slide, x, y, w, h, fill = LIGHT, line) {
  slide.addShape('roundRect', {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: fill },
    ...(line ? { line: { color: line, width: 0.75 } } : {}),
  });
}

/* ============ SLIDE 1 — TITRE (fond sombre) ============ */
{
  const s = pres.addSlide();
  s.background = { color: TEAL_DARK };
  s.addShape('ellipse', { x: 9.4, y: -2.2, w: 6.6, h: 6.6, fill: { color: '2DD4BF', transparency: 86 } });
  s.addShape('ellipse', { x: 11.0, y: 3.9, w: 4.2, h: 4.2, fill: { color: '5EEAD4', transparency: 88 } });
  s.addShape('ellipse', { x: 8.35, y: 4.9, w: 1.5, h: 1.5, fill: { color: 'F59E0B', transparency: 55 } });

  s.addText('SantéPlus Bénin', {
    x: 0.8, y: 1.85, w: 10.5, h: 1.15,
    fontFace: HFONT, fontSize: 54, bold: true, color: WHITE, margin: 0,
  });
  s.addText('« Votre santé. Votre couverture. Simplement. »', {
    x: 0.82, y: 3.05, w: 9.8, h: 0.55,
    fontFace: HFONT, fontSize: 21, italic: true, color: '99F6E4', margin: 0,
  });
  s.addText('Plateforme digitale d’assurance santé\nProposition de partenariat — portage de produits par un assureur partenaire', {
    x: 0.82, y: 4.05, w: 9.4, h: 0.95,
    fontFace: BFONT, fontSize: 15, color: TEAL_SOFT, margin: 0, lineSpacingMultiple: 1.15,
  });
  s.addText('Document confidentiel · 2026 · À l’attention de la Direction Générale et de la Direction Technique', {
    x: 0.82, y: 6.85, w: 11, h: 0.35,
    fontFace: BFONT, fontSize: 10, color: '5EEAD4', margin: 0,
  });
  s.addNotes("Ouverture : rappeler que la plateforme est opérationnelle et que l'objet de la rencontre est le partenariat de portage de produits.");
}

/* ============ SLIDE 2 — CONTEXTE MARCHÉ ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Contexte marché');
  title(s, 'Une demande immense, encore très peu couverte');

  const stats = [
    { big: '< 10 %', label: 'de la population dispose d’une couverture maladie (estimation — la majorité paie ses soins en direct)' },
    { big: '~90 %', label: 'de l’économie est informelle : hors de portée des circuits classiques d’assurance' },
    { big: 'N° 1', label: 'le mobile money est devenu le premier moyen de paiement des ménages urbains et ruraux' },
  ];
  stats.forEach((st, i) => {
    const x = 0.6 + i * (3.87 + 0.26);
    card(s, x, 1.65, 3.87, 3.15);
    s.addText(st.big, {
      x: x + 0.2, y: 2.0, w: 3.47, h: 1.15,
      align: 'center', fontFace: HFONT, fontSize: 58, bold: true, color: TEAL, margin: 0,
    });
    s.addText(st.label, {
      x: x + 0.35, y: 3.25, w: 3.17, h: 1.4,
      align: 'center', fontFace: BFONT, fontSize: 12.5, color: INK, valign: 'top', margin: 0, lineSpacingMultiple: 1.1,
    });
  });

  s.addText('Une demande réelle de protection santé — bloquée par des parcours inadaptés au quotidien des ménages et des entreprises.', {
    x: 1.2, y: 5.45, w: 10.93, h: 0.7,
    align: 'center', fontFace: HFONT, fontSize: 15, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes("Chiffres à ajuster avec les données officielles du partenaire ; l'ordre de grandeur (couverture < 10 %, informel dominant) fait consensus.");
}

/* ============ SLIDE 3 — LE PROBLÈME ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Le problème');
  title(s, 'Pourquoi tant de familles restent sans couverture');

  const items = [
    ['01', 'Souscription lourde', 'Paperasse, déplacements en agence, délais d’attente : l’adhésion décourage les candidats.'],
    ['02', 'Cotisations en espèces', 'Aucun paiement à distance ni fractionnement souple adapté aux revenus irréguliers.'],
    ['03', 'Remboursements opaques', 'Justificatifs papier, délais longs, aucun suivi pour l’assuré comme pour l’employeur.'],
    ['04', 'Gestion manuelle coûteuse', 'Saisie, contrôles et règlements à la main : charges élevées, erreurs, fraude difficile à détecter.'],
  ];
  items.forEach((it, i) => {
    const x = i % 2 === 0 ? 0.6 : 6.78;
    const y = i < 2 ? 1.7 : 3.85;
    card(s, x, y, 5.95, 1.95, 'F8FAFC', BORDER);
    chip(s, x + 0.28, y + 0.32, it[0], { d: 0.55, fontSize: 13 });
    s.addText(it[1], {
      x: x + 1.05, y: y + 0.22, w: 4.7, h: 0.4,
      fontFace: BFONT, fontSize: 15.5, bold: true, color: INK, margin: 0,
    });
    s.addText(it[2], {
      x: x + 1.05, y: y + 0.68, w: 4.7, h: 1.1,
      fontFace: BFONT, fontSize: 12, color: MUTED, valign: 'top', margin: 0, lineSpacingMultiple: 1.08,
    });
  });

  s.addText('Chaque frein est adressable par le digital mobile — c’est exactement ce que construit SantéPlus.', {
    x: 1.2, y: 6.25, w: 10.93, h: 0.55,
    align: 'center', fontFace: HFONT, fontSize: 14.5, italic: true, color: TEAL, margin: 0,
  });
  s.addNotes('Insister sur le coût de traitement manuel côté assureur : c’est l’argument ROI.');
}

/* ============ SLIDE 4 — LA SOLUTION (FLUX) ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'La solution');
  title(s, 'La chaîne complète de l’assurance santé, digitalisée');

  const boxes = [
    { x: 0.6, fill: LIGHT, line: BORDER, tColor: INK, head: 'Clients', sub: 'Particuliers\nEntreprises & salariés' },
    { x: 3.74, fill: TEAL, tColor: WHITE, head: 'Plateforme SantéPlus', sub: 'Souscription & devis\nMobile money\nCarte assuré QR\nTiers payant\nRemboursements' },
    { x: 6.88, fill: LIGHT, line: BORDER, tColor: INK, head: 'Produits santé', sub: 'Formules configurables\npar vos équipes,\nsans développement' },
    { x: 10.02, fill: TEAL_DARK, tColor: WHITE, head: 'VOUS\npartenaire assureur', sub: 'Porteur du risque\nMarque produit\nAgrément CIMA' },
  ];
  boxes.forEach((b) => {
    const tall = !!b.tall;
    card(s, b.x, 1.75, 2.69, 2.75, b.fill, b.line);
    s.addText(b.head, {
      x: b.x + 0.15, y: 1.95, w: 2.39, h: 0.75,
      align: 'center', fontFace: BFONT, fontSize: 14.5, bold: true, color: b.tColor, margin: 0, valign: 'top',
    });
    s.addText(b.sub, {
      x: b.x + 0.15, y: 2.72, w: 2.39, h: 1.65,
      align: 'center', fontFace: BFONT, fontSize: 11, color: b.fill === TEAL || b.fill === TEAL_DARK ? 'CCFBF1' : MUTED, margin: 0, lineSpacingMultiple: 1.18, valign: 'top',
    });
  });
  [3.34, 6.48, 9.62].forEach((x) => {
    s.addShape('rightArrow', { x, y: 2.9, w: 0.36, h: 0.42, fill: { color: AMBER } });
  });

  card(s, 0.6, 4.95, 12.11, 0.85, LIGHT);
  s.addText([
    { text: 'Réseau de soins conventionné  ', options: { bold: true, color: TEAL } },
    { text: '— hôpitaux · cliniques · pharmacies · laboratoires · spécialistes : annuaire géolocalisé et tiers payant intégré.', options: { color: INK } },
  ], {
    x: 0.9, y: 5.06, w: 11.6, h: 0.62, fontFace: BFONT, fontSize: 12.5, margin: 0, valign: 'middle',
  });

  s.addNotes('Le message clé : SantéPlus se positionne entre le client et vous, sans jamais porter le risque ni se substituer à votre agrément.');
}

/* ============ SLIDE 5 — PARCOURS CLIENT ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Parcours client');
  title(s, 'Souscrire prend moins de cinq minutes');

  const steps = [
    ['1', 'Création de compte', 'Téléphone ou ordinateur,\nen 2 minutes'],
    ['2', 'Formule & devis', 'Comparaison immédiate,\nayants droit inclus'],
    ['3', 'Paiement mobile', 'Mobile money — mensuel,\ntrimestriel ou annuel'],
    ['4', 'Carte QR active', 'Couverture effective,\ncertificat PDF généré'],
  ];
  steps.forEach((st, i) => {
    const x = 0.6 + i * (2.69 + 0.45);
    card(s, x, 2.05, 2.69, 2.5, 'F8FAFC', BORDER);
    chip(s, x + 1.07, 1.78, st[0], { d: 0.56, fontSize: 16 });
    s.addText(st[1], {
      x: x + 0.15, y: 2.62, w: 2.39, h: 0.5,
      align: 'center', fontFace: BFONT, fontSize: 14.5, bold: true, color: INK, margin: 0,
    });
    s.addText(st[2], {
      x: x + 0.2, y: 3.18, w: 2.29, h: 1.1,
      align: 'center', fontFace: BFONT, fontSize: 11.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.15,
    });
    if (i < 3) s.addShape('rightArrow', { x: x + 2.72, y: 3.05, w: 0.36, h: 0.42, fill: { color: AMBER } });
  });

  card(s, 0.6, 5.15, 12.11, 1.0, LIGHT);
  s.addText([
    { text: 'Contrat numérique, certificat d’adhésion PDF et carte d’assuré ', options: { color: INK } },
    { text: 'générés automatiquement', options: { bold: true, color: TEAL } },
    { text: ' — zéro paperasse, activation dès confirmation du paiement.', options: { color: INK } },
  ], {
    x: 0.95, y: 5.27, w: 11.4, h: 0.76, fontFace: BFONT, fontSize: 13, margin: 0, valign: 'middle',
  });
  s.addNotes('Démo possible en live depuis un simple téléphone pendant la réunion.');
}

/* ============ SLIDE 6 — VALEUR ASSUREUR ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Valeur pour votre compagnie');
  title(s, 'Ce que SantéPlus apporte à votre portefeuille santé');

  const vals = [
    ['Acquisition digitale', 'Nouveau canal direct particuliers & entreprises, accessible 24/7 depuis un téléphone.'],
    ['Coûts de gestion réduits', 'Souscription, échéanciers, paiements et documents automatisés de bout en bout.'],
    ['Sinistralité maîtrisée', 'Plafonds et taux appliqués en temps réel, reste à charge connu avant l’acte.'],
    ['Anti-fraude intégré', 'Détection de doublons, délais de carence, exclusions et autorisations préalables.'],
    ['Reporting & données', 'Tableaux de bord production / sinistralité, exports, statistiques par produit.'],
    ['Votre marque en avant', 'Produits, contrats, certificats et attestations portent le nom de votre compagnie.'],
  ];
  vals.forEach((v, i) => {
    const x = 0.6 + (i % 3) * (3.87 + 0.26);
    const y = i < 3 ? 1.7 : 3.72;
    card(s, x, y, 3.87, 1.82, 'F8FAFC', BORDER);
    chip(s, x + 0.24, y + 0.26, '✓', { d: 0.44, fontSize: 13 });
    s.addText(v[0], {
      x: x + 0.84, y: y + 0.18, w: 2.9, h: 0.62,
      fontFace: BFONT, fontSize: 13.5, bold: true, color: INK, margin: 0, valign: 'top',
    });
    s.addText(v[1], {
      x: x + 0.28, y: y + 0.82, w: 3.35, h: 0.92,
      fontFace: BFONT, fontSize: 11, color: MUTED, margin: 0, valign: 'top', lineSpacingMultiple: 1.08,
    });
  });

  s.addText('Objectif partagé : développer rapidement un portefeuille santé rentable et bien géré.', {
    x: 1.2, y: 6.0, w: 10.93, h: 0.5,
    align: 'center', fontFace: HFONT, fontSize: 14, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes("Chaque bénéfice correspond à une fonctionnalité déjà livrée dans la plateforme (voir démo).");
}

/* ============ SLIDE 7 — TIERS PAYANT ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Expérience prestataire');
  title(s, 'Le tiers payant en temps réel chez les partenaires');

  card(s, 0.6, 1.7, 6.35, 4.55, 'F8FAFC', BORDER);
  s.addText('Au cabinet, en 30 secondes', {
    x: 0.9, y: 1.92, w: 5.8, h: 0.4, fontFace: BFONT, fontSize: 14.5, bold: true, color: INK, margin: 0,
  });
  const steps = [
    'Scan du QR code de la carte assuré (caméra ou saisie)',
    'Vérification instantanée : contrat, garanties, plafonds restants',
    'Saisie des actes — calcul immédiat de la prise en charge',
    'Confirmation : plafonds décrémentés, reçu numérique remis au patient',
  ];
  steps.forEach((t, i) => {
    chip(s, 0.95, 2.52 + i * 0.92, String(i + 1), { d: 0.46, fontSize: 13 });
    s.addText(t, {
      x: 1.58, y: 2.47 + i * 0.92, w: 5.2, h: 0.75,
      fontFace: BFONT, fontSize: 12.5, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 1.05,
    });
  });

  card(s, 7.25, 1.7, 5.46, 4.55, LIGHT);
  s.addText('Ce que cela change', {
    x: 7.55, y: 1.92, w: 4.9, h: 0.4, fontFace: BFONT, fontSize: 14.5, bold: true, color: TEAL, margin: 0,
  });
  const highs = [
    'Reste à charge connu par le patient avant l’acte — plus de mauvaise surprise',
    'Plafonds annuels suivis à l’unité près, par garantie et par assuré',
    'Autorisation préalable automatique au-delà d’un seuil configurable',
    'Historique complet et traçable pour vos services de gestion',
  ];
  highs.forEach((h, i) => {
    s.addText([{ text: '✓  ', options: { bold: true, color: TEAL } }, { text: h, options: { color: INK } }], {
      x: 7.55, y: 2.5 + i * 0.92, w: 4.9, h: 0.85,
      fontFace: BFONT, fontSize: 12, margin: 0, valign: 'top', lineSpacingMultiple: 1.08,
    });
  });

  s.addNotes("L'autorisation préalable est paramétrable par produit et par seuil : vous gardez le contrôle médical-administratif des actes coûteux.");
}

/* ============ SLIDE 8 — CONFORMITÉ & SÉCURITÉ ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Cadre réglementaire & sécurité');
  title(s, 'Un partenariat clair, conforme, sécurisé');

  card(s, 0.6, 1.7, 5.95, 4.55, LIGHT);
  s.addText('Des rôles séparés, conformes CIMA', {
    x: 0.9, y: 1.94, w: 5.4, h: 0.42, fontFace: BFONT, fontSize: 15, bold: true, color: TEAL, margin: 0,
  });
  const lefts = [
    'Vous portez le risque et la marque commerciale du produit',
    'SantéPlus agit comme intermédiaire technologique (plateforme)',
    'Mentions légales intégrées aux contrats, certificats et attestations',
    'Architecture multi-assureurs : indépendante et réversible',
    'Extensible zone UEMOA / espace CIMA (multi-pays, multi-devises)',
  ];
  lefts.forEach((t, i) => {
    s.addText([{ text: '•  ', options: { bold: true, color: TEAL } }, { text: t, options: { color: INK } }], {
      x: 0.9, y: 2.52 + i * 0.74, w: 5.4, h: 0.68,
      fontFace: BFONT, fontSize: 12.5, margin: 0, valign: 'top', lineSpacingMultiple: 1.05,
    });
  });

  card(s, 6.83, 1.7, 5.9, 4.55, 'F8FAFC', BORDER);
  s.addText('Sécurité by design', {
    x: 7.13, y: 1.94, w: 5.3, h: 0.42, fontFace: BFONT, fontSize: 15, bold: true, color: INK, margin: 0,
  });
  const rights = [
    'Permissions granulaires et journal d’audit de toutes les actions sensibles',
    'Pièces d’identité chiffrées (AES-256), documents médicaux jamais publics',
    'QR carte = jeton opaque : aucune donnée personnelle exposée',
    'Cloisonnement strict des données entre entreprises clientes',
    'Paiements certifiés via FedaPay / CinetPay (MTN MoMo, Moov Money)',
  ];
  rights.forEach((t, i) => {
    s.addText([{ text: '✓  ', options: { bold: true, color: TEAL } }, { text: t, options: { color: INK } }], {
      x: 7.13, y: 2.52 + i * 0.74, w: 5.35, h: 0.68,
      fontFace: BFONT, fontSize: 12.5, margin: 0, valign: 'top', lineSpacingMultiple: 1.05,
    });
  });

  s.addNotes('Rassurer sur deux points sensibles : conformité (intermédiation vs portage) et protection des données de santé.');
}

/* ============ SLIDE 9 — MULTI-PRODUITS ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Moteur produits');
  title(s, 'Lancez vos offres santé sans une ligne de code');

  const feats = [
    ['Garanties paramétrables', 'Catégories, taux, plafonds, franchises, exclusions, carences'],
    ['Règles d’adhésion', 'Âges, conjoint, enfants (âge max), quotas d’ayants droit'],
    ['Tarification flexible', 'Base + adultes + enfants, fractionnement mensuel / trimestriel / annuel'],
    ['Multi-partenaires', 'Chaque produit peut être porté par un assureur différent'],
  ];
  feats.forEach((f, i) => {
    const x = i % 2 === 0 ? 0.6 : 6.78;
    const y = i < 2 ? 1.7 : 3.42;
    card(s, x, y, 5.95, 1.55, 'F8FAFC', BORDER);
    s.addText(f[0], {
      x: x + 0.3, y: y + 0.18, w: 5.3, h: 0.38,
      fontFace: BFONT, fontSize: 14, bold: true, color: TEAL, margin: 0,
    });
    s.addText(f[1], {
      x: x + 0.3, y: y + 0.6, w: 5.35, h: 0.85,
      fontFace: BFONT, fontSize: 12, color: INK, margin: 0, valign: 'top', lineSpacingMultiple: 1.08,
    });
  });

  s.addText('Offres déjà paramétrées dans la démonstration :', {
    x: 0.6, y: 5.25, w: 12.11, h: 0.35,
    fontFace: BFONT, fontSize: 12, color: MUTED, margin: 0,
  });
  const pills = ['Essentielle', 'Confort', 'Premium', 'Collective Entreprise'];
  pills.forEach((p, i) => {
    const x = 0.6 + i * 3.09;
    s.addShape('roundRect', {
      x, y: 5.68, w: 2.85, h: 0.66, rectRadius: 0.33, fill: { color: TEAL },
    });
    s.addText(p, {
      x, y: 5.68, w: 2.85, h: 0.66,
      align: 'center', valign: 'middle', fontFace: BFONT, fontSize: 13.5, bold: true, color: WHITE, margin: 0,
    });
  });
  s.addNotes('Message : time-to-market. Une nouvelle offre se configure en quelques heures par vos équipes, pas en mois de développement.');
}

/* ============ SLIDE 10 — MODÈLE ÉCONOMIQUE ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Modèle économique');
  title(s, 'Un partenariat équilibré, sans investissement lourd');

  const cols = [
    { head: 'Vous — assureur partenaire', fill: 'F8FAFC', line: BORDER, hc: INK, rows: [
      'Produit, garanties et tarification',
      'Portage du risque et réserves',
      'Marque commerciale des offres',
      'Encaissements sécurisés, sinistres suivis via la plateforme',
    ]},
    { head: 'SantéPlus', fill: 'F8FAFC', line: BORDER, hc: INK, rows: [
      'Technologie et évolution continue',
      'Acquisition digitale & marketing',
      'Exploitation quotidienne et support',
      'Relation prestataires et entreprises',
    ]},
    { head: 'Modèle contractuel', fill: 'FEF3C7', line: 'FDE68A', hc: '92400E', rows: [
      'Commission paramétrable sur les cotisations collectées',
      'Ou abonnement SaaS selon préférence',
      'KPIs partagés : souscriptions, recouvrement, sinistralité',
      'Aucun coût de développement à votre charge',
    ]},
  ];
  cols.forEach((cdef, i) => {
    const x = 0.6 + i * (3.87 + 0.26);
    card(s, x, 1.7, 3.87, 4.35, cdef.fill, cdef.line);
    s.addText(cdef.head, {
      x: x + 0.26, y: 1.92, w: 3.35, h: 0.65,
      fontFace: BFONT, fontSize: 14, bold: true, color: cdef.hc, margin: 0, valign: 'top',
    });
    cdef.rows.forEach((r, j) => {
      s.addText([{ text: '•  ', options: { bold: true, color: i === 2 ? AMBER : TEAL } }, { text: r, options: { color: INK } }], {
        x: x + 0.26, y: 2.68 + j * 0.79, w: 3.4, h: 0.75,
        fontFace: BFONT, fontSize: 11.5, margin: 0, valign: 'top', lineSpacingMultiple: 1.05,
      });
    });
  });

  s.addText('La plateforme est déjà développée et opérationnelle : le partenariat démarre par le commercial, pas par la technique.', {
    x: 1.2, y: 6.3, w: 10.93, h: 0.5,
    align: 'center', fontFace: HFONT, fontSize: 13.5, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes('Garder la discussion ouverte entre commission et SaaS ; l’essentiel est le démarrage rapide du pilote.');
}

/* ============ SLIDE 11 — DÉMO OPÉRATIONNELLE ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Preuve par la démonstration');
  title(s, 'Tout ceci fonctionne déjà, aujourd’hui');

  const checks = [
    'Souscription → mobile money → activation immédiate',
    'FedaPay & CinetPay intégrés (MTN MoMo, Moov Money)',
    'Carte d’assuré QR vérifiable par le prestataire',
    'Tiers payant avec calcul instantané et autorisation préalable',
    'Back-office complet : produits, contrats, sinistres, rôles',
    'Certificats et attestations officiels en PDF',
    'Import CSV des salariés avec contrôle des doublons',
    'Notifications e-mail / SMS / WhatsApp prêtes à brancher',
  ];
  checks.forEach((cItem, i) => {
    const x = i % 2 === 0 ? 0.9 : 6.95;
    const y = 1.75 + Math.floor(i / 2) * 0.78;
    s.addText([{ text: '✓  ', options: { bold: true, color: TEAL } }, { text: cItem, options: { color: INK } }], {
      x, y, w: 5.7, h: 0.68,
      fontFace: BFONT, fontSize: 13, margin: 0, valign: 'top', lineSpacingMultiple: 1.05,
    });
  });

  card(s, 0.6, 5.35, 12.11, 1.05, TEAL);
  s.addText([
    { text: 'Une session de démonstration en conditions réelles ', options: { bold: true } },
    { text: 'peut être organisée cette semaine — depuis un simple téléphone, devant vos équipes techniques et commerciales.' },
  ], {
    x: 0.95, y: 5.47, w: 11.4, h: 0.8,
    fontFace: BFONT, fontSize: 14, color: WHITE, margin: 0, valign: 'middle', lineSpacingMultiple: 1.1,
  });
  s.addNotes("Proposer directement deux créneaux de démo pour créer l'élan.");
}

/* ============ SLIDE 12 — ROADMAP ============ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  kicker(s, 'Vision commune');
  title(s, 'Construits pour grandir ensemble');

  const road = [
    ['OCR factures', 'Lecture automatique des justificatifs et pré-remplissage des demandes'],
    ['WhatsApp Business', 'Notifications natives et assistance assurée directement dans WhatsApp'],
    ['Application mobile', 'Applications stores pour assurés et prestataires (scan caméra natif)'],
    ['Extension régionale', 'UEMOA : multi-pays, multi-devises, multi-langues — architecture prête'],
  ];
  road.forEach((r, i) => {
    const x = 0.6 + i * (2.69 + 0.45);
    card(s, x, 1.85, 2.69, 2.6, LIGHT);
    chip(s, x + 1.07, 1.6, String(i + 1), { d: 0.52, fontSize: 14, color: AMBER });
    s.addText(r[0], {
      x: x + 0.15, y: 2.42, w: 2.39, h: 0.5,
      align: 'center', fontFace: BFONT, fontSize: 14.5, bold: true, color: INK, margin: 0,
    });
    s.addText(r[1], {
      x: x + 0.2, y: 2.98, w: 2.29, h: 1.35,
      align: 'center', fontFace: BFONT, fontSize: 11, color: MUTED, margin: 0, valign: 'top', lineSpacingMultiple: 1.12,
    });
  });

  s.addText('Priorités arrêtées ensemble lors de l’atelier de cadrage produits.', {
    x: 1.2, y: 4.95, w: 10.93, h: 0.5,
    align: 'center', fontFace: HFONT, fontSize: 13.5, italic: true, color: MUTED, margin: 0,
  });
  s.addNotes('Ne pas promettre de dates ici : la roadmap commune se fige à l’atelier de cadrage.');
}

/* ============ SLIDE 13 — PROCHAINES ÉTAPES (sombre) ============ */
{
  const s = pres.addSlide();
  s.background = { color: TEAL_DARK };
  s.addShape('ellipse', { x: -1.8, y: 4.6, w: 5.4, h: 5.4, fill: { color: '2DD4BF', transparency: 88 } });
  s.addShape('ellipse', { x: 11.3, y: -1.6, w: 4.4, h: 4.4, fill: { color: 'F59E0B', transparency: 60 } });

  s.addText('Construisons l’offre santé digitale du Bénin', {
    x: 0.8, y: 0.75, w: 11.7, h: 0.85,
    fontFace: HFONT, fontSize: 32, bold: true, color: WHITE, margin: 0,
  });

  const steps = [
    ['Atelier produits', '½ journée : formules, tarifs, seuils'],
    ['Convention', 'Cadre juridique et modèle économique'],
    ['Pilote 3 mois', 'Premiers clients, KPIs partagés'],
    ['Déploiement', 'Généralisation et extension d’offres'],
  ];
  steps.forEach((st, i) => {
    const x = 0.8 + i * (2.85 + 0.22);
    s.addShape('roundRect', { x, y: 2.15, w: 2.85, h: 1.95, rectRadius: 0.09, fill: { color: '0B4A45' } });
    chip(s, x + 0.24, 2.4, String(i + 1), { d: 0.5, fontSize: 15, color: 'F59E0B', textColor: TEAL_DARK });
    s.addText(st[0], {
      x: x + 0.9, y: 2.42, w: 1.9, h: 0.5,
      fontFace: BFONT, fontSize: 14, bold: true, color: WHITE, margin: 0, valign: 'middle',
    });
    s.addText(st[1], {
      x: x + 0.26, y: 3.1, w: 2.35, h: 0.85,
      fontFace: BFONT, fontSize: 11.5, color: '99F6E4', margin: 0, valign: 'top', lineSpacingMultiple: 1.12,
    });
    if (i < 3) s.addShape('rightArrow', { x: x + 2.87, y: 2.95, w: 0.2, h: 0.3, fill: { color: 'F59E0B' } });
  });

  s.addShape('roundRect', { x: 0.8, y: 4.75, w: 11.73, h: 1.35, rectRadius: 0.09, fill: { color: '0B4A45' } });
  s.addText([
    { text: 'Contact   ', options: { bold: true, color: '5EEAD4' } },
    { text: 'contact@santeplus.bj   ·   +229 01 00 00 00   ·   Cotonou, Bénin', options: { color: WHITE } },
  ], { x: 1.1, y: 4.9, w: 11.1, h: 0.45, fontFace: BFONT, fontSize: 14, margin: 0 });
  s.addText('SantéPlus Bénin — Plateforme technologique d’assurance santé · Démonstration disponible sur demande', {
    x: 1.1, y: 5.38, w: 11.1, h: 0.45, fontFace: BFONT, fontSize: 11.5, color: '99F6E4', margin: 0,
  });
  s.addNotes('Terminer sur la simplicité de la première étape : un seul atelier suffit pour chiffrer une offre.');
}

pres.writeFile({ fileName: 'SantePlus-Presentation-Assureur.pptx' })
  .then(f => console.log('OK ->', f))
  .catch(e => { console.error(e); process.exit(1); });
