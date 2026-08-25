const fs = require('fs');
const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, TabStopType, TabStopPosition, LevelFormat, convertInchesToTwip,
  Header, Footer, PageNumber, NumberFormat, ImageRun, VerticalAlign,
} = docx;

// ── Palette & helpers ────────────────────────────────────────────────────────
const TEAL = '0F766E', TEAL_DARK = '134E4A', TEAL_SOFT = 'CCFBF1', LIGHT = 'F0FDFA';
const INK = '1E293B', MUTED = '64748B', WHITE = 'FFFFFF', BORDER = 'CBD5E1';
const HFONT = 'Cambria', BFONT = 'Calibri';
const DX = WidthType.DXA;
const W = 9000; // ~6.25" usable (A4 8.27" - 2*1")
const COL2 = [W * 0.32, W * 0.68];
const COL3 = [W * 0.28, W * 0.36, W * 0.36];
const COL4 = [W * 0.18, W * 0.40, W * 0.22, W * 0.20];

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, font: HFONT, size: 28, bold: true, color: TEAL_DARK })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: TEAL, space: 4 } },
  });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 80 },
    children: [new TextRun({ text, font: HFONT, size: 24, bold: true, color: INK })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, font: BFONT, size: 22, bold: true, color: TEAL })] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, font: BFONT, size: 18, color: opts.muted ? MUTED : INK, italics: !!opts.italic, bold: !!opts.bold })],
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
  });
}
function bullet(text, boldPrefix) {
  const runs = [];
  if (boldPrefix) runs.push(new TextRun({ text: boldPrefix + ' — ', font: BFONT, size: 18, bold: true, color: INK }));
  runs.push(new TextRun({ text, font: BFONT, size: 18, color: INK }));
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: runs });
}
function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: LIGHT },
    children: [new TextRun({ text: '▸ ' + text, font: BFONT, size: 17, italics: true, color: MUTED })],
    indent: { left: 200 },
  });
}
function table(headers, rows, colWidths) {
  const w = colWidths || headers.map(() => Math.floor(W / headers.length));
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      width: { size: w[i], type: DX },
      shading: { type: ShadingType.CLEAR, fill: TEAL_DARK },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: BFONT, size: 16, bold: true, color: WHITE })] })],
    })),
  });
  const bodyRows = rows.map(r => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: w[i], type: DX },
      shading: { type: ShadingType.CLEAR, fill: i === 0 ? 'F8FAFC' : WHITE },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: String(c), font: BFONT, size: 16, color: INK })] })],
    })),
  }));
  return new Table({
    width: { size: W, type: DX }, columnWidths: w,
    rows: [headerRow, ...bodyRows],
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
               left: { style: BorderStyle.SINGLE, size: 1, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
               insideH: { style: BorderStyle.SINGLE, size: 1, color: BORDER }, insideV: { style: BorderStyle.SINGLE, size: 1, color: BORDER } },
  });
}
function kpi(text) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: '→ ' + text, font: BFONT, size: 18, color: TEAL, bold: true })],
    indent: { left: 200 },
  });
}

