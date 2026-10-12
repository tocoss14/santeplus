/**
 * Audit d'accessibilité automatique (axe-core) des pages connectées — membre,
 * entreprise, admin, prestataire, prestataire mobile.
 *
 * Principe identique à landing-a11y.spec.ts, mais scénarios de connexion
 * (cookies HTTP-only) pour chaque rôle, puis scan de la page ciblée une fois
 * chargée. Un audit pareil pousse la page vers son arbre DOM connecté réel —
 * pas un squelette vide.
 *
 * Prérequis : `npm run dev` (API :4000 + Vite :3000) — voir playwright.config.ts.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { writeFileSync } from 'node:fs';
import { apiContext, registerMember, uid } from './helpers';

/**
 * Inscription d'une entreprise — crée le compte COMPANY_ADMIN qui accède à
 * /entreprise. Route réelle : POST /api/companies/register (il n'existe
 * AUCUN /auth/register-* ; le schéma attend companyName / city / contactName).
 */
async function registerCompany(email: string) {
  const ctx = await apiContext();
  try {
    const res = await ctx.post('/api/companies/register', {
      data: {
        companyName: 'Entreprise Test ' + uid(),
        city: 'Cotonou',
        email,
        password: 'Test1234!',
        contactName: 'Admin Test ' + uid(),
      },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`registerCompany ${res.status()} ${body}`);
    }
    return await res.json();
  } finally {
    await ctx.dispose();
  }
}

/**
 * Connexion PAR L'UI — indispensable pour un audit de page connectée.
 *
 * `loginAs()` d'helpers.ts ouvre un contexte API Playwright SÉPARÉ : ses
 * cookies httpOnly ne sont jamais dans le contexte du navigateur, et sont
 * détruits par dispose(). Avec lui, `page.goto('/app')` serait redirigé vers
 * /login et on auditerait la page de connexion en croyant auditer l'espace
 * membre — un faux vert. Ici le formulaire pose les cookies dans le vrai
 * contexte navigateur, comme un utilisateur.
 */
async function connexionUI(page: Page, email: string, password: string, espace: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await page.waitForURL(espace, { timeout: 30_000 });
}

const CHEMIN_RAPPORT = 'test-results/axe-internal.json';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Écarts connus et acceptés — documentés, jamais masqués.
 * Aucun aujourd'hui : tout est vert.
 */
const IGNORES: { id: string; motif: string }[] = [];

type EchecContraste = {
  cible: string;
  ratio: number;
  seuil: number;
  fg: string;
  bg: string;
  /** Raison pour laquelle axe n'avait pas pu trancher. */
  raisonAxe: string;
};

/* ------------------------------------------------------------------ */
/* Contraste WCAG                                                      */
/* ------------------------------------------------------------------ */

/** rgb(...) ou "r, g, b" → [r, g, b]. */
function versRgb(c: string): [number, number, number] {
  const n = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return [n[0], n[1], n[2]];
}

