import * as path from 'path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Garde-fou : aucune route d'écriture ne doit renvoyer de chaîne brute.
 *
 * Nest sérialise une chaîne en `text/plain` : le client web (`res.json()` dans
 * apps/web/src/api.ts) échoue alors sur « Réponse non JSON de l'API » **alors
 * que la ressource a bien été créée** — l'utilisateur voit une erreur, la ligne
 * existe en base. C'est exactement le bug de POST /admin/products (corrigé en
 * renvoyant `{ id }`).
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

/** Vrai si le type de retour est `string`, y compris dans une union. */
function isBareString(typeText: string): boolean {
  return unwrapPromise(typeText)
    .split('|')
    .map(part => part.trim())
    .includes('string');
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
        if (!isBareString(type)) continue;

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
        });
      }
    });
  }
  return { findings, inspected };
}

const describeFinding = (f: Finding) => `@${f.verb}('${f.route}') → ${f.className}.${f.handler} renvoie ${f.type} (${f.file})`;

describe('Routes d’écriture — le corps de réponse doit être du JSON', () => {
  it(
    'aucune route @Post/@Put/@Patch/@Delete ne renvoie de chaîne brute',
    () => {
      const { findings, inspected } = rawStringWriteHandlers(createProgram());
      // Plancher, pas égalité stricte : une route ajoutée ne doit pas faire
      // échouer ce test. En revanche un scan devenu aveugle (filtre cassé,
      // décorateurs non résolus) tombe sous ce seuil et se signale.
      expect(inspected, 'aucune route d’écriture inspectée — le scan est aveugle').toBeGreaterThanOrEqual(100);
      const liste = findings.map(describeFinding);
      expect(
        liste,
        'Ces routes renvoient une chaîne : Nest la sérialise en text/plain et le client web ' +
          '(res.json()) échoue sur « Réponse non JSON » alors que la ressource est créée. ' +
          'Renvoyez un objet JSON, par exemple { id }. Route(s) fautive(s) :\n' +
          liste.join('\n'),
      ).toEqual([]);
    },
    // Marge large : sous forte contention (toute la suite en parallèle), la
    // construction du programme TS peut dépasser la minute.
    300_000,
  );

  it(
    'le détecteur attrape bien une chaîne et ignore un objet (contre-épreuve)',
    () => {
      // Contre-épreuve : sans elle, un détecteur devenu muet (évolution de l'API
      // de décorateurs, filtre cassé) passerait au vert sans rien vérifier.
      const program = createProgram({
        fileName: path.join(API_ROOT, '.sonde.controller.ts'),
        content: `
          class Sonde {
            @Post('sonde-chaine')
            async chaine(): Promise<string> { return 'abcdef012345'; }

            @Post('sonde-objet')
            async objet(): Promise<{ id: string }> { return { id: 'abcdef012345' }; }

            @Post('sonde-union')
            async union(): Promise<string | null> { return null; }
          }
        `,
      });
      const { findings, inspected } = rawStringWriteHandlers(program, path.join(API_ROOT, '.sonde.controller.ts'));
      expect(inspected).toBe(3);
      expect(findings.map(describeFinding)).toEqual([
        "@Post('sonde-chaine') → Sonde.chaine renvoie Promise<string> (.sonde.controller.ts)",
        "@Post('sonde-union') → Sonde.union renvoie Promise<string | null> (.sonde.controller.ts)",
      ]);
    },
    300_000,
  );
});
