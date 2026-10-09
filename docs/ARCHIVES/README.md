# Archives — anciennes versions du guide d'interfaces

Ce dossier regroupe les versions antérieures du guide `SantePlus-Guide-des-interfaces.docx`.
La version de **référence en cours est la v1.5 (08 octobre 2026, Ref. GUIDE-INTERFACES-005)**,
située à la racine `docs/` sous le nom `SantePlus-Guide-des-interfaces.docx`.
Le v1.4 (05 sept 2026, GUIDE-INTERFACES-004) est conservé dans ce dossier (`SantePlus-Guide-des-interfaces-v1.4.docx`, md5 identique à l'ancienne référence).

| Fichier archivé | Version | Date | Ref | Pourquoi archivé |
|---|---|---|---|---|
| `SantePlus-Guide-des-interfaces (Réparé).docx` | v1.1 | 25 août 2026 | GUIDE-INTERFACES-001 | Plus ancienne version (nom "Réparé" trompeur — c'est la plus vieille, pas la plus récente). Contenu partiel (pas OHADA, PWA, GED, photos). |
| `SantePlus-Guide-des-interfaces-v1.2.docx` | v1.2 | 29 août 2026 | GUIDE-INTERFACES-002 | Version intermédiaire. Contenu partiel. |
| `SantePlus-Guide-des-interfaces-v1.4.docx` | v1.4 | 05 sept 2026 | GUIDE-INTERFACES-004 | **Doublon exact** de la version de référence (même taille, même contenu, même ref). |

## Corrections / points à aligner sur la prod — ✅ TOUTES APPLIQUÉES dans la v1.5 (2026-10-08)

Chaque point a été vérifié dans le code puis corrigé dans le docx de référence :

1. **Menu /app** → titre §3 "8 entrées de menu + notifications" + liste réelle dans l'intro §3 (Accueil, Mes soins, Mon contrat, Carte, Remboursements, Mon profil, Réseau, Distributeur — `AppLayout.tsx` MENUS.member ; les pages §3.4/§3.5 existent en routes mais pas en sidebar).
2. **Bundle PWA (§14.4)** → 86 722 o index + 164 589 o vendor + 406 274 o charts (build du 07/10/2026).
3. **Upload (§14.2)** → 8 Mo (StorageService) + 10 Mo acte de naissance (`birth-certificate.service.ts`).
4. **Rôles (§2)** → 6 confirmés (`ROLES` dans `common/permissions.ts`) + précision : Distributeur/provider.staff ne sont pas des rôles.
5. **Photos (§3.3)** → endpoints confirmés : POST **et** GET `/users/me/photo` et `/beneficiaries/:id/photo` (`users.controller.ts`).
6. **Permissions** → 38 clés (`PERMISSION_LABELS`), 37 éditables dans `/admin/roles` (`financial-model.admin` hors écran) — corrigé dans §11 ("12 clés") et l'Annexe ("14 clés").
7. **RetentionJob (§14.3)** → confirmé : cron `0 3 * * *` (03:00) ; seeds `retention.enabled=true`, 3650/3650/1095 j ; nuance ajoutée : purge factures non implémentée (pas de modèle Invoice).
8. **QR (§3.3)** → confirmé : `{"t":"<32 hex>"}` (`cardToken = secureToken(16)` → 16 octets = 32 hex, `cardQrPayload()`, test `format.spec.ts`).

Rapport de vérification : `.freebuff/guide-v15-report.txt` (11 checks, tous OK).

### Historique (corrections initialement listées, avant application)

- **Nombre d'entrées /app** : le guide indique "13 entrées de menu" (§3) alors que l'interface réelle a 8 entrées principales (Tableau de bord, Mon contrat, Carte, Ordonnances, Consultations, Mes soins / dossiers, Remboursements, Profil) + notifications. À corriger en "8 entrées principales + notifications".
- **Tailles de bundle PWA (§14.4)** : le guide cite "68k index + 164k vendor + 383k charts". Build actuelle (2026-10-07) : index 86 722 o, vendor 164 589 o, charts 406 274 o. À mettre à jour.
- **Limite upload** : le guide dit "8 Mo max" (§14.2, StorageService) mais l'upload d'acte de naissance autorise 10 Mo (birth-certificate.service.ts). La limite générale du StorageService est 8 Mo, les actes de naissance 10 Mo. À préciser.
- **Rôles** : le guide dit "6 rôles opérationnels" (§2) — correspond à SUPER_ADMIN, INSURANCE_MANAGER, SUPPORT_AGENT, COMPANY_ADMIN, MEMBER, PROVIDER. Vérifier si les rôles Distributor/providerStaff comptent comme rôles opérationnels supplémentaires.
- **Endpoint photo carte** (§3.3) : le guide cite `/users/me/photo` et `/beneficiaries/:id/photo` — à vérifier contre les endpoints réels du profile/photo.
- **Matrice des permissions** (§17/annexe) : le guide v1.4 indique "14 clés" (v1.1/Réparé disait "12 clés"). À vérifier le nombre réel dans /admin/roles.
- **RetentionJob (§14.3 RGPD)** : la job quotidienne 03:00 de rétention n'a pas été vérifiée dans le code — à confirmer.
- **QR carte d'assuré (§3.3)** : le guide dit que le QR encode `{"t":"jeton_32hex"}` (jeton opaque). À vérifier le format réel du QR dans DigitalCard.

## Versions de référence

- **Référence actuelle :** `docs/SantePlus-Guide-des-interfaces.docx` (**v1.5**, 08/10/2026, GUIDE-INTERFACES-005).
- **Version PDF prête à diffuser (DG) :** `docs/SantePlus-Guide-des-interfaces.pdf` (10 pages, sommaire à jour, exporté le 08/10/2026).
- **Où on en est (état prod + secrets + R2 + rollback) :** `docs/RUNBOOK-CONTINUITE.md` (2026-10-08).
- **Bugs/next :** `docs/BUG_WHAT_TO_FIX_NEXT.md`.