// ── Document ───────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }],
  },
  styles: {
    default: { heading1: { run: { font: HFONT, size: 28, color: TEAL_DARK }, paragraph: { spacing: { before: 360, after: 120 } } },
               heading2: { run: { font: HFONT, size: 24, color: INK } },
               heading3: { run: { font: BFONT, size: 22, color: TEAL } } },
    paragraphStyles: [
      { id: 'Normal', name: 'Normal', run: { font: BFONT, size: 18, color: INK }, paragraph: { spacing: { after: 80 } } },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } },
      titlePage: true,
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'SantéPlus Bénin  •  Guide des interfaces & procédures  •  Confidentiel', font: BFONT, size: 14, color: MUTED })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER, space: 4 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ children: [PageNumber.CURRENT], font: BFONT, size: 14, color: MUTED }),
            new TextRun({ text: '  —  SantéPlus Bénin', font: BFONT, size: 14, color: MUTED }),
          ],
        })],
      }),
    },
    children: [

      // ── COUVERTURE ──────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: 'SantéPlus Bénin', font: HFONT, size: 44, bold: true, color: TEAL_DARK })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: 'Plateforme digitale de mutuelle / assurance santé', font: BFONT, size: 22, color: MUTED })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: 'GUIDE DES INTERFACES & PROCÉDURES', font: BFONT, size: 26, bold: true, color: TEAL, characterSpacing: 40 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: 'Parcours de soins  •  Prescriptions  •  Tiers payant  •  Gestion assurance', font: BFONT, size: 18, color: MUTED })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 600 },
        shading: { type: ShadingType.CLEAR, fill: LIGHT },
        children: [new TextRun({ text: 'À l’attention de la Direction Générale, de la Direction Technique et des équipes métier\npour validation : ce qui est implémenté, comment ça marche, quoi ajuster', font: BFONT, size: 18, color: INK })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: `Version 1.1  •  ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}  •  Ref. GUIDE-INTERFACES-001`, font: BFONT, size: 16, color: MUTED })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Document confidentiel — usage interne', font: BFONT, size: 14, italics: true, color: MUTED })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // ── SOMMAIRE (Word génère auto via les Heading) ─────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Sommaire', font: HFONT, size: 28, bold: true, color: TEAL_DARK })] }),
      p('Le sommaire est généré automatiquement par Word à partir des titres. Dans Word : Références → Table des matières → Mettre à jour la table.', { muted: true, italic: true }),
      p('Astuce : Ctrl+clic sur une entrée pour naviguer directement à la section.', { muted: true, italic: true }),

      // ── 1. OBJET & MÉTHODE ──────────────────────────────────────────────
      h1('1  —  Objet du document & méthode de validation'),
      p('Ce guide décrit, interface par interface, ce que fait chaque écran, les options qu’il offre et la procédure exacte à suivre. Il sert de support de revue : vous pouvez annoter directement ce document (mode Révision de Word) pour indiquer ce qui manque, doit être corrigé ou ajouté.'),
      h3('Comment valider'),
      bullet('Parcourez chaque section dans l’ordre : le flux est présenté dans l’ordre chronologique du parcours de soins.', ''),
      bullet('Pour chaque page, vérifiez : les champs affichés, les boutons proposés, les contrôles automatiques et les messages d’erreur.', ''),
      bullet('Notez vos retours dans la grille du chapitre 14 ou en commentaires Word (Insertion → Nouveau commentaire).', ''),
      bullet('Les captures conceptuelles sont intentionnellement schématiques : l’interface réelle (http://localhost:5173 en local) fait foi pour le rendu exact.', ''),
      note('Conventions : [QR] = jeton QR opaque ; FCFA = montants entiers ; les statuts en MAJUSCULES sont les valeurs techniques affichées avec un badge couleur.'),

      // ── 2. CARTOGRAPHIE ─────────────────────────────────────────────────
      h1('2  —  Cartographie des rôles & accès'),
      p('La plateforme compte 6 rôles opérationnels. Chaque rôle ne voit que les données et actions strictement nécessaires à sa mission (principe du moindre privilège).'),
      table(
        ['Rôle', 'Qui ?', 'Espace', 'Données visibles'],
        [
          ['Assuré / Bénéficiaire', 'Particulier ou salarié + ayants droit', '/app', 'Ses contrats, garanties, plafonds, consultations, ordonnances, délivrances, factures, timeline complète de ses dossiers'],
          ['Médecin / Prescripteur', 'Personnel habilité d’une clinique/hôpital', '/prestataire (prescrire)', 'Patients de son établissement : motif, diagnostic, prescriptions qu’il a créées'],
          ['Pharmacie', 'Personnel officine partenaire', '/prestataire (délivrer)', 'Ordonnances à délivrer, produits prescrits, couverture nécessaire — pas le dossier médical complet'],
          ['Laboratoire / Imagerie', 'Techniciens', '/prestataire (délivrer)', 'Examens prescrits uniquement'],
          ['Gestionnaire assurance', 'Back-office assureur', '/admin', 'Tous les dossiers, contrats, factures, plafonds consommés, anomalies — pas le contenu médical modifiable'],
          ['Administrateur plateforme', 'Super admin', '/admin + config', 'Tout + produits, partenaires, rôles, audit, paramètres'],
        ],
        [2100, 2200, 2100, 2600],
      ),
      h3('Entreprise : cas particulier'),
      p('L’entreprise est un souscripteur (compte COMPANY_ADMIN sur /entreprise), pas un soignant. Elle ne voit jamais le détail médical de ses salariés : uniquement des agrégats (ex. sinistralité globale) et des données administratives (cotisations, mouvements). Le cloisonnement est contrôlé côté API : toute tentative d’accès au détail médical renvoie « Accès restreint ».', { muted: false }),
      note('Multi-utilisateurs par établissement : un administrateur d’établissement (ex. Clinique Mahouna) peut créer des comptes pour son personnel (médecin, infirmier, caissier, facturation) depuis /prestataire/personnel, avec suspension et reset de mot de passe.'),

      // ── 3. ESPACE ASSURÉ ────────────────────────────────────────────────
      h1('3  —  Espace Assuré  (/app)  —  13 entrées de menu'),
      p('Objectif : permettre à l’assuré (et à ses ayants droit) de suivre son parcours de soins de bout en bout sans appeler un gestionnaire.', { italic: true, muted: true }),
      h2('3.1  Tableau de bord  (/app)'),
      p('Vue d’ensemble en 3 stat-cards (Contrat / Validité / Statut) + alertes + 2 colonnes.'),
      table(['Bloc', 'Contenu affiché', 'Options / Actions', 'Source des données'],
        [
          ['Contrat', 'Numéro, produit, statut (badge couleur)', '—', 'Contract'],
          ['Validité', 'Début → fin, jours restants', 'Renouveler maintenant (si ≤ 30 j)', 'Contract.startDate/endDate + calcul'],
          ['Demandes récentes', '4 dernières : réf., date soins, montant, statut', 'Tout voir → /app/remboursements', 'Claim'],
          ['Établissements proches', '3 plus proches (Cotonou par défaut)', 'Annuaire →', 'Provider (tri haversine si géoloc)'],
          ['Carte d’assuré', 'Bandeau sombre avec CTA', 'Voir ma carte → /app/carte', 'Contract.cardToken'],
        ], [2200, 3200, 2200, 1400]),
      h2('3.2  Ma couverture — Mon contrat  (/app/contrat)'),
      p('Fiche contrat + plafonds restants par garantie (barre de progression, reste/illimité) + échéancier des cotisations.'),
      table(['Élément', 'Options', 'Procédure'],
        [
          ['Statut', 'Actif / Suspendu / Expiré… (badge)', '—'],
          ['Plafonds', 'Reste par catégorie (indicateur visuel)', '— (calcul : plafond − éligible consommé dans l’année d’anniversaire)'],
          ['Échéances', 'En attente / En retard / Payée', 'Si PAIEMENT EN ATTENTE : choisir le moyen (MOCK/FedaPay/CinetPay) → Payer → contrat ACTIVÉ'],
          ['Renouveler', 'Bouton si ≤ 30 j', 'POST /contracts/:id/renew → nouvelle échéance'],
        ], COL3),
      h2('3.3  Carte d’assuré  (/app/carte)'),
      bullet('Affiche : titulaire, n° assuré (MEM-…), n° contrat (CTR-…), validité, produit + QR code SVG.', ''),
      bullet('Le QR encode {"t":"jeton_32hex"} — jeton opaque, aucune donnée perso. Régénération possible (ancien jeton immédiatement invalide).', ''),
      bullet('Usage : présenté au prestataire qui le scanne (caméra ou saisie) pour vérification serveur.', ''),
      h2('3.4  Ordonnances  (/app/ordonnances)  —  NOUVEAU'),
      p('Liste de toutes les ordonnances du patient et de ses ayants droit. Chaque ligne : n° ORD-…, statut, validité, prescripteur.'),
      table(['Statut', 'Signification', 'Options pour l’assuré'],
        [
          ['ACTIVE', 'Délivrable — quantité restante > 0 et dans la fenêtre de validité', 'Détail & QR · Imprimer l’ordonnance'],
          ['PARTIALLY_EXECUTED', 'Partiellement délivrée — reste à délivrer', 'Idem'],
          ['EXECUTED', 'Entièrement exécutée', 'Consultation seule'],
          ['EXPIRED / CANCELLED', 'Périmée ou annulée par le prescripteur', 'Aucune délivrance possible'],
        ], COL3),
      note('Renouvellements : si l’ordonnance est renouvelable (ex. 2×), le médecin peut prolonger la validité et remettre deliveredQty à 0 — l’assuré voit le compteur renouvellementsUsed / renewalsAllowed.'),
      h2('3.5  Consultations  (/app/consultations)'),
      p('Historique des consultations : référence CON-…, motif, diagnostic, praticien, date. Lien vers l’ordonnance générée le cas échéant.'),
      h2('3.6  Mes soins — Dossiers de soins  (/app/soins)  —  NOUVEAU, CŒUR DU SYSTÈME'),
      p('Agrège un épisode complet : consultation → prescription → délivrance(s) → prise en charge → facturation. Chaque dossier porte une référence DOS-… et une timeline horodatée.'),
      table(['Bloc du dossier', 'Contenu', 'Procédure'],
        [
          ['En-tête', 'Référence DOS-…, statut OPEN, dates, patient', '—'],
          ['Consultation', 'Motif, diagnostic, praticien', '— (créée par le médecin)'],
          ['Ordonnance', 'Numéro, lignes, QR', 'Imprimer'],
          ['Délivrance', 'Produits délivrés, montants, substitution éventuelle', '—'],
          ['Prise en charge', 'Estimation : couvert / reste à charge', '—'],
          ['Timeline', 'CONSULTATION_CREATED → PRESCRIPTION_CREATED → DELIVERY_CREATED → CLAIM_AUTHORIZED…', 'Filtrage par rôle : l’entreprise ne voit pas le médical'],
        ], [2200, 3400, 3400]),
      h2('3.7  Remboursements  (/app/remboursements)'),
      p('Deux modes coexistent désormais :'),
      bullet('Remboursement classique : l’assuré photographie sa facture (POST /claims multipart) → estimation → file gestionnaire (approbation/refus) → paiement.', ''),
      bullet('Tiers payant via ordonnance : aucune action de l’assuré — la prise en charge est créée côté prestataire et apparaît automatiquement dans ses prises en charge.', ''),
      h2('3.8  Autres entrées assuré'),
      table(['Entrée', 'Rôle', 'À vérifier'],
        [
          ['Ayants droit', 'Ajout conjoint/enfant selon règles produit (âge max, quota)', 'Règle du quota maxBeneficiaries par produit'],
          ['Réseau de soins', 'Recherche q/type/ville + « Autour de moi » (géoloc)', 'Tri distance + badge Tiers payant'],
          ['Paiements', 'Historique cotisations', 'Statut par échéance'],
          ['Documents', 'Contrat, certificat PDF, attestation', 'Génération PDF (pdfkit) — vérifiez les mentions légales'],
          ['Notifications', 'In-app + e-mail/SMS/WhatsApp (selon config)', 'Routage par sujet (NOTIFY_*_TOPICS)'],
          ['Profil', 'Coordonnées, mot de passe', 'Chiffrement nationalIdEnc (AES-256-GCM)'],
        ], [2300, 3300, 3400]),

      // ── 4. ESPACE MÉDECIN ─────────────────────────────────────────────
      h1('4  —  Espace Médecin / Prescripteur  (/prestataire — permission provider.prescribe)'),
      p('Réservé aux utilisateurs habilités (médecin, infirmier prescripteur). Le pharmacien/caissier sans cette permission ne voit pas ces pages.', { muted: true, italic: true }),
      h2('4.1  Consultations  (/prestataire/consultations)'),
      table(['Option', 'Détail', 'Contrôles'],
        [
          ['Enregistrer une consultation', 'Champs : n° assuré/QR, motif, diagnostic, praticien, spécialité — bouton Enregistrer', 'Contrat du patient doit être ACTIF (sinon 400)'],
          ['Liste', 'Référence CON-…, patient, praticien, motif, date', 'Filtre par q (motif, nom patient)'],
        ], COL3),
      h2('4.2  Ordonnances  (/prestataire/ordonnances)'),
      table(['Option', 'Détail', 'Procédure'],
        [
          ['Scanner une ordonnance', 'QR ou n° ORD-… → affiche patient, validité, lignes avec remaining', 'GET /provider/prescriptions/scan — gère EXPIRED / EXECUTED'],
          ['Nouvelle ordonnance', 'Depuis une consultation (pré-rempli) ou standalone : n° assuré, lignes (médicament/acte, quantité, prix, posologie, durée), validité (jours), renouvellements', 'POST /provider/prescriptions → n° ORD-… + QR — dossier de soins créé/mis à jour'],
          ['Liste', 'Toutes les ordonnances de l’établissement', 'Filtre statut (ACTIVE, PARTIALLY_EXECUTED…)'],
          ['Détail', 'QR imprimable, lignes avec délivré/restant, boutons Renouveler / Annuler / Imprimer', 'Renouvellement : deliveryQty remis à 0, validUntil +30 j, renewalsUsed++'],
        ], COL3),
      note('Traçabilité : chaque prescription porte prescriberUserId + prescriberName — une pharmacie ne peut jamais créer une ordonnance (403).'),

      // ── 5. ESPACE PHARMACIE ───────────────────────────────────────────
      h1('5  —  Espace Pharmacie  (/prestataire — Délivrances)'),
      h2('5.1  Délivrer une ordonnance  (/prestataire/delivrances)'),
      p('Flux imposé par le métier : ordonnance d’abord, délivrance ensuite. Le système refuse toute délivrance sans prescription valide lorsque l’acte l’exige.'),
      table(['Étape', 'Action du pharmacien', 'Contrôle système'],
        [
          ['1. Charger', 'Scanner le QR ordonnance ou saisir le n° ORD-…', 'Ordonnance ACTIVE/PARTIALLY_EXECUTED, non expirée, patient trouvé'],
          ['2. Lignes', 'Pour chaque ligne : quantité à délivrer ≤ remaining, note de substitution si produit différent', 'Reste disponible vérifié ligne par ligne'],
          ['3. Envoyer', 'Confirmer la délivrance', '→ contrat ACTIF, garantie PHARMACY, plafond restant, taux ; création Delivery + Claim THIRDPARTY (DEL-…, TPE-…) + dossier mis à jour'],
          ['4. Résultat', 'Voir : total, couvert, reste à charge', 'Estimation du moteur (taux, franchise, plafond)'],
        ], COL3),
      note('Délivrance partielle : le pharmacien peut ne délivrer que 2/3 lignes ; le reste reste disponible pour une autre pharmacie/laboratoire. Une fois quantity épuisée → prescription EXECUTED.'),
      h2('5.2  Règles configurables par acte'),
      table(['Acte (exemple)', 'Prescription', 'Accord préalable', 'Effet si manquant'],
        [
          ['Paracétamol (OTC)', 'Non', 'Non', 'Délivrance directe autorisée'],
          ['Amoxicilline', 'Oui', 'Non', 'Bloqué : « Aucune prescription valide trouvée »'],
          ['Échographie', 'Oui', 'Non', 'Bloqué'],
          ['Bloc opératoire', 'Oui', 'Oui', 'Bloqué + autorisation gestionnaire requise'],
        ], COL4),
      p('Ces drapeaux se paramètrent par acte (Act.requiresPrescription / requiresPriorAuth) et peuvent être surchargés par produit. Le moteur applique la règle de l’acte.', { muted: true, italic: true }),

      // ── 6. AUTRES PRESTATAIRES ────────────────────────────────────────
      h1('6  —  Laboratoire / Imagerie / Clinique / Hôpital'),
      p('Même parcours que la pharmacie, adapté à la spécialité : la prescription porte un actId LABORATORY / SPECIALIZED / HOSPITALIZATION. Le laboratoire voit uniquement les examens qui le concernent (filtre par catégorie).'),
      table(['Établissement', 'Particularité', 'À vérifier'],
        [
          ['Laboratoire', 'Examens à jeun, résultats à transmettre', 'Prescription LABORATORY requise'],
          ['Imagerie', 'Devis, autorisation préalable fréquente', 'Act.requiresPriorAuth contrôlé par le seuil thirdPartyAuthThreshold (défaut 150 000 FCFA)'],
          ['Clinique/Hôpital', 'Admission, hospitalisation, chirurgie : demande d’autorisation via Claim AUTH_REQUIRED → décision gestionnaire', 'Suivi facturation provisoire → finale'],
          ['Optique/Dentaire', 'Devis + fréquence de renouvellement', 'Plafonds spécifiques (ex. optique 100 000 FCFA)'],
        ], COL3),

      // ── 7. TIERS PAYANT ───────────────────────────────────────────────
      h1('7  —  Tiers payant — deux circuits coexistent'),
      table(['Circuit', 'Quand', 'Qui crée la prise en charge', 'Calcul'],
        [
          ['Direct (ex. consultation)', 'Acte sans prescription requise', 'Le prestataire saisit l’acte → estimation immédiate', 'Taux/plafond du produit'],
          ['Sur ordonnance (pharmacie, labo…)', 'Acte avec requiresPrescription', 'La délivrance crée automatiquement le Claim THIRDPARTY lié à l’ordonnance', 'Idem, mais filtré par la prescription'],
        ], [2300, 2500, 3200, 2000]),
      h2('Circuit générique (legacy)  —  /prestataire/nouvelle → /provider/thirdparty/initiate + /confirm'),
      p('Utilisé pour les consultations directes. Pour la pharmacie, ce circuit est désormais bloqué sans ordonnance : « Aucune prescription valide trouvée pour cette prestation » (400).'),

      // ── 8. ESPACE PRESTATAIRE — VUE D'ENSEMBLE ───────────────────────
      h1('8  —  Espace Prestataire — vue d’ensemble'),
      table(['Entrée de menu', 'Route', 'Qui y a accès', 'Statut'],
        [
          ['Tableau de bord', '/prestataire', 'Tous PROVIDER', 'KPIs : patients/jour, facturé, à recevoir, encaissé + activité récente'],
          ['Vérifier un assuré', '/prestataire/verifier', 'provider.verify', 'QR + n° assuré + n° contrat — plafonds temps réel'],
          ['Consultations', '/prestataire/consultations', 'provider.prescribe', 'Liste + création'],
          ['Ordonnances', '/prestataire/ordonnances', 'provider.prescribe', 'Liste + scan QR + détail + renouvellement + impression'],
          ['Délivrances', '/prestataire/delivrances', 'provider.thirdparty', 'Scan ordonnance → délivrance + calcul TP'],
          ['Nouvelle prise en charge', '/prestataire/nouvelle', 'provider.thirdparty', 'Circuit direct (consultation)'],
          ['Prises en charge', '/prestataire/prises', 'provider.thirdparty', 'Historique THIRDPARTY avec facturation'],
          ['Paiements', '/prestataire/paiements', 'provider.thirdparty', 'À recevoir / encaissé / à facturer'],
          ['Mon établissement', '/prestataire/etablissement', 'provider.staff (admin)', 'Édition limitée (horaires, téléphone)'],
          ['Personnel', '/prestataire/personnel', 'provider.staff', 'Multi-comptes par établissement'],
          ['Dossiers de soins', '/prestataire/dossiers', 'provider.thirdparty', 'Agrège consultation→prescription→délivrance→facture'],
        ], [2800, 2200, 2200, 1800]),

      // ── 9. ESPACE ENTREPRISE ─────────────────────────────────────────
      h1('9  —  Espace Entreprise  (/entreprise)'),
      p('Aucun accès médical détaillé — uniquement agrégats et administratif.', { muted: true, italic: true }),
      table(['Page', 'Options', 'Contrôles'],
        [
          ['Tableau de bord', 'Salariés couverts, contrats, échéances, sinistralité agrégée', '—'],
          ['Salariés', 'Ajout manuel + import CSV (rapport ligne par ligne, doublons)', 'Détection email/téléphone/identité'],
          ['Contrat collectif', 'Souscription produit COMPANY + échéancier', 'Un seul contrat GROUP actif à la fois'],
          ['Dossiers de soins', 'Masqués — seul le gestionnaire assurance voit le médical', 'assertVisible lève « Accès restreint »'],
        ], COL3),

      // ── 10. ESPACE ASSUREUR / ADMIN ───────────────────────────────────
      h1('10  —  Espace Assureur / Gestionnaire & Admin  (/admin)'),
      h2('Dashboard & pilotage'),
      p('Portefeuille (assurés, entreprises, contrats), production (cotisations, produits), prestations (consultations, délivrances), financier (engagé / pris en charge / payé), qualité (taux de rejet, anomalies).'),
      h2('Autorisations préalables'),
      table(['File', 'Action gestionnaire', 'Effet'],
        [
          ['En attente (AUTH_REQUIRED, tiers payant)', 'Autoriser (→ AUTHORIZED, notif prestataire) / Demander infos / Refuser', 'Le prestataire peut confirmer'],
          ['Délivrance (même file via delivery)', 'idem', 'Le pharmacien voit « Autorisée » puis confirme'],
        ], COL3),
      h2('Contrôle factures'),
      p('Le gestionnaire compare facture vs contrat/garantie/prescription/autorisation/plafonds. Alertes : « Facture 150 k mais autorisation 100 k » · « Acte sans prescription » · « Quantité dépassée ».'),
      h2('Produits & conventions'),
      p('Chaque produit définit : garanties (taux, plafonds, franchises), règles bénéficiaires, carence, tarifs. Chaque Act/Medication a ses drapeaux requiresPrescription / requiresPriorAuth configurables par l’admin.'),

      // ── 11. DOSSIER DE SOINS — TRANSVERSE ─────────────────────────────
      h1('11  —  Dossier de soins — objet fédérateur (CareRecord)'),
      p('Référence DOS-YYYY-… qui chaînone : CareRecord → Consultation → Prescription (→ lignes) → Delivery (→ lignes) → Claim (THIRDPARTY, prise en charge). Chaque création ajoute un CareRecordEvent (CONSULTATION_CREATED → PRESCRIPTION_CREATED → DELIVERY_CREATED → CLAIM_AUTHORIZED…).'),
      h3('Timeline'),
      p('Accessible via GET /care-records/:id/timeline, filtrée par rôle (l’entreprise ne voit que les métadonnées non médicales). L’assuré y retrouve toute son histoire : consultation Dr X (motif, diagnostic) → ordonnance ORD-… (QR, validité) → délivrance DEL-… (produits, substitution) → montants (couvert / reste à charge) → facture.'),
      h3('Règles de visibilité (§28)'),
      table(['Acteur', 'Voit dans le dossier', 'Ne voit PAS'],
        [
          ['Assuré', 'Tout son dossier', 'Les dossiers d’autres patients'],
          ['Médecin', 'Ses consultations + ses prescriptions + suivi délivrance', 'Dossiers d’autres établissements'],
          ['Pharmacie', 'Ordonnance + lignes restantes + garanties/pharmacie nécessaires', 'Diagnostic complet, autres prescriptions'],
          ['Assureur', 'Touts les dossiers (gestion)', '— (ne modifie pas le médical)'],
          ['Entreprise', 'Agrégat sinistralité uniquement', 'Aucun détail médical individuel'],
        ], COL3),
      h3('Sécurité'),
      p('RBAC granulaire (12 clés, ex. provider.prescribe), chiffrement nationalIdEnc (AES-256-GCM), QR = jeton opaque, cloisonnement par établissement (user.providerId), audit complet (AuditLog + CareRecordEvent).'),

      // ── 12. NOTIFICATIONS & RECHERCHE ─────────────────────────────────
      h1('12  —  Notifications & recherche'),
      table(['Canal', 'Quand', 'Exemple'],
        [
          ['In-app (toujours)', 'Chaque événement', 'Ordonnance créée · Délivrance enregistrée · Autorisation accordée'],
          ['E-mail (HTTP API)', 'Sujets configurables (NOTIFY_EMAIL_TOPICS)', 'Idem — via Brevo/SendGrid-like'],
          ['SMS / WhatsApp', 'Sujets critiques (NOTIFY_SMS_TOPICS + WA_TOKEN)', 'Paiement confirmé · Contrat suspendu'],
        ], COL3),
      p('Recherche globale par assuré / n° contrat / ordonnance / prise en charge / facture — résultats filtrés par permission.', { muted: true }),

      // ── 13. PARCOURS DE RÉFÉRENCE ─────────────────────────────────────
      h1('13  —  Parcours complet de référence (§43) — scénario validé'),
      p('Ce scénario est exécuté automatiquement à chaque seed et rejouable via l’API/Postman :', { muted: true, italic: true }),
      ...[
        '1. Consultation — Jean consulte le Dr Kouassi (motif : fièvre, toux)', 
        '2. Prescription — 2 médicaments + 1 analyse (validité 30 j, QR ORD-…)',
        '3. Pharmacie scanne le QR de l’ordonnance → vérifie patient, validité, lignes restantes',
        '4. Délivrance partielle — 2 médicaments délivrés, analyse laissée pour le labo (statut PARTIALLY_EXECUTED)',
        '5. Laboratoire délivre l’analyse restante → ordonnance EXECUTED',
        '6. Dossier DOS-… alimenté : 3 événements (consultation, prescription, 2 délivrances)',
        '7. Historique assuré : /care-records/mine + /prescriptions/mine + /consultations/mine affichent le dossier complet',
      ].map((t, i) => bullet(t, `Étape ${i + 1}`)),
      h3('Cas négatifs couverts (§44)'),
      table(['Situation', 'Réponse système', 'Message utilisateur'],
        [
          ['Sans ordonnance (pharmacie)', '400 Bad Request', 'Aucune prescription valide trouvée pour cette prestation.'],
          ['Ordonnance expirée (validUntil < now)', '400', 'Ordonnance expirée (valide jusqu’au …)'],
          ['Déjà entièrement exécutée', '400', 'Cette ordonnance a déjà été entièrement exécutée.'],
          ['Quantité > reste', '400', 'Quantité demandée (n) dépasse le reste disponible (m)'],
          ['Pharmacie crée une ordonnance', '403 Forbidden', 'Seul un prescripteur habilité peut créer une ordonnance'],
          ['Contrat inactif', '400', 'Contrat du patient inactif — délivrance impossible'],
          ['Autorisation préalable manquante', 'Statut AUTH_REQUIRED → bloque la confirmation', 'En attente de validation du gestionnaire'],
        ], [2800, 2200, 4000]),

      // ── 14. GRILLE DE VALIDATION ─────────────────────────────────────
      h1('14  —  Grille de validation — à compléter'),
      p('Cochez, corrigez ou commentez directement dans ce document (mode Révision). Chaque ligne devient une demande de modification priorisée.', { muted: true, italic: true }),
      (() => {
        const rows = [
          ['Parcours global', 'Le flux Assuré → Consultation → Ordonnance → Délivrance → Facturation est-il clair ?', '', ''],
          ['Rôles', 'La distinction médecin / pharmacie / labo / hôpital est-elle suffisante ou faut-il des sous-rôles ?', '', ''],
          ['Consultation', 'Champs motif/diagnostic/spécialité suffisants ?', '', ''],
          ['Ordonnance', 'Validité 30 j, renouvellements, QR : paramètres adaptés ?', '', ''],
          ['Délivrance partielle', 'Substitution avec note : processus conforme ?', '', ''],
          ['Autorisation préalable', 'Seuil tiers payant 150 000 FCFA : montant correct ?', '', ''],
          ['Catalogue actes', '14 actes seedés : manques ?', '', ''],
          ['Catalogue médicaments', '8 spécialités seedées : compléter ?', '', ''],
          ['Dossier de soins', 'Timeline compréhensible pour chaque rôle ?', '', ''],
          ['Menu assuré (17 items)', 'Trop chargé ? Faut-il regrouper ?', '', ''],
          ['Menu prestataire (12 items)', 'Ordre et intitulés pertinents ?', '', ''],
          ['Notifications', 'Canaux e-mail/SMS/WhatsApp : sujets corrects ?', '', ''],
          ['PDF (certificat, attestation)', 'Mentions légales suffisantes ?', '', ''],
          ['Sécurité', 'Chiffrement, QR opaque, cloisonnement : conforme à vos exigences ?', '', ''],
          ['Hors-ligne', 'Mode dégradé souhaité en cas de connexion faible ?', '', ''],
        ];
        return table(
          ['Domaine', 'Question de validation', 'Statut (OK / À corriger / À ajouter)', 'Commentaire'],
          rows,
          [1800, 3400, 2000, 1800],
        );
      })(),
      p('Statut : laissez vide = à discuter en revue. Utilisez les commentaires Word (Insertion → Nouveau commentaire) pour pointer un passage précis.', { muted: true, italic: true }),
      new Paragraph({
        spacing: { before: 300 },
        shading: { type: ShadingType.CLEAR, fill: LIGHT },
        children: [new TextRun({ text: 'Prochaine étape proposée : revue de 60 minutes avec la direction métier et technique — nous parcourons ce guide page par page et figeons les ajustements pour le pilote.', font: BFONT, size: 18, italics: true, color: TEAL_DARK })],
      }),

      // ── ANNEXE ─────────────────────────────────────────────────────────
      h1('Annexe  —  Matrice des permissions (extrait)'),
      table(
        ['Permission', 'SUPER_ADMIN', 'Assurance', 'Support', 'Médecin', 'Pharmacie', 'Membre'],
        [
          ['provider.prescribe', '✓', '—', '—', '✓', '—', '—'],
          ['provider.verify', '✓', '✓', '✓', '✓', '✓', '—'],
          ['provider.thirdparty', '✓', '✓', '—', '✓', '✓', '—'],
          ['provider.staff', '✓', '—', '—', '✓ (admin étab.)', '✓ (admin étab.)', '—'],
          ['products.manage', '✓', '✓', '—', '—', '—', '—'],
          ['claims.decide', '✓', '✓', '—', '—', '—', '—'],
        ],
        [2600, 1100, 1100, 1100, 1100, 1100, 1100],
      ),
      p('La matrice complète (12 clés) est éditable dans /admin/roles sans redéploiement.', { muted: true }),
    ],
    }],
  });

  Packer.toBuffer(doc).then(buffer => {
    const out = 'SantePlus-Guide-des-interfaces.docx';
    fs.writeFileSync(out, buffer);
    console.log('OK ->', out, `(${(buffer.length / 1024).toFixed(1)} Ko)`);
  });
