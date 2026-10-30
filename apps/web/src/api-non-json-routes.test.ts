import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Garde-fou côté web : les helpers `api.get/post/patch/del` (apps/web/src/api.ts)
 * lisent le corps en texte puis le passent à `JSON.parse`. Appelés sur une route
 * qui renvoie un PDF, un CSV ou un flux binaire, ils échouent sur « Réponse non
 * JSON de l'API » — donc l'écran tombe alors que le fichier existe.
 *
 * Ces routes s'utilisent autrement : `window.open` / `fileUrl()` (ancre, <img>,
 * téléchargement). Le contrôle compare les appels du front aux handlers d'API
 * qui écrivent eux-mêmes la réponse (`@Res()`), déclarent un `Content-Type`
 * non JSON ou renvoient un Buffer.
 */

const WEB_SRC = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const API_SRC = path.join(REPO_ROOT, 'apps', 'api', 'src');

type ApiEndpoint = {
  /** Route normalisée : les paramètres deviennent « : ». */
  pattern: string;
  /** `pdf`, `csv`, `binaire`… pour un message lisible. */
  format: string;
  file: string;
  handler: string;
};

type WebCall = {
  method: string;
  pattern: string;
  file: string;
  line: number;
};

/** Un segment de paramètre (`:id`, `${id}`) devient « : » pour comparer. */
function normalizeRoute(route: string): string {
  return route
    .replace(/\?.*$/, '')
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith(':') || segment.startsWith('${') ? ':' : segment))
    .join('/');
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCalls(node: ts.Node): { name: string; args: readonly ts.Expression[] }[] {
  return decoratorsOf(node)
    .map(decorator => decorator.expression)
    .filter(ts.isCallExpression)
    .map(call => ({ name: call.expression.getText(), args: call.arguments }));
}

const HTTP_VERBS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

/** Chemin affiché dans les messages : relatif au dépôt pour un fichier réel. */
function displayPath(fileName: string): string {
  return path.isAbsolute(fileName) ? path.relative(REPO_ROOT, fileName).replace(/\\/g, '/') : fileName;
}

/**
 * `@Res({ passthrough: true })` n'existe que pour poser des en-têtes
 * (cookies d'auth) : Nest sérialise quand même la valeur retournée en JSON.
 * Sans cette distinction, les routes de connexion passeraient pour des
 * téléchargements de fichiers.
 */
function isPassthrough(arg: ts.Expression | undefined): boolean {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    prop =>
      ts.isPropertyAssignment(prop) &&
      prop.name.getText() === 'passthrough' &&
      prop.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );
}

/** Format lisible d'un Content-Type, ou null s'il reste du JSON. */
function nonJsonFormat(headerArgs: readonly ts.Expression[]): string | null {
  const [nameArg, valueArg] = headerArgs;
  if (!nameArg || !valueArg) return null;
  if (!ts.isStringLiteral(nameArg) || nameArg.text.toLowerCase() !== 'content-type') return null;
  const value = ts.isStringLiteral(valueArg) ? valueArg.text.toLowerCase() : '';
  if (!value) return null;
  if (value.includes('json')) return null;
  if (value.includes('csv')) return 'csv';
  if (value.includes('pdf')) return 'pdf';
  return 'texte';
}

/**
 * Handlers d'API qui ne produisent pas de JSON : `@Res()` (la route écrit la
 * réponse elle-même), `@Header('Content-Type', …)` non JSON, ou retour Buffer.
 */
export function apiNonJsonEndpoints(fileName: string, text: string): ApiEndpoint[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const endpoints: ApiEndpoint[] = [];

  ts.forEachChild(source, node => {
    if (!ts.isClassDeclaration(node)) return;
    const controller = decoratorCalls(node).find(d => d.name === 'Controller');
    const base = controller?.args[0] && ts.isStringLiteral(controller.args[0]) ? controller.args[0].text : '';

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.body) continue;
      const decorators = decoratorCalls(member);
      const verb = decorators.find(d => HTTP_VERBS.has(d.name));
      if (!verb) continue;

      const route = verb.args[0] && ts.isStringLiteral(verb.args[0]) ? verb.args[0].text : '';
      const writesResponse = member.parameters.some(param =>
        decoratorCalls(param).some(d => d.name === 'Res' && !isPassthrough(d.args[0])),
      );
      const headerFormat = decorators
        .filter(d => d.name === 'Header')
        .map(d => nonJsonFormat(d.args))
        .find(Boolean);
      const returnType = member.type?.getText() ?? '';
      const binaryReturn = /\b(Buffer|StreamableFile)\b/.test(returnType);
      if (!writesResponse && !headerFormat && !binaryReturn) continue;

      endpoints.push({
        pattern: normalizeRoute([base, route].filter(Boolean).join('/')),
        format: headerFormat ?? (returnType.includes('StreamableFile') ? 'binaire' : 'fichier'),
        file: displayPath(fileName),
        handler: member.name.getText(source),
      });
    }
  });
  return endpoints;
}

/** Pattern d'une route passée à `api.*` : littéral ou gabarit. */
function routePattern(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return normalizeRoute(expr.text);
  if (ts.isTemplateExpression(expr)) {
    let raw = expr.head.text;
    for (const span of expr.templateSpans) raw += ':' + span.literal.text;
    return normalizeRoute(raw);
  }
  return null;
}

