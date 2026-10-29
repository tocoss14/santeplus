#!/usr/bin/env node
/**
 * Vérification des garde-fous « formules » sur une API déployée (production).
 *
 * Ce que le script contrôle, dans l'ordre :
 *   1. le jeton admin est valide et porte bien `products.manage` ;
 *   2. l'API déployée sert réellement les champs du forfait et du rachat de
 *      carence (includedAdults, includedChildren, pricePerAdditionalAdultAnnual,
 *      pricePerChildAnnual, carenceBuyoutRate) — un déploiement antérieur aux
 *      migrations 20261027000000 renverrait `undefined` et le front calculerait
 *      à l'aveugle ;
 *   3. le catalogue en place est cohérent : aucune formule individuelle ACTIVE
 *      n'inclut des personnes dans la cotisation de base en facturant 0 FCFA
 *      au-delà (la fuite corrigée par la migration) ;
 *   4. les garde-fous d'écriture refusent vraiment, en production :
 *      - POST d'une grille à adultes inclus non tarifés   → 400 attendu ;
 *      - POST d'une grille à enfants inclus non tarifés   → 400 attendu ;
 *      - PATCH d'UN SEUL champ qui casse l'état fusionné  → 400 attendu
 *        (c'est la règle `assertForfaitPricing({ ...existant, ...dto })`) ;
 *      et, après refus, la formule visée n'a pas bougé d'un franc.
 *
 * Sécurité des écritures : les deux POST utilisent un code de sonde unique et
 * `status: 'DRAFT'` (jamais visible du public). Si un POST réussissait malgré
 * tout — garde-fou absent — la ligne est archimée immédiatement et signalée en
 * [FAIL]. De même, si un PATCH incohérent était accepté, la valeur d'origine
 * est réécrite dans la foulée et le rapport indique si la restauration a tenu.
 * `--read-only` saute entièrement la section 4 : audit sans aucune mutation.
 *
 * Authentification, deux voies :
 *   - identifiants (recommandé) : le script se connecte lui-même sur
 *     POST /api/auth/login et fabrique un accessToken frais. Plus de jeton
 *     statique à renouveler toutes les 12 h ; c'est la voie utilisée en CI.
 *   - jeton existant (--token), pour un diagnostic ponctuel avec un jeton
 *     déjà en main. Il est prioritaire s'il est fourni.
 *
 * Usage :
 *   node scripts-dev/verify-products-prod.mjs --email admin@… --password "…"
 *   node scripts-dev/verify-products-prod.mjs --email … --password … --read-only
 *   node scripts-dev/verify-products-prod.mjs --token "$TOKEN" --api http://localhost:4000
 *
 * Options : --email, --password, --token/-t, --api, --timeout <ms>,
 * --read-only, --help.
 * Les identifiants viennent aussi de ADMIN_EMAIL / SB_ADMIN_EMAIL et
 * ADMIN_PASSWORD / SB_ADMIN_PASSWORD ; le jeton de ADMIN_TOKEN / SB_ADMIN_TOKEN.
 * Codes de sortie : 0 tout est vert, 1 au moins un [FAIL], 2 arrêt anticipé
 * (connexion, permissions ou réseau).
 *
 * Aucune dépendance : fetch/AbortSignal natifs (Node ≥ 18.17).
 */

const DEFAULTS = {
  api: process.env.SANTEPLUS_API ?? process.env.API_URL ?? 'https://santeplus-api-kp5t.onrender.com',
  timeoutMs: 90_000, // Render s'endort : le premier appel peut dépasser 60 s
};

const MARK = { ok: '[ OK ]', fail: '[FAIL]', warn: '[ !! ]', info: '[INFO]' };
const compteurs = { ok: 0, fail: 0, warn: 0 };

function ligne(statut, libelle, detail) {
  console.log(`${MARK[statut]} ${libelle}`);
  if (detail) {
    for (const l of String(detail).split('\n')) console.log(`       ${l}`);
  }
  if (statut in compteurs) compteurs[statut]++;
}

