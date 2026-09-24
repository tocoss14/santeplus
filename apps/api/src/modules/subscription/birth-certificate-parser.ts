/**
 * Parsing du texte brut OCR d'un acte de naissance → données structurées.
 *
 * Pur et déterministe (aucune I/O) : testable sans mock, réutilisable par
 * n'importe quel moteur d'extraction. L'OCR n'est jamais fiable à 100 % —
 * le parseur est volontairement tolérant et renvoie des champs partiels :
 * l'appelant décide quoi faire des champs manquants (fallback saisie manuelle).
 */

export interface ParsedBirthCertificate {
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  birthPlace?: string;
  parents?: string;
  documentNumber?: string;
  rawText: string;
}

/** Clé = variation tolérée dans le texte (accents, casse gérés séparément). */
const LABELS = {
  firstName: ['prénom', 'prenom', "prénoms", "prenoms", 'prenom(s)'],
  lastName: ['nom', 'nom de famille', 'patronyme'],
  birthDate: ['né le', 'ne le', 'date de naissance', 'né(e) le', 'ne(e) le'],
  birthPlace: ['né à', 'ne a', 'né(e) à', 'lieu de naissance'],
  parents: ['fils de', 'fille de', 'enfant de', 'parents'],
  documentNumber: ['n° acte', 'no acte', 'numéro d\'acte', 'acte n°', 'registre'],
};

const MONTHS_FR: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeLine(line: string): string {
  return stripAccents(line).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Trouve la première étiquette présente dans la ligne — les PLUS LONGUES d'abord :
 *  « nom de famille » doit gagner sur « nom », « prénom » sur « nom » (contenu dedans). */
function matchLabel(normalized: string): { field: keyof typeof LABELS; label: string } | null {
  const pairs: Array<{ field: keyof typeof LABELS; label: string }> = [];
  for (const [field, labels] of Object.entries(LABELS) as [keyof typeof LABELS, string[]][]) {
    for (const label of labels) pairs.push({ field, label });
  }
  pairs.sort((a, b) => b.label.length - a.label.length);
  for (const p of pairs) {
    if (normalized.includes(stripAccents(p.label).toLowerCase())) return p;
  }
  return null;
}

/** Extrait la valeur après l'étiquette (l'OCR découpe parfois « : » en « . » ou l'omet). */
function valueAfter(line: string, label: string): string {
  const normalizedLine = stripAccents(line).toLowerCase();
  const idx = normalizedLine.indexOf(stripAccents(label).toLowerCase());
  if (idx < 0) return '';
  let rest = line.slice(idx + label.length);
  rest = rest.replace(/^[\s:.;•\-–—]+/, '');
  return rest.trim();
}

/** Construit une date UTC stricte : pas de rollover silencieux (32/1 → 1/2), bornes plausibles. */
function makeValidDate(y: number, m: number, d: number): Date | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  if (y < 1900 || y > new Date().getUTCFullYear()) return undefined;
  return dt;
}

/** Analyse « 12 janvier 1990 », « 12/01/1990 », « 1990-01-12 », « 1er février 2001 ». */
export function parseFrenchDate(input: string): Date | undefined {
  if (!input) return undefined;
  const text = stripAccents(input).toLowerCase().trim();

  // ISO : 1990-01-12
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return makeValidDate(+iso[1], +iso[2], +iso[3]);

  // Numérique : 12/01/1990 ou 12.01.1990
  const numeric = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (numeric) return makeValidDate(+numeric[3], +numeric[2], +numeric[1]);

  // Littérale française : « 12 janvier 1990 », « 1er février 2001 », « 3 sept. 1985 » (mois tronqué + point tolérés)
  const literal = text.match(/\b(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})\b/);
  if (literal) {
    const monthRaw = stripAccents(literal[2]);
    const month = Object.keys(MONTHS_FR).find(m => m === monthRaw || m.startsWith(monthRaw.slice(0, 4)));
    if (month) return makeValidDate(+literal[3], MONTHS_FR[month], +literal[1]);
  }
  return undefined;
}

