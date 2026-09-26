# Chaîne OCR de l'acte de naissance — Bilan

*État au 26/09/2026 — commits `e1f38f8`…`8080d62`, tous poussés sur `origin/master`.*

## 1. Ce que fait la chaîne

L'abonnement membre exige l'acte de naissance. La chaîne **extrait automatiquement**
prénom, nom, date (et lieu, parents, n° d'acte) du document téléversé pour
pré-remplir la recopie, puis **vérifie** la recopie contre le profil et l'identité
saisie à l'étape 1. Elle n'est **jamais bloquante** : tout ce qui n'est pas un
succès d'extraction retombe sur la saisie manuelle, signalée à l'utilisateur.

```
Upload (PDF/JPEG/PNG/WebP, ≤10 Mo)
  ├─ PDF natif ────────── pdf-parse (couche texte)            ~0,2 s
  ├─ PDF scanné ───────── rasterisation images natives (PNG) ─┐
  └─ Image ────────────────────────────────────────────────────┤
                                                               ▼
                 Cascade image (par format, voir §3)
                               ▼
        Cache par sha256 du contenu (TTL 15 min, 16 entrées FIFO)
                               ▼
     Parseur FR tolérant (accents, casse, ponctuation, espaces collés)
                               ▼
   Pré-remplissage wizard → vérification (recopie ↔ profil ↔ étape 1)
```

### Orientation des scans pivotés
Un acte est **portrait** : une image **paysage** est presque toujours pivotée de
90/270°. Tesseract OSD (noyau `legacyCore`, worker dédié) détecte la rotation
horaire {0,90,180,270} ; l'image est redressée puis une seconde passe OCR
l'extrait. Calibré sur fixtures : D=90°→detect 270, D=180°→detect 180,
D=270°→detect 90 (confiance ~18/20 sur les 3).

### Verdict « acte illisible »
`extractData` renvoie `null` dès qu'un champ essentiel manque. Le wizard
**n'écrase pas** la recopie et affiche « Extraction automatique impossible sur ce
document : vérifiez attentivement votre recopie manuelle. »

## 2. Commits

| Commit | Contenu |
|---|---|
| `e1f38f8` | Extraction OCR (parser, route extract, wizard pré-rempli) |
| `334ce24` | PDF scannés (rasterizer « résolution native » via getOperatorList) |
| `19abd18` | E2E navigateur du pré-remplissage OCR |
| `54b9f2d` | Redressement des scans pivotés (OSD + seconde passe) |
| `f75678f` | E2E scan pivoté 90° |
| `4b49214` | E2E acte illisible (saisie manuelle préservée) |
| `4db15f5` | Note UI « extraction automatique impossible » |
| `8f2c79a` | Test unitaire du contrat `extractData → null` |
| `28becea` | Cache OCR par empreinte du contenu |
| `ec871d4` | Matrice d'orientation 180°/270° (fixtures paramétrées) |
| `ec27149` | Cascade économe (bande centrale sur scans paysage) |
| `18c095a` | Préchauffage des workers OCR/OSD au démarrage |
| `a1f8b88` | Observabilité (logs cache + cascade) |
| `66b037c` | Parser : espaces des étiquettes flexibles (« Néle ») |
| `8080d62` | CI (suite API + E2E à chaque push, schéma Prisma réparé) |

## 3. Performance (mesurée sur poste de dev, Windows, fixtures 1588×2406)

| Chemin | Cascade exécutée | Total |
|---|---|---|
| PDF natif | pdf-parse | **~0,2 s** |
| Acte droit (image portrait) | pleine passe | **~1,0 s** |
| Pivoté 90°/270° (paysage) | bande ~1,1 s + OSD ~1,1–1,3 s + redressée ~1,0–1,3 s | **~3,3–3,7 s** |
| Pivoté 180° (portrait) | pleine passe + OSD + redressée | **~3,8 s** |
| Acte illisible | pleine passe + OSD (rotation 0°) | **~2,1 s** |
| Re-soumission en cache | sha256 + Map.get | **~0,25 ms** |
| Boot worker OCR / OSD (masqué par préchauffage) | — | ~0,7–1,6 s chacun |

Règles de conception retenues (mesurées, pas théoriques) :
- **Bande centrale (40 %) uniquement en paysage** : une bande utile d'un acte
  portrait devrait couvrir ≥ 75 % de hauteur (sinon champs manquants) — aucun
  gain en portrait, perte de robustesse ; en paysage elle évite de payer une
  pleine passe (~2,3–2,7 s) sur du texte couché ;
- **Pleine passe en filet** : un acte paysage dont la bande échoue ET l'OSD
  restent possibles (cadrage exotique) — une seule pleine passe maximum ;
- **Cache sur le contenu** (pas le fileId) : le même fichier re-téléversé est
  servi sans re-OCR ; le verdict `null` est caché, les erreurs (transitoires)
  ne le sont pas ;
- **Rasterizer PNG sans perte** : un re-encodage JPEG brouille les glyphes fins
  après rotation (J lu I, persistant même à qualité 1 — chroma subsampling).
  Résolution native conservée (jamais de downscale OCR) ;
- **Préchauffage au boot** (`onModuleInit` fire-and-forget) : le premier
  utilisateur ne paie pas les workers.

## 4. Matrice de tests (3 niveaux)

### Unitaire API (vitest, pool `forks` — 58 fichiers verts, CI incluse)
- `birth-certificate-parser.spec.ts` (10) : labels FR, dates strictes (pas de
  rollover), fallback « NOM Prénom », ponctuation parasite, espaces collés ;
- `image-orientation.spec.ts` (11) : géométrie des rotations pixel par pixel,
  sérialisation PNG, bande centrale (centrage, fond blanc, borne 1 px),
  préchauffage silencieux — **sans worker natif en test** (mock tesseract.js) ;
- `birth-certificate-extract.spec.ts` (13) : contrat `extractData` — null sur
  acte illisible, champs exacts en miroir (anti-faux-positif), 180°/270°,
  échecs stockage non cachés, ownership/type refusés, cache (référence
  identique, contenu≠fileId), logs d'observabilité **sans fuite de contenu** ;
- `pdf-rasterizer.spec.ts` (2) : extraction d'images PNG à résolution native,
  `[]` sur PDF vectoriel.

### Preuve live (scripts-dev, 9 chemins — `✅` à chaque phase)
PDF natif, image, PDF scanné + {90°, 180°, 270°} × {image, PDF scanné} :
champs exacts attendus (Marie-Josée ADJOVI, 12/01/1990, Cotonou, 1234/C/1990).

### E2E navigateur (Playwright, 5 scénarios — ~40 s)
Pour chaque attachement : wizard complet jusqu'au paiement mock.
1. Scan droit (PDF image) → pré-remplissage observable (erreur volontaire
   corrigée par l'OCR) → vérification → devis → paiement ;
2–4. Scans pivotés 90°/180°/270° (PNG) → même parcours ;
5. Acte illisible → note d'échec affichée, recopie fausse **conservée**
   (aucun écrasement), correction manuelle → succès.

Fixtures générées par `scripts-dev/` (versionnés, hors dépôt sous `.freebuff/`) :
acte de base portrait A4, pivotées paramétrées par degrés, acte illisible
(dégradés + formes, aucun glyphe).

## 5. Observabilité (logs de production)

```
[birth-certificate] workers OCR préchauffés                      ← au boot
[birth-certificate] OCR cache MISS sha=a2a07104 mime=image/png verdict=champs latence=932ms
[birth-certificate] OCR cascade 2406x1588 bande=1044ms osd=270°:1107ms redressee=1020ms verdict=champs latence=3188ms
[birth-certificate] OCR cache HIT sha=a2a07104 verdict=champs latence=1ms
[birth-certificate] OCR pdf natif=184ms verdict=champs
[birth-certificate] OCR pdf raster+OCR latence=2348ms verdict=champs
```
Verdicts : `champs` (extraction complète) / `saisie-manuelle` (`null`).
**Confidentialité** : empreinte sha256 tronquée à 8 hex, temps, dimensions —
jamais de contenu (asserté par test). Pilotage possible : taux de HIT réel,
latence p95 par verdict, fréquence des rotations détectées.

## 6. Points d'attention

- **`performance.now()`** pour toutes les mesures (monotone, pas de Date.now) ;
- **Prisma** : le schéma n'accepte ni `--` ni `#` en commentaire (uniquement
  `//`) — `prisma validate` fait partie de la CI désormais ;
- **Windows/dev** : les workers natifs (tesseract legacy, pdf.js+canvas) ne
  doivent pas partager un process de test — vitest en pool `forks` ;
- **OSD best-effort** : seuil de confiance 3/20, fallback silencieux sur la
  première passe, jamais d'échec de requête ;
- **Extension** : pour un nouveau type de document OCR, réutiliser la cascade
  (`extractFromImage`) et le cache — le parser seul change.
