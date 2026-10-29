import * as path from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Garde-fou : aucune route d'écriture ne doit renvoyer de chaîne brute ni de
 * corps vide.
 *
 * Nest sérialise une chaîne en `text/plain` : le client web (`res.json()` dans
 * apps/web/src/api.ts) échoue alors sur « Réponse non JSON de l'API » **alors
 * que la ressource a bien été créée** — l'utilisateur voit une erreur, la ligne
 * existe en base. C'est exactement le bug de POST /admin/products (corrigé en
 * renvoyant `{ id }`).
 *
 * Un corps vide est plus sournois : le client reçoit `null` sans erreur, puis
 * casse sur `res.id` — ou ne rafraîchit rien tout en annonçant un succès.
 *
 * Le contrôle est statique (compilateur TypeScript) et non textuel : un service
 * peut renvoyer un identifiant sans annotation de type, ou au travers d'une
 * transaction Prisma, ce qu'aucun grep ne voit. Limite assumée : un handler
 * typé `any` échappe au scan (on ne peut pas deviner un type effacé).
 */

const API_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(API_ROOT, 'src');
const WRITE_VERBS = new Set(['Post', 'Put', 'Patch', 'Delete']);

type Finding = {
  file: string;
  className: string;
  handler: string;
  verb: string;
  route: string;
  type: string;
  /** `chaine` : text/plain illisible pour res.json(). `vide` : null silencieux. */
  kind: 'chaine' | 'vide';
};

/** Déballe `Promise<T>` / `Promise<Promise<T>>` sans deviner les types complexes. */
function unwrapPromise(typeText: string): string {
  let t = typeText.trim();
  for (;;) {
    if (!t.startsWith('Promise<') || !t.endsWith('>')) return t;
    const inner = t.slice('Promise<'.length, -1).trim();
    let depth = 0;
    for (const c of inner) {
      if (c === '<') depth++;
      else if (c === '>') depth--;
    }
    // `Promise<A<B>, C>` ou type tronqué : on ne tente pas de découper.
    if (depth !== 0) return t;
    t = inner;
  }
}

/** Types qui ne produisent aucun corps de réponse. */
const EMPTY_TYPES = new Set(['void', 'undefined', 'null', 'never']);

/**
 * Qualifie la réponse d'un handler d'écriture :
 * - `chaine` : le type contient `string` (y compris dans une union) ;
 * - `vide` : toutes les branches du type sont vides (void/undefined/null/never) ;
 * - `null` : corps JSON normal (objet, tableau, nombre…), rien à signaler.
 *
 * Une union `{ id: string } | null` reste un corps JSON : on n'exige pas que
 * toutes les branches soient vides, seulement qu'aucune ne porte de contenu.
 */
function responseKind(typeText: string): Finding['kind'] | null {
  const parts = unwrapPromise(typeText)
    .split('|')
    .map(part => part.trim());
  if (parts.includes('string')) return 'chaine';
  if (parts.every(part => EMPTY_TYPES.has(part))) return 'vide';
  return null;
}

/** Décorateurs d'un nœud (méthode ou paramètre), quelle que soit la version de TS. */
function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

/** Noms des décorateurs appelés, ex. ['Post', 'UseInterceptors']. */
function decoratorNames(node: ts.Node): string[] {
  return decoratorsOf(node)
    .map(d => d.expression)
    .filter(ts.isCallExpression)
    .map(call => call.expression.getText());
}

/**
 * Statistiques du corps du handler, sans descendre dans les callbacks : un
 * `return` à l'intérieur d'une transaction Prisma n'est pas un retour du handler.
 */