/** Pré nom(s) : lettres (+ tirets/apostrophes), éventuellement multiples. */
function parseNames(raw: string): string | undefined {
  const cleaned = raw.replace(/\b(born|le|a|ne|sur|acte|registre)\b.*$/i, '').trim();
  const names = cleaned.match(/^[A-Za-zÀ-ÿ'’\- ]{2,60}$/);
  return names ? names[0].replace(/\s+/g, ' ').trim() : undefined;
}

export function parseBirthCertificateText(rawText: string): ParsedBirthCertificate {
  const result: ParsedBirthCertificate = { rawText };
  const lines = (rawText ?? '').split(/\r?\n/);

  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    const m = matchLabel(normalized);
    if (!m) continue;
    const value = valueAfter(line, m.label);
    if (!value) continue;

    switch (m.field) {
      case 'firstName': {
        const v = parseNames(value);
        if (v && !result.firstName) result.firstName = v;
        break;
      }
      case 'lastName': {
        const v = parseNames(value);
        if (v && !result.lastName) {
          // « NOM Prénom » sur une ligne : les mots ENTIÈREMENT majuscules sont le
          // nom, le mot suivant (avec minuscules) est le prénom s'il manque encore.
          const split = v.match(/^([A-ZÀ-Ý'’\-]{2,}(?:\s+[A-ZÀ-Ý'’\-]{2,})*)(?:\s+([A-Za-zÀ-ÿ'’\-]{2,}))?$/);
          if (split && /[a-zà-ÿ]/.test(v) && split[1]) {
            result.lastName = split[1];
            if (split[2] && !result.firstName) result.firstName = split[2];
          } else {
            result.lastName = v;
          }
        }
        break;
      }
      case 'birthDate': {
        const d = parseFrenchDate(value);
        if (d && !result.birthDate) result.birthDate = d;
        break;
      }
      case 'birthPlace': {
        // « né à Cotonou » ou « lieu de naissance : Cotonou, Littoral »
        const place = value.replace(/^:\s*/, '').replace(/[,;].*$/, '').trim();
        if (place && !result.birthPlace) result.birthPlace = place;
        break;
      }
      case 'parents': {
        if (!result.parents) result.parents = value.replace(/\s{2,}/g, ' ').trim();
        break;
      }
      case 'documentNumber': {
        const num = value.match(/[A-Za-z0-9\-/]{3,}/);
        if (num && !result.documentNumber) result.documentNumber = num[0];
        break;
      }
    }
  }

  // Fallback structurel : certains actes compilent « NOM Prénom » sur une seule ligne.
  // Les mots ENTIÈREMENT majuscules forment le nom (gère les noms composés « DE SOUZA ») ;
  // le premier mot suivant contenant des minuscules est le prénom.
  if (!result.lastName && !result.firstName) {
    for (const line of lines) {
      const combined = line.match(/\b(NOM|SURNAME)\s*[:.\-]?\s*((?:[A-ZÀ-Ý'’\-]+(?:\s+[A-ZÀ-Ý'’\-]+)*)?)\s*([A-Za-zÀ-ÿ'’\-]{2,})?/);
      const rest = combined ? `${combined[2] ?? ''} ${combined[3] ?? ''}`.trim() : '';
      if (!rest) continue;
      const upperWords = rest.match(/[A-ZÀ-Ý'’\-]+(?:\s+[A-ZÀ-Ý'’\-]+)*/);
      if (!upperWords) continue;
      const lastNamePart = upperWords[0].trim();
      const firstNamePart = rest.slice(upperWords[0].length).trim();
      if (lastNamePart.length >= 2) {
        result.lastName = lastNamePart;
        if (firstNamePart.length >= 2) result.firstName = firstNamePart;
        break;
      }
    }
  }

  return result;
}