function luminance([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Ratio de contraste WCAG 2.x entre deux couleurs. */
export function contraste(fg: string, bg: string): number {
  const l1 = luminance(versRgb(fg));
  const l2 = luminance(versRgb(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Seuil AA : 4,5:1 en texte normal, 3:1 en grand texte (≥24px, ou ≥18,66px gras). */
function seuil(taille: number, gras: boolean): number {
  return taille >= 24 || (taille >= 18.66 && gras) ? 3 : 4.5;
}

/* ------------------------------------------------------------------ */
/* Échantillonnage pixel                                               */
/* ------------------------------------------------------------------ */

/**
 * Mesure le fond réellement peint SOUS LES GLYPHES, sans aucune heuristique.
 *
 * Principe : on capture l'élément deux fois — tel quel, puis avec le texte
 * rendu transparent — et on lit la couleur à la position exacte de chaque
 * glyphe. Le fond est donc celui que l'œil voit (dégradé, image, calque
 * semi-transparent, déjà composés par le navigateur), et le « pire cas » est
 * pris parmi les positions de glyphes, jamais parmi une couleur dominante.
 *
 * Contrairement aux approches par seuil de couleur, rien ici ne dépend d'un
 * paramètre à calibrer : pas de filtre d'anti-crénelage à deviner, pas de
 * risque de confondre un jambage de ligne voisine avec du fond.
 */
async function mesurerFond(
  page: Page,
  captureTexte: Buffer,
  captureFond: Buffer,
  fg: string,
): Promise<{ pire: string; dominante: string; clusters: number } | null> {
  return page.evaluate(
    async ({ b64Texte, b64Fond, couleurTexte }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64Texte;
      await img.decode();
      const toile = document.createElement('canvas');
      toile.width = img.width;
      toile.height = img.height;
      const ctx = toile.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, toile.width, toile.height).data;
      const L = toile.width * toile.height;
      const [fr, fgc, fb] = couleurTexte.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);

      // 1. Masque texte : un pixel appartient à un glyphe si et seulement si le
      //    texte a changé sa valeur entre les deux captures (A ≠ B). Exact par
      //    construction — contrairement à un test de couleur « proche du fg »,
      //    qui dépend du seuil et sous-compte les bords anti-crénelés selon le
      //    fond (le contraste est plus marqué sur blanc que sur gris).
      const imgFond = new Image();
      imgFond.src = 'data:image/png;base64,' + b64Fond;
      await imgFond.decode();
      const toileFond = document.createElement('canvas');
      toileFond.width = imgFond.width;
      toileFond.height = imgFond.height;
      const ctxFond = toileFond.getContext('2d');
      if (!ctxFond) return null;
      ctxFond.drawImage(imgFond, 0, 0);
      const df = ctxFond.getImageData(0, 0, toileFond.width, toileFond.height).data;
      if (df.length !== d.length) return null;

      const texte = new Uint8Array(L);
      let totalGlyphes = 0;
      for (let p = 0, i = 0; p < L; p++, i += 4) {
        if (
          Math.abs(d[i] - df[i]) +
            Math.abs(d[i + 1] - df[i + 1]) +
            Math.abs(d[i + 2] - df[i + 2]) >=
          12
        ) {
          texte[p] = 1;
          totalGlyphes++;
        }
      }
      if (totalGlyphes === 0) return null;

      const lum = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const lum2 = ([r, g, b]: [number, number, number]) =>
        0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
      const ratio = (a: [number, number, number], b: [number, number, number]) => {
        const l1 = lum2(a);
        const l2 = lum2(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const fgRgb: [number, number, number] = [fr, fgc, fb];

      // 2. À CHAQUE position de glyphe, on lit le fond de la 2e capture et on
      //    regroupe (quantifié à 8 : fusionne les paliers voisins d'un dégradé).
      const familles = new Map<string, { n: number; r: number; g: number; b: number }>();
      for (let p = 0, i = 0; p < L; p++, i += 4) {
        if (!texte[p]) continue;
        const cle = `${df[i] >> 3},${df[i + 1] >> 3},${df[i + 2] >> 3}`;
        const e = familles.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++;
        e.r += df[i];
        e.g += df[i + 1];
        e.b += df[i + 2];
        familles.set(cle, e);
      }

      // 3. PIRE ratio parmi les familles de couleurs de fond réellement peintes
      //    sous les glyphes — jamais la dominante, qui masquerait une tache
      //    illisible exactement là où l'œil lit.
      let pireCouleur = '';
      let pireRatio = Infinity;
      let dominanteCouleur = '';
      let dominanteN = 0;
      let clusters = 0;
      for (const e of familles.values()) {
        const moy: [number, number, number] = [
          Math.round(e.r / e.n),
          Math.round(e.g / e.n),
          Math.round(e.b / e.n),
        ];
        // La plus fréquente sert de comparaison : c'est la valeur qu'aurait
        // donnée l'ancienne méthode (couleur dominante du bloc).
        if (e.n > dominanteN) {
          dominanteN = e.n;
          dominanteCouleur = moy.join(',');
        }
        // Famille trop minoritaire = bruit de rendu, pas une zone de lecture.
        if (e.n < 16 || e.n / totalGlyphes < 0.05) continue;
        clusters++;
        const rr = ratio(fgRgb, moy);
        if (rr < pireRatio) {
          pireRatio = rr;
          pireCouleur = moy.join(',');
        }
      }
      // Toutes les familles minoritatives : on retient au moins la dominante.
      if (!pireCouleur) {
        if (!dominanteCouleur) return null;
        const [lr, lg, lb] = dominanteCouleur.split(',').map(Number);
        pireCouleur = dominanteCouleur;
        pireRatio = ratio(fgRgb, [lr, lg, lb]);
      }
      if (!Number.isFinite(pireRatio)) return null;

      return { pire: pireCouleur, dominante: dominanteCouleur || pireCouleur, clusters };
    },
    { b64Texte: captureTexte.toString('base64'), b64Fond: captureFond.toString('base64'), couleurTexte: fg },
  );
}

/** Mesure complète d'un élément : contraste réel rendu + seuil applicable. */
async function mesurerElement(page: Page, locateur: Locator) {
  // Hors du viewport (y > hauteur), Playwright produit une capture CLIP-ée
  // uniformément (une seule couleur) : le glyphe est « non mesurable » à tort.
  // NB : scrollIntoViewIfNeeded() NE scrollAIT PAS ici (tspan recharts :
  // l'ancêtre .recharts-wrapper a overflow:hidden, Chrome le considère
  // « visible en présentant le parent ») — seul un scrollIntoView explicite
  // centre l'élément et rend sa capture lisible.
  await locateur
    .evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }))
    .catch(() => {});

  const boite = await locateur.boundingBox();
  // Élément non rendu (0×0) : pas de contraste à juger.
  if (!boite || boite.width < 2 || boite.height < 2) return null;

  const styles = await locateur.evaluate(el => {
    const cs = getComputedStyle(el);
    return {
      fg: cs.color,
      taille: parseFloat(cs.fontSize),
      gras: parseInt(cs.fontWeight, 10) >= 700,
    };
  });

  // Capture 1 : l'élément tel qu'affiché → sert à repérer les glyphes.
  const captureTexte = await locateur.screenshot();

  // Capture 2 : le même élément avec le texte rendu transparent. Le fond y est
  // peint exactement tel qu'il apparaît réellement sous les glyphes (dégradés,
  // images et calques déjà composés par le navigateur).
  // Le texte SVG (recharts : <text fill="#666"><tspan>…</tspan>) est peint
  // avec `fill`, pas `color` : seul un remplacement — pas une addition — de
  // l'attribut fill par transparent atteint le glyphe (cf. sonde 11). NB : le
  // remplacement est en caractère générique par sécurité : si l'élément pointé
  // par axe porte le fill dans un descendant (le <tspan> d'un <text>), c'est
  // lui qu'on neutralise, pas son conteneur.
  const memoire = await locateur.evaluate(el => {
    const n = el as HTMLElement; // SVGElement inclus : .style existe aussi
    const cibleSVG = typeof (el as any).fill !== 'undefined' || n.namespaceURI?.includes('svg');
    const precedent = {
      color: n.style.color,
      remplissage: (n.style as any).webkitTextFillColor,
      fill: (n as SVGElement).style?.fill ?? '',
      fillAttr: cibleSVG ? n.getAttribute('fill') : null,
    };
    n.style.color = 'transparent';
    (n.style as any).webkitTextFillColor = 'transparent';
    if (cibleSVG) {
      (n as SVGElement).style.fill = 'transparent';
      n.setAttribute('fill', 'transparent');
      // Les enfants peints par eux-mêmes (tspan portant leur propre fill) :
      for (const c of Array.from(n.children)) (c as SVGElement).style?.setAttribute?.('fill', 'transparent');
    }
    return precedent;
  });
  let captureFond: Buffer;
  try {
    captureFond = await locateur.screenshot();
  } finally {
    // Toujours restaurer : un style laissé en place fausserait la suite du scan.
    await locateur.evaluate((el, precedent) => {
      const n = el as HTMLElement;
      n.style.color = precedent.color;
      (n.style as any).webkitTextFillColor = precedent.remplissage;
      if ((n as SVGElement).style) (n as SVGElement).style.fill = precedent.fill;
      if (precedent.fillAttr === null) n.removeAttribute('fill');
      else n.setAttribute('fill', precedent.fillAttr);
      for (const c of Array.from(n.children)) {
        const s = (c as SVGElement).style;
        if (s && s.fill === 'transparent') s.fill = '';
      }
    }, memoire);
  }

  const fond = await mesurerFond(page, captureTexte, captureFond, styles.fg);
  if (!fond) return null;

  return {
    fg: styles.fg,
    bg: `rgb(${fond.pire})`,
    // PIRE ratio parmi les couleurs de fond réellement peintes SOUS les
    // glyphes — jamais la dominante, qui masquerait une tache illisible.
    ratio: contraste(styles.fg, fond.pire),
    ratioDominante: contraste(styles.fg, fond.dominante),
    seuil: seuil(styles.taille, styles.gras),
  };
}

/**
 * Reprend la main sur les `color-contrast` que axe n'a PAS pu trancher
 * (message évoquant le fond) : dégradé, image de fond, calque semi-transparent.
 * Les autres motifs (« contenu trop court », « seulement des caractères non
 * textuels ») ne sont pas des questions de fond et sont laissés à axe.
 */
async function mesurerIncomplets(page: Page, resultats: AxeResults) {
  const incomplets = resultats.incomplete.filter(v => v.id === 'color-contrast');
  const echecs: EchecContraste[] = [];
  const mesures: {
    cible: string;
    ratio: number;
    /** Comparaison : le ratio qu'aurait donné l'ancienne méthode (couleur
        dominante). Conservé pour prouver que le pire cas est bien pris. */
    ratioDominante: number;
    seuil: number;
    fg: string;
    bg: string;
  }[] = [];

  for (const regle of incomplets) {
    for (const noeud of regle.nodes) {
      const raison = noeud.any[0]?.message ?? '';
      if (!/background color/i.test(raison)) continue;

      // `target` est un tableau de sélecteurs ; un entrée peut être un objet
      // (shadow DOM / cross-tree). On ne garde que les chaînes exploitables
      // par CSS, et on refuse plutôt que de mesurer le mauvais élément.
      const cible = noeud.target.map(t => (typeof t === 'string' ? t : JSON.stringify(t))).join(' → ');
      const selecteur = noeud.target.find((t): t is string => typeof t === 'string');
      if (!selecteur) {
        echecs.push({
          cible,
          ratio: 0,
          seuil: 4.5,
          fg: '?',
          bg: '?',
          raisonAxe: 'sélecteur non-CSS (shadow DOM) — non mesurable',
        });
        continue;
      }
      let mesure: Awaited<ReturnType<typeof mesurerElement>> = null;
      try {
        mesure = await mesurerElement(page, page.locator(selecteur).first());
      } catch {
        mesure = null;
      }
      // Un élément qu'on ne peut pas mesurer ne doit PAS passer en silence :
      // on l'annonce dans l'échec plutôt que de le compter comme vert.
      if (!mesure) {
        echecs.push({
          cible,
          ratio: 0,
          seuil: 4.5,
          fg: '?',
          bg: '?',
          raisonAxe: `non mesurable (${raison.slice(0, 80)})`,
        });
        continue;
      }

      mesures.push({ cible, ...mesure });
      if (mesure.ratio < mesure.seuil) {
        echecs.push({ cible, raisonAxe: raison.slice(0, 120), ...mesure });
      }
    }
  }

  return { echecs, mesures, nbIncomplets: incomplets.length };
}

/* ------------------------------------------------------------------ */
/* Scan complet                                                        */
/* ------------------------------------------------------------------ */

async function scan(page: Page, contexte: string) {
  const resultats = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const ignorees = new Set(IGNORES.map(i => i.id));
  const retenues = resultats.violations.filter(v => !ignorees.has(v.id));
  const contrastes = await mesurerIncomplets(page, resultats);

  // Rapport toujours écrit (dernier scan écrasé), ignorées comprises pour
  // qu'on puisse auditer ce qui a été délibérément écarté.
  writeFileSync(
    CHEMIN_RAPPORT,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        contexte,
        violations: retenues,
        ignorees: resultats.violations.filter(v => ignorees.has(v.id)).map(v => v.id),
        contraste: {
          reglesLaisseesParAxe: contrastes.nbIncomplets,
          echecs: contrastes.echecs,
          mesures: contrastes.mesures,
        },
      },
      null,
      2,
    ),
  );

  const bloquantes = retenues.filter(v => v.impact === 'critical' || v.impact === 'serious');
  const mineures = retenues.filter(v => v.impact !== 'critical' && v.impact !== 'serious');

  const resume = (v: (typeof resultats.violations)[number]) =>
    `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nœud(s)) : ${v.nodes[0]?.target.join(' ')}`;

  return {
    bloquantes: bloquantes.map(resume),
    mineures: mineures.map(resume),
    echecsContraste: contrastes.echecs.map(
      e => `${e.cible} → ${e.ratio.toFixed(2)}:1 (seuil ${e.seuil}) fg=${e.fg} bg=${e.bg} [${e.raisonAxe}]`,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test.describe('Accessibilité — pages connectées', () => {
  test('contrôle : le détecteur de contraste détecte bien un contraste insuffisant', async ({ page }) => {
    // Garde-fou du garde-fou : sans ce test, une régression du pipeline
    // (décodage PNG, canvas…) rendrait tous les autres tests verts à tort.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Élément synthétique aux couleurs connues : slate-600 sur slate-800
    // = 1,93:1 selon la formule WCAG, très en dessous du seuil de 4,5:1.
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'sonde-contraste-interne';
      d.style.cssText =
        'position:fixed;left:0;top:0;z-index:99999;padding:8px;font-size:14px;font-weight:400;background:#1e293b;color:#475569';
      d.textContent = 'Texte de contrôle délibérément illisible';
      document.body.appendChild(d);
    });

    const mesure = await mesurerElement(page, page.locator('#sonde-contraste-interne'));
    expect(mesure, 'la sonde doit être mesurable').not.toBeNull();
    expect(mesure!.ratio, 'contraste mesuré trop éloigné de la valeur théorique 1,93:1').toBeGreaterThan(1.5);
    expect(mesure!.ratio).toBeLessThan(2.2);
    expect(mesure!.seuil).toBe(4.5);
    expect(
      mesure!.ratio,
      'la sonde de contrôle doit être REJETÉE : le détecteur ne détecte plus rien',
    ).toBeLessThan(mesure!.seuil);
  });

  test('contrôle — pire cas : une tache non conforme sous les glyphes est détectée même si le fond dominant est conforme', async ({ page }) => {
    // LE biais qu'on vient de fermer, dans la configuration réelle de /cga mais
    // inversée : fond BLANC dominant (texte très sombre dessus = 17,85:1, vert)
    // et tache grise `slate-500` sur les 4 % de droite, pile sous la fin des
    // glyphes (même texte sur cette tache = 3,8:1 → sous le seuil de 4,5:1).
    // La mesure lit le fond À LA POSITION des glyphes → elle voit la tache ;
    // une méthode fondée sur la couleur dominante aurait dit vert.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'sonde-pire-cas-interne';
      d.style.cssText =
        'position:fixed;left:0;top:0;z-index:99999;width:400px;padding:8px;font-size:14px;font-weight:400;' +
        'text-align:right;color:#0f172a;' +
        'background:linear-gradient(to right,#ffffff 0%,#ffffff 96%,#64748b 96%,#64748b 100%)';
      d.textContent = 'Illisible ici';
      document.body.appendChild(d);
    });

    const mesure = await mesurerElement(page, page.locator('#sonde-pire-cas-interne'));
    expect(mesure, 'la sonde pire-cas doit être mesurable').not.toBeNull();

    // La fin du texte est posée sur la tache grise : c'est le pire cas.
    expect(
      mesure!.ratio,
      `le PIRE cas doit être retenu (mesuré ${mesure!.ratio.toFixed(2)}:1) — le texte est illisible sous les glyphes`,
    ).toBeLessThan(mesure!.seuil);
    expect(mesure!.ratio, 'le pire cas doit se situer vers 3,8:1 (tache slate-500)').toBeGreaterThan(2.5);

    // Et surtout : la couleur dominante (blanc) donnait un ratio vert — la
    // preuve que l'ancienne méthode aurait laissé passer cette illisibilité.
    expect(
      mesure!.ratioDominante,
      'contrôle interne invalide : la couleur dominante devait être CONFORME pour que le piège soit réel',
    ).toBeGreaterThan(mesure!.seuil);
  });

  // Pages membres — même politique : zéro violation acceptée.
  test('aucune violation critical/serious — /app (membre connecté)', async ({ page }) => {
    const email = `axe.membre.${Date.now()}@test.bj`;
    await registerMember(email);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connexionUI(page, email, 'Test1234!', /\/app/);

    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    // Laisser l'hydration async (probe + /auth/me + données du dashboard)
    // finir : on audite l'arbre DOM connecté réel, pas le squelette.
    await page.waitForLoadState('networkidle').catch(() => {});

    const { bloquantes, mineures, echecsContraste } = await scan(page, 'membre connecté — /app');
    expect(mineures, 'violations mineures à traiter (vide = tout vert)').toEqual([]);
    expect(bloquantes, 'violations bloquantes').toEqual([]);
    expect(echecsContraste, 'contrastes réellement rendus sous le seuil (ou non mesurables)').toEqual([]);
  });

  test('aucune violation critical/serious — /entreprise (entreprise connectée)', async ({ page }) => {
    const email = `axe.entreprise.${Date.now()}@test.bj`;
    await registerCompany(email);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connexionUI(page, email, 'Test1234!', /\/entreprise/);

    await page.goto('/entreprise');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const { bloquantes, mineures, echecsContraste } = await scan(page, 'entreprise connectée — /entreprise');
    expect(mineures, 'violations mineures à traiter (vide = tout vert)').toEqual([]);
    expect(bloquantes, 'violations bloquantes').toEqual([]);
    expect(echecsContraste, 'contrastes réellement rendus sous le seuil (ou non mesurables)').toEqual([]);
  });

  test('aucune violation critical/serious — /admin (admin connecté)', async ({ page }) => {
    // Compte seedé : il n'existe VOLONTAIREMENT aucune route d'auto-inscription
    // admin (cf. auth.controller — seul /auth/register est public). Même
    // convention que position-v2.spec.ts et skeleton-sweep.spec.ts.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connexionUI(page, 'gestionnaire@santeplus.bj', 'Demo1234!', /\/admin/);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const { bloquantes, mineures, echecsContraste } = await scan(page, 'admin connecté — /admin');
    expect(mineures, 'violations mineures à traiter (vide = tout vert)').toEqual([]);
    expect(bloquantes, 'violations bloquantes').toEqual([]);
    expect(echecsContraste, 'contrastes réellement rendus sous le seuil (ou non mesurables)').toEqual([]);
  });

  test('aucune violation critical/serious — /prestataire (prestataire connecté)', async ({ page }) => {
    // Compte seedé : l'inscription publique /providers/register crée un
    // Provider PENDING_APPROVAL SANS compte utilisateur — impossible de s'y
    // connecter ; le prestataire actif de référence est celui du seed.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connexionUI(page, 'prestataire@santeplus.bj', 'Demo1234!', /\/prestataire/);

    await page.goto('/prestataire');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const { bloquantes, mineures, echecsContraste } = await scan(page, 'prestataire connecté — /prestataire');
    expect(mineures, 'violations mineures à traiter (vide = tout vert)').toEqual([]);
    expect(bloquantes, 'violations bloquantes').toEqual([]);
    expect(echecsContraste, 'contrastes réellement rendus sous le seuil (ou non mesurables)').toEqual([]);
  });
});