/** Appels `api.get/post/patch/del('<route>')` d'un fichier du front. */
export function webApiCalls(fileName: string, text: string): WebCall[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const calls: WebCall[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === 'api'
    ) {
      const method = node.expression.name.text;
      const arg = node.arguments[0];
      if (['get', 'post', 'patch', 'del'].includes(method) && arg) {
        const pattern = routePattern(arg);
        if (pattern) {
          calls.push({
            method,
            pattern,
            file: displayPath(fileName),
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return calls;
}

/**
 * Même route ? Un segment « : » est un paramètre et vaut n'importe quelle
 * valeur : le front peut écrire `/contracts/abc/card-pdf` là où l'API déclare
 * `contracts/:id/card-pdf`.
 */
function sameRoute(callPattern: string, endpointPattern: string): boolean {
  const call = callPattern.split('/');
  const endpoint = endpointPattern.split('/');
  if (call.length !== endpoint.length) return false;
  return call.every((segment, i) => segment === endpoint[i] || segment === ':' || endpoint[i] === ':');
}

/** Appels qui visent une route non JSON — la liste doit rester vide. */
export function findViolations(calls: WebCall[], endpoints: ApiEndpoint[]): string[] {
  return calls
    .map(call => ({ call, endpoint: endpoints.find(endpoint => sameRoute(call.pattern, endpoint.pattern)) }))
    .filter((pair): pair is { call: WebCall; endpoint: ApiEndpoint } => Boolean(pair.endpoint))
    .map(({ call, endpoint }) =>
      `api.${call.method}('${call.pattern}') → ${endpoint.pattern} ` +
        `(${endpoint.file} :: ${endpoint.handler}) renvoie du ${endpoint.format} (${call.file}:${call.line})`,
    );
}

function filesUnder(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (accept(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// Pas seulement les `*.controller.ts` : FilesService porte elle-même son
// `@Controller()`, donc la route /files/:id/view vit dans un `.service.ts`.
const API_FILES = filesUnder(API_SRC, name => name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(name)).filter(
  file => fs.readFileSync(file, 'utf8').includes('@Controller('),
);
const WEB_FILES = filesUnder(WEB_SRC, name => /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name));

// Parsing paresseux : importé par vitest avant chaque test, inutile de payer
// l'analyse du front au chargement du module.
let scanned: { endpoints: ApiEndpoint[]; calls: WebCall[] } | null = null;
function scan() {
  if (!scanned) {
    scanned = {
      endpoints: API_FILES.flatMap(file => apiNonJsonEndpoints(file, fs.readFileSync(file, 'utf8'))),
      calls: WEB_FILES.flatMap(file => webApiCalls(file, fs.readFileSync(file, 'utf8'))),
    };
  }
  return scanned;
}

describe('Appels api.* — aucune route binaire ou texte', () => {
  it('les routes non JSON sont bien identifiées côté API (plancher anti-scan aveugle)', () => {
    const { endpoints, calls } = scan();
    const formats = new Set(endpoints.map(endpoint => endpoint.format));
    expect(endpoints.length, 'aucune route @Res détectée — le scan est aveugle').toBeGreaterThanOrEqual(5);
    expect([...formats]).toContain('fichier');
    // Le front doit rester lisible : un scan qui ne voit aucun appel ne prouve rien.
    expect(calls.length, 'aucun appel api.* détecté — le scan est aveugle').toBeGreaterThanOrEqual(50);
    // Le premier test paie l'analyse des sources (quelques secondes) : le
    // délai par défaut de vitest (5 s) est trop court sur un runner chargé.
  }, 120_000);

  it('aucun api.get/post/patch/del ne vise une route non JSON', () => {
    const { endpoints, calls } = scan();
    const violations = findViolations(calls, endpoints);
    expect(
      violations,
      'Ces appels passent par le client JSON alors que la route renvoie un fichier : ' +
        'res.json() échouera sur « Réponse non JSON ». Utilisez window.open / fileUrl() ' +
        'ou une ancre de téléchargement.\n' +
        violations.join('\n'),
    ).toEqual([]);
  });

  it('le détecteur distingue binaire et JSON (contre-épreuve)', () => {
    const controller = `
      class Sonde {
        @Get('documents/:id/certificate')
        async certificate(@Res() res: any) { res.send('pdf'); }

        @Get('admin/export')
        @Header('Content-Type', 'text/csv; charset=utf-8')
        async export() { return 'a;b'; }

        @Get('contracts/:id/card')
        async card() { return { id: 'x' }; }
      }
    `;
    const endpoints = apiNonJsonEndpoints('sonde.controller.ts', controller);
    expect(endpoints.map(e => `${e.pattern}|${e.format}`)).toEqual([
      'documents/:/certificate|fichier',
      'admin/export|csv',
    ]);

    const calls = webApiCalls(
      'sonde.tsx',
      [
        "void api.get('/documents/abc/certificate');",
        "void api.get(`/admin/export?from=2026-01-01`);",
        "void api.get('/contracts/abc/card');",
        "void api.post('/claims', {});",
      ].join('\n'),
    );
    expect(findViolations(calls, endpoints)).toEqual([
      "api.get('documents/abc/certificate') → documents/:/certificate (sonde.controller.ts :: certificate) renvoie du fichier (sonde.tsx:1)",
      "api.get('admin/export') → admin/export (sonde.controller.ts :: export) renvoie du csv (sonde.tsx:2)",
    ]);
  }, 120_000);
});