function section(titre) {
  console.log(`\n── ${titre} ${'─'.repeat(Math.max(2, 66 - titre.length))}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────── arguments
function parseArgs(argv) {
  const opts = {
    ...DEFAULTS,
    token: process.env.ADMIN_TOKEN ?? process.env.SB_ADMIN_TOKEN ?? '',
    email: process.env.ADMIN_EMAIL ?? process.env.SB_ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? process.env.SB_ADMIN_PASSWORD ?? '',
    readOnly: false,
  };
  const reste = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' || a === '-e') opts.email = argv[++i] ?? '';
    else if (a === '--password' || a === '-p') opts.password = argv[++i] ?? '';
    else if (a === '--token' || a === '-t') opts.token = argv[++i] ?? '';
    else if (a === '--api') opts.api = argv[++i] ?? '';
    else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]) || DEFAULTS.timeoutMs;
    else if (a === '--read-only') opts.readOnly = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!a.startsWith('-')) reste.push(a);
  }
  // Jeton en argument positionnel : `… --token X` reste la forme recommandée
  // (un jeton en position 1 finit dans l'historique du shell de la même façon).
  if (!opts.token && reste[0]) opts.token = reste[0];
  opts.api = String(opts.api || DEFAULTS.api).replace(/\/+$/, '');
  // On tolère le collage de l'en-tête complet « Authorization: Bearer … ».
  opts.token = String(opts.token || '').trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '');
  // Un secret collé depuis un gestionnaire peut trainer un espace ou un saut de ligne.
  opts.email = String(opts.email || '').trim();
  opts.password = String(opts.password || '').trim();
  return opts;
}

// ─────────────────────────────────────────────────────────────────── client
function makeClient({ api, token, timeoutMs }) {
  return async function call(method, path, body) {
    const init = {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let dernier;
    for (let essai = 1; essai <= 3; essai++) {
      const debut = Date.now();
      try {
        const res = await fetch(api + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        const texte = await res.text();
        let json = null;
        try {
          json = texte ? JSON.parse(texte) : null;
        } catch {
          json = null;
        }
        return { status: res.status, json, texte, ms: Date.now() - debut };
      } catch (err) {
        dernier = err;
        const raison = err?.name === 'TimeoutError' ? `délai de ${timeoutMs} ms dépassé` : err?.message ?? String(err);
        if (essai === 3) break;
        console.log(`       réseau : ${raison} — nouvelle tentative ${essai + 1}/3 (réveil Render ?)`);
        await sleep(3000 * essai);
      }
    }
    throw new Error(`appel ${method} ${path} impossible : ${dernier?.message ?? dernier}`);
  };
}

/**
 * Connexion par identifiants : POST /api/auth/login → accessToken.
 *
 * Pourquoi ici et pas dans le workflow : le jeton d'accès dure 12 h, un secret
 * statique finit donc toujours par être périmé et la sonde devient décorative.
 * Le compte de service se connecte à chaque exécution, le jeton vit le temps du
 * run et n'est jamais imprimé ni exporté.
 *
 * Erreurs distinguées, parce qu'elles n'appellent pas le même geste :
 *   400/401 → identifiants refusés (mot de passe tourné, compte supprimé) ;
 *   403     → compte sans droits (products.manage = SUPER_ADMIN) ou désactivé ;
 *   réseau  → Render endormi, on retente avant de conclure.
 * Le corps de la réponse est le même gabarit que les autres appels :
 * { accessToken, refreshToken, user }, les cookies httpOnly étant ignorés ici.
 */
async function login({ api, email, password, timeoutMs }) {
  if (!email || !password) throw new Error('identifiants incomplets (email et mot de passe requis)');
  let dernier;
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const res = await fetch(`${api}/api/auth/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texte = await res.text();
      let json = null;
      try {
        json = texte ? JSON.parse(texte) : null;
      } catch {
        json = null;
      }
      if (res.status === 401 || res.status === 400) {
        throw new Error(`identifiants refusés (HTTP ${res.status}) : ${texteErreur({ status: res.status, json, texte }).slice(0, 200)}`);
      }
      if (res.status === 403) {
        throw new Error(`compte sans accès (HTTP 403) : ${texteErreur({ status: res.status, json, texte }).slice(0, 200)} — il faut un SUPER_ADMIN actif (products.manage).`);
      }
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`connexion impossible (HTTP ${res.status}) : ${texteErreur({ status: res.status, json, texte }).slice(0, 200)}`);
      }
      const jeton = json?.accessToken;
      if (typeof jeton !== 'string' || jeton.length < 20) {
        throw new Error('réponse de connexion sans accessToken — API antérieure ou corps inattendu');
      }
      return { token: jeton, user: json.user ?? null };
    } catch (err) {
      // Un refus d'identifiants ou de droits ne se retente pas : c'est définitif.
      if (!estErreurReseau(err)) throw err;
      dernier = err;
      if (essai === 3) break;
      const raison = err?.name === 'TimeoutError' ? `délai de ${timeoutMs} ms dépassé` : err?.message ?? String(err);
      console.log(`       réseau : ${raison} — nouvelle tentative ${essai + 1}/3 (réveil Render ?)`);
      await sleep(3000 * essai);
    }
  }
  const echec = new Error(`connexion à ${api}/api/auth/login impossible : ${dernier?.message ?? dernier}`);
  echec.reseau = true;
  throw echec;
}