function bodyStats(body: ts.Block): { returns: number; endsWithThrow: boolean } {
  let returns = 0;
  const visit = (node: ts.Node) => {
    if (ts.isReturnStatement(node)) returns++;
    if (ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  const last = body.statements[body.statements.length - 1];
  return { returns, endsWithThrow: Boolean(last && ts.isThrowStatement(last)) };
}

function createProgram(extra?: { fileName: string; content: string }) {
  const configPath = path.join(API_ROOT, 'tsconfig.json');
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, API_ROOT);
  // `incremental: false` : pas de .tsbuildinfo écrit pendant les tests.
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false, composite: false };
  // Point d'entrée restreint à `src/` : les specs et le seed n'apportent aucune
  // route, et le programme suit de toute façon les imports nécessaires.
  const roots = parsed.fileNames.filter(f => path.resolve(f).startsWith(SRC_ROOT + path.sep));

  if (!extra) return ts.createProgram(roots, options);

  // Fichier virtuel : sert à prouver que le détecteur détecte encore.
  const target = path.resolve(extra.fileName);
  const host = ts.createCompilerHost(options);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    path.resolve(fileName) === target
      ? ts.createSourceFile(fileName, extra.content, languageVersion, true)
      : baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
  host.fileExists = fileName => path.resolve(fileName) === target || baseFileExists(fileName);
  host.readFile = fileName => (path.resolve(fileName) === target ? extra.content : baseReadFile(fileName));
  roots.push(target);
  return ts.createProgram(roots, options, host);
}

/**
 * Handlers @Post/@Put/@Patch/@Delete dont le type de retour effectif est `string`,
 * plus le nombre de handlers réellement inspectés (un scan qui ne voit aucune
 * route passerait au vert sans rien prouver).
 */
function rawStringWriteHandlers(program: ts.Program, only?: string): { findings: Finding[]; inspected: number } {
  const checker = program.getTypeChecker();
  const findings: Finding[] = [];
  let inspected = 0;

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = path.resolve(sourceFile.fileName);
    if (!fileName.endsWith('.controller.ts')) continue;
    if (only ? fileName !== path.resolve(only) : !fileName.startsWith(SRC_ROOT + path.sep)) continue;

    ts.forEachChild(sourceFile, node => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const decorators = ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []) : [];
        // Un décorateur est un nœud `Decorator` : l'appel @Post('…') est son expression.
        const calls = decorators
          .map(d => d.expression)
          .filter(ts.isCallExpression)
          .filter(d => WRITE_VERBS.has(d.expression.getText()));
        if (!calls.length) continue;
        inspected++;

        const signature = checker.getSignatureFromDeclaration(member);
        if (!signature) continue;
        const type = checker.typeToString(checker.getReturnTypeOfSignature(signature));
        const kind = responseKind(type);
        if (!kind) continue;

        if (kind === 'vide') {
          // Une route qui écrit elle-même la réponse (@Res → res.send) n'a pas de
          // corps sérialisé par Nest : CSV, PDF, flux binaires.
          const writesResponse = member.parameters.some(param => decoratorNames(param).includes('Res'));
          // 204 No Content est un contrat explicite, que le client gère déjà.
          const noContent = decoratorsOf(member).some(decorator => {
            if (!ts.isCallExpression(decorator.expression)) return false;
            const call = decorator.expression;
            if (call.expression.getText() !== 'HttpCode') return false;
            const arg = call.arguments[0];
            return Boolean(arg && ts.isNumericLiteral(arg) && arg.text === '204');
          });
          if (writesResponse || noContent) continue;
          // Un handler qui lève toujours (dernier statement `throw`, aucun return)
          // ne produit pas de corps : c'est un refus, pas une réponse vide.
          const { returns, endsWithThrow } = bodyStats(member.body);
          if (returns === 0 && endsWithThrow) continue;
        }

        const decorator = calls[0];
        const route = decorator.arguments.length && ts.isStringLiteral(decorator.arguments[0])
          ? decorator.arguments[0].text
          : '';
        findings.push({
          file: path.relative(API_ROOT, fileName).replace(/\\/g, '/'),
          className: node.name.text,
          handler: member.name.getText(sourceFile),
          verb: decorator.expression.getText(),
          route,
          type,
          kind,
        });
      }
    });
  }
  return { findings, inspected };
}