/** Le fetch a échoué avant toute réponse HTTP (DNS, TLS, timeout). */
function estErreurReseau(err) {
  return err?.reseau === true || err instanceof TypeError || err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

/**
 * Message d'erreur d'une réponse, tous gabarits confondus :
 * - BadRequestException(chaîne) du service → { statusCode, message } ;
 * - ZodPipe → { statusCode, message: 'Données invalides', errors: { formErrors } }.
 * Le message du garde-fou vit dans formErrors quand c'est le superRefine du
 * schéma qui refuse, et dans `message` quand c'est le service. On aplatit les
 * deux pour que la comparaison ne dépende pas du chemin emprunté.
 */
function texteErreur(res) {
  const j = res.json ?? {};
  const morceaux = [j.message, ...(Array.isArray(j.errors?.formErrors) ? j.errors.formErrors : [])];
  for (const v of Object.values(j.errors?.fieldErrors ?? {})) {
    if (Array.isArray(v)) morceaux.push(...v);
  }
  return morceaux.filter((m) => typeof m === 'string' && m.trim()).join(' | ') || (res.texte ?? '').slice(0, 400);
}

const FCFA = (n) => (n === null || n === undefined ? 'n/a' : new Intl.NumberFormat('fr-FR').format(n) + ' F');

const CHAMPS_FORFAIT = ['includedAdults', 'includedChildren', 'pricePerAdditionalAdultAnnual', 'pricePerChildAnnual'];

function grille(p) {
  return CHAMPS_FORFAIT.map((c) => p?.[c]).join('/');
}

/** Violation connue, identique à forfaitPricingIssue côté API (formules individuelles seulement). */
function violation(p) {
  if (p?.clientType === 'COMPANY') return null;
  if ((p?.includedAdults ?? 1) > 1 && (p?.pricePerAdditionalAdultAnnual ?? 0) <= 0) return 'adultes inclus sans supplément';
  if ((p?.includedChildren ?? 0) > 0 && (p?.pricePerChildAnnual ?? 0) <= 0) return 'enfants inclus sans supplément';
  return null;
}

// ────────────────────────────────────────────────────────────── vérification
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      'Usage : node scripts-dev/verify-products-prod.mjs --email <email> --password <mdp> [--api URL] [--read-only] [--timeout ms]\n' +
        '        node scripts-dev/verify-products-prod.mjs --token <accessToken> [--api URL] [--read-only]',
    );
    return 0;
  }
  if (!opts.token && !(opts.email && opts.password)) {
    ligne(
      'fail',
      'Identifiants manquants',
      'Passer --email <email> --password <mdp> (ou ADMIN_EMAIL / ADMIN_PASSWORD) pour que le script se connecte lui-même,\n' +
        'ou --token <accessToken> pour réutiliser un jeton déjà en main (12 h de validité).',
    );
    return 2;
  }

  console.log('Vérification des garde-fous « formules »');
  ligne('info', `API     : ${opts.api}`);
  ligne('info', `Mode    : ${opts.readOnly ? 'lecture seule (aucune écriture)' : 'complet (sondes d’écriture + restauration)'}`);
  ligne('info', `Date    : ${new Date().toISOString()}`);

  // 0 ── authentification : jeton fourni, sinon connexion et jeton frais
  const jetonFourni = Boolean(opts.token);
  if (!jetonFourni) {
    section('0. Connexion');
    try {
      const { token, user } = await login(opts);
      opts.token = token;
      const qui = user ? `${user.email ?? opts.email} (${user.role ?? 'rôle inconnu'})` : opts.email;
      ligne('ok', `Connexion réussie — ${qui}`, 'accessToken frais, non journalisé (durée du run seulement)');
    } catch (err) {
      // Deux causes très différentes : ne pas envoyer l'opérateur tourner un
      // mot de passe alors que le service est simplement injoignable.
      const reseau = estErreurReseau(err);
      ligne(
        'fail',
        'Connexion impossible',
        `${err?.message ?? err}\n→ ` +
          (reseau
            ? `API injoignable après 3 tentatives : vérifier ${opts.api}/api/health et l'état du service (Render endormi, panne, URL).`
            : 'vérifier le compte de service : SUPER_ADMIN actif (products.manage), mot de passe à jour.'),
      );
      return 2;
    }
  } else {
    ligne('info', 'Jeton fourni en argument : aucune connexion demandée');
  }

  const call = makeClient(opts);

  // 1 ── authentification et permissions
  section('1. Jeton et permissions');
  let liste;
  {
    const res = await call('GET', '/api/admin/products');
    if (res.status === 401 || res.status === 403) {
      ligne(
        'fail',
        `Jeton refusé (HTTP ${res.status})`,
        `${texteErreur(res)}\n` +
          (jetonFourni
            ? 'Jeton passé en argument : il a pu expirer (12 h) ou ne pas porter products.manage (SUPER_ADMIN ; INSURANCE_MANAGER ne l’a pas).'
            : 'Jeton fraîchement obtenu et déjà refusé : vérifier le rôle du compte de service (products.manage = SUPER_ADMIN) et l’horloge du serveur (JWT).'),
      );
      return 2;
    }
    if (res.status !== 200 || !Array.isArray(res.json)) {
      ligne('fail', `Lecture du catalogue admin impossible (HTTP ${res.status})`, texteErreur(res));
      return 2;
    }
    liste = res.json;
    ligne('ok', `Jeton accepté — ${liste.length} formules lisibles (${res.ms} ms)`);
  }

  const individuelles = liste.filter((p) => p.clientType !== 'COMPANY');
  const collectives = liste.filter((p) => p.clientType === 'COMPANY');
  ligne('info', `Répartition : ${individuelles.length} individuelle(s), ${collectives.length} collective(s)`);

  // 2 ── champs servis par l'API déployée
  section('2. Champs du forfait et du rachat servis par l’API');
  {
    const manquants = liste.filter((p) => CHAMPS_FORFAIT.some((c) => typeof p[c] !== 'number') || typeof p.carenceBuyoutRate !== 'number');
    if (manquants.length === 0) {
      ligne('ok', 'Les 5 champs (4 du forfait + carenceBuyoutRate) sont servis par /api/admin/products');
    } else {
      ligne(
        'fail',
        `${manquants.length} formule(s) sans les champs attendus`,
        manquants.map((p) => `${p.code} : ${CHAMPS_FORFAIT.filter((c) => typeof p[c] !== 'number').join(', ') || 'carenceBuyoutRate'}`).join('\n') +
          '\n→ l’API déployée est antérieure à la migration 20261027000000.',
      );
    }

    // Le public alimente le simulateur d'accueil : sans ces champs, la Landing
    // retombe sur « 1 adulte inclus » et affiche un tarif faux pour un foyer.
    const pub = await call('GET', '/api/products?clientType=INDIVIDUAL');
    if (pub.status === 200 && Array.isArray(pub.json)) {
      const fautives = pub.json.filter((p) => typeof p.includedAdults !== 'number' || typeof p.includedChildren !== 'number');
      if (fautives.length === 0) ligne('ok', `Le catalogue public expose le forfait (${pub.json.length} formules) — simulateur fiable`);
      else ligne('fail', `/api/products n’expose pas includedAdults/includedChildren sur ${fautives.length} formule(s)`, fautives.map((p) => p.code).join(', '));
    } else {
      ligne('warn', `/api/products indisponible (HTTP ${pub.status})`, texteErreur(pub));
    }
  }

  // 3 ── cohérence du catalogue en place
  section('3. Cohérence du catalogue en production (lecture seule)');
  {
    for (const p of individuelles) {
      const v = violation(p);
      const resume =
        `forfait ${p.includedAdults ?? 1} adulte(s) + ${p.includedChildren ?? 0} enfant(s) inclus ; ` +
        `suppléments ${FCFA(p.pricePerAdditionalAdultAnnual)}/adulte, ${FCFA(p.pricePerChildAnnual)}/enfant ; rachat carence ${p.carenceBuyoutRate ?? 0} %`;
      if (v) ligne('fail', `${p.code} — ${p.status} : ${v}`, resume);
      else ligne('ok', `${p.code} — ${p.status} : grille cohérente`, resume);
    }
    if (collectives.length) {
      ligne(
        'info',
        `${collectives.length} formule(s) collective(s) hors champ du garde-fou (cotisation par salarié)`,
        collectives.map((p) => `${p.code} : ${FCFA(p.basePremiumAnnual)}/salarié`).join(', '),
      );
    }
  }

  // 4 ── garde-fous d'écriture
  if (opts.readOnly) {
    section('4. Garde-fous d’écriture');
    ligne('info', 'Section sautée (--read-only) : aucune sonde de refus exécutée');
  } else {
    section('4. Garde-fous d’écriture (refus attendus)');
    const horodatage = Date.now().toString(36).toUpperCase();

    /** POST d'une grille incohérente : 400 attendu, message du garde-fou. */
    async function sondePost(nom, extra, motif) {
      const code = `QA${horodatage}${nom}`.slice(0, 20);
      const res = await call('POST', '/api/admin/products', {
        code,
        name: `Sonde garde-fou ${nom}`,
        clientType: 'INDIVIDUAL',
        basePremiumAnnual: 75_000,
        status: 'DRAFT',
        ...extra,
      });
      if (res.status === 400 && motif.test(texteErreur(res))) {
        ligne('ok', `POST refusé (${extra.includedAdults > 1 ? 'adultes' : 'enfants'} inclus non tarifés)`, `HTTP 400 — ${texteErreur(res).slice(0, 200)}`);
        return;
      }
      if (res.status >= 200 && res.status < 300) {
        // Garde-fou absent : la ligne existe. Elle est en DRAFT, on l'archive et
        // on la signale pour que l'opérateur la supprime.
        // POST /admin/products renvoie l'id en corps brut (pas de JSON), d'où le repli.
        const id = typeof res.json === 'string'
          ? res.json
          : res.json?.id ?? (/^[A-Za-z0-9_-]{6,}$/.test((res.texte ?? '').trim()) ? (res.texte ?? '').trim() : undefined);
        ligne('fail', `POST ACCEPTÉ à tort — une formule ${code} a été créée`, `id=${id ?? 'inconnu'} — archivage immédiat demandé. Vérifier le déploiement de la garde.`);
        if (id) {
          const arch = await call('PATCH', `/api/admin/products/${id}`, { status: 'ARCHIVED' });
          ligne(arch.status < 300 ? 'warn' : 'fail', arch.status < 300 ? `Sonde ${code} archivée (id ${id})` : `Archivage de ${code} impossible`, arch.status < 300 ? 'La ligne reste en base : à supprimer manuellement.' : texteErreur(arch));
        }
        return;
      }
      ligne('fail', `POST refusé mais pour une autre raison (HTTP ${res.status})`, texteErreur(res));
    }

    await sondePost('AD', { includedAdults: 3, pricePerAdditionalAdultAnnual: 0 }, /supplément par adulte/);
    await sondePost('EN', { includedChildren: 3, pricePerChildAnnual: 0 }, /supplément par enfant/);

    /**
     * PATCH d'un seul champ : le schéma partiel ne voit pas l'incohérence, c'est
     * le service qui juge sur l'état fusionné. C'est le chemin le plus fragile
     * d'un formulaire d'administration, donc celui qu'il faut sonder en prod.
     */
    async function sondePatch(champ, valeurCasse, motif, choisir) {
      const cible = individuelles.find(choisir);
      if (!cible) {
        ligne('warn', `Aucune formule à ${champ} > 0 tarifé : sonde PATCH ${champ} non applicable`, 'Le catalogue actuel ne permet pas de construire un état fusionné incohérent.');
        return;
      }
      const original = cible[champ];
      const res = await call('PATCH', `/api/admin/products/${cible.id}`, { [champ]: valeurCasse });
      if (res.status === 400 && motif.test(texteErreur(res))) {
        const apres = await call('GET', `/api/admin/products/${cible.id}`);
        const inchange = apres.status === 200 && apres.json?.[champ] === original;
        if (inchange) ligne('ok', `PATCH ${champ}=0 refusé sur ${cible.code} (état fusionné)`, `HTTP 400 — la valeur reste ${FCFA(original)}`);
        else ligne('fail', `PATCH ${champ}=0 refusé sur ${cible.code} mais la valeur a bougé`, `attendu ${original}, lu ${apres.json?.[champ]} — écriture partielle ?`);
        return;
      }
      if (res.status >= 200 && res.status < 300) {
        // La valeur d'origine est réécrite tout de suite : c'est une vraie
        // formule de production, on ne la laisse pas cassée.
        const retour = await call('PATCH', `/api/admin/products/${cible.id}`, { [champ]: original });
        const verif = await call('GET', `/api/admin/products/${cible.id}`);
        const restaure = verif.status === 200 && verif.json?.[champ] === original;
        ligne('fail', `PATCH ${champ}=0 ACCEPTÉ à tort sur ${cible.code}`, `Le garde-fou ne couvre pas les mises à jour partielles.`);
        ligne(restaure && retour.status < 300 ? 'warn' : 'fail', restaure ? `Valeur d’origine restaurée (${FCFA(original)})` : `RESTAURATION ÉCHOUÉE sur ${cible.code}`,
          restaure ? 'La formule est revenue à son tarif initial ; un audit log subsiste.' : `remettre ${champ} à ${original} à la main (HTTP ${retour.status} : ${texteErreur(retour)})`);
        return;
      }
      ligne('fail', `PATCH ${champ}=0 refusé mais pour une autre raison (HTTP ${res.status})`, texteErreur(res));
    }

    await sondePatch('pricePerAdditionalAdultAnnual', 0, /supplément par adulte/, (p) => (p.includedAdults ?? 1) > 1 && (p.pricePerAdditionalAdultAnnual ?? 0) > 0);
    await sondePatch('pricePerChildAnnual', 0, /supplément par enfant/, (p) => (p.includedChildren ?? 0) > 0 && (p.pricePerChildAnnual ?? 0) > 0);

    // Contrôle final : aucune sonde n'a laissé de trace dans le catalogue.
    const relecture = await call('GET', '/api/admin/products');
    if (relecture.status === 200 && Array.isArray(relecture.json)) {
      const residus = relecture.json.filter((p) => typeof p.code === 'string' && p.code.startsWith(`QA${horodatage}`) && p.status !== 'ARCHIVED');
      if (residus.length) ligne('fail', `${residus.length} sonde(s) encore active(s) dans le catalogue`, residus.map((p) => `${p.code} (${p.status})`).join(', '));
      else ligne('ok', 'Aucune sonde active laissée derrière (catalogue relu)');
    }
  }

  // ── bilan
  section('Bilan');
  const total = compteurs.ok + compteurs.fail;
  console.log(`${compteurs.ok}/${total} contrôles au vert` + (compteurs.warn ? `, ${compteurs.warn} avertissement(s)` : '') + (compteurs.fail ? `, ${compteurs.fail} ÉCHEC(S)` : ''));
  if (compteurs.fail === 0) {
    console.log(`Les garde-fous du forfait sont actifs sur ${opts.api}.`);
    return 0;
  }
  console.log(`Au moins un garde-fou ne tient pas sur ${opts.api} — voir les lignes [FAIL] ci-dessus.`);
  return 1;
}

/*
 * On pose `process.exitCode` au lieu d'appeler `process.exit()` : sur Node 24 /
 * Windows, tuer le process alors que les sockets keep-alive de fetch se ferment
 * déclenche un « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) » et
 * remplace le code de sortie par 127. Laisser l'event loop se vider donne le bon
 * code (quelques secondes, le temps que keep-alive expire).
 */
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`\n[FAIL] Vérification interrompue : ${err?.message ?? err}`);
    process.exitCode = 2;
  });