const describeFinding = (f: Finding) =>
  f.kind === 'vide'
    ? `@${f.verb}('${f.route}') → ${f.className}.${f.handler} renvoie un corps vide (${f.type}) (${f.file})`
    : `@${f.verb}('${f.route}') → ${f.className}.${f.handler} renvoie ${f.type} (${f.file})`;

const CONSIGNE =
  'Ces routes ne renvoient pas un corps JSON exploitable : une chaîne est sérialisée en text/plain ' +
  '(res.json() échoue sur « Réponse non JSON » alors que la ressource est créée), un corps vide ' +
  'donne `null` sans erreur et casse l’écran qui lit un champ. Renvoyez un objet JSON, ' +
  'par exemple { id }, ou déclarez explicitement un 204 sans contenu.';

describe('Routes d’écriture — le corps de réponse doit être du JSON', () => {
  it(
    'aucune route @Post/@Put/@Patch/@Delete ne renvoie de chaîne ni de corps vide',
    () => {
      const { findings, inspected } = rawStringWriteHandlers(createProgram());
      // Plancher, pas égalité stricte : une route ajoutée ne doit pas faire
      // échouer ce test. En revanche un scan devenu aveugle (filtre cassé,
      // décorateurs non résolus) tombe sous ce seuil et se signale.
      expect(inspected, 'aucune route d’écriture inspectée — le scan est aveugle').toBeGreaterThanOrEqual(100);
      const liste = findings.map(describeFinding);
      expect(liste, `${CONSIGNE}\nRoute(s) fautive(s) :\n${liste.join('\n')}`).toEqual([]);
    },
    // Marge large : sous forte contention (toute la suite en parallèle), la
    // construction du programme TS peut dépasser la minute.
    300_000,
  );

  it(
    'le détecteur attrape chaînes et corps vides, et laisse passer les cas légitimes (contre-épreuve)',
    () => {
      // Contre-épreuve : sans elle, un détecteur devenu muet (évolution de l'API
      // de décorateurs, filtre cassé) passerait au vert sans rien vérifier.
      const program = createProgram({
        fileName: path.join(API_ROOT, '.sonde.controller.ts'),
        content: `
          class Sonde {
            @Post('sonde-chaine')
            async chaine(): Promise<string> { return 'abcdef012345'; }

            @Post('sonde-union')
            async union(): Promise<string | null> { return null; }

            @Post('sonde-objet')
            async objet(): Promise<{ id: string }> { return { id: 'abcdef012345' }; }

            @Post('sonde-objet-null')
            async objetNull(): Promise<{ id: string } | null> { return null; }

            @Post('sonde-vide')
            async vide(): Promise<void> { await Promise.resolve(); }

            @Post('sonde-return-nu')
            async returnNu(): Promise<void> { if (Date.now() > 0) return; }

            @Post('sonde-jet')
            async jet(): Promise<void> { throw new Error('toujours'); }

            @Post('sonde-fichier')
            async fichier(@Res() res: any): Promise<void> { res.send('a;b'); }

            @Delete('sonde-sans-corps')
            @HttpCode(204)
            async sansCorps(): Promise<void> { await Promise.resolve(); }
          }
        `,
      });
      const { findings, inspected } = rawStringWriteHandlers(program, path.join(API_ROOT, '.sonde.controller.ts'));
      expect(inspected).toBe(9);
      expect(findings.map(describeFinding)).toEqual([
        "@Post('sonde-chaine') → Sonde.chaine renvoie Promise<string> (.sonde.controller.ts)",
        "@Post('sonde-union') → Sonde.union renvoie Promise<string | null> (.sonde.controller.ts)",
        "@Post('sonde-vide') → Sonde.vide renvoie un corps vide (Promise<void>) (.sonde.controller.ts)",
        "@Post('sonde-return-nu') → Sonde.returnNu renvoie un corps vide (Promise<void>) (.sonde.controller.ts)",
      ]);
    },
    300_000,
  );
});
