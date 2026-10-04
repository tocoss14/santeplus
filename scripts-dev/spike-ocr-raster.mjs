/**
 * Spike jetable : OCR (tesseract.js fra+eng) du PNG rasterisé par spike-pdf-raster.mjs,
 * puis passage dans le parseur de l'acte — valide le futur chemin « PDF scanné ».
 *
 * Usage : node scripts-dev/spike-ocr-raster.mjs
 */
import { createWorker } from 'tesseract.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const png = join(root, '.freebuff', 'spike-raster.png');

const worker = await createWorker('fra+eng');
const { data } = await worker.recognize(readFileSync(png));
await worker.terminate();
console.log('--- texte OCR ---');
console.log(data.text.trim());
console.log('--- fin ---');

const parserUrl = pathToFileURL(join(root, 'apps/api/src/modules/subscription/birth-certificate-parser.ts')).href;
const { parseBirthCertificateText } = await import(parserUrl);
const parsed = parseBirthCertificateText(data.text);
const { rawText: _r, ...fields } = parsed;
console.log('champs parsés:', JSON.stringify(fields, (k, v) => (k === 'birthDate' ? v?.toISOString?.().slice(0, 10) ?? v : v), 2));
const ok = fields.firstName && fields.lastName && fields.birthDate;
console.log(ok ? 'SPIKE OCR OK — le chemin PDF scanné est viable' : 'SPIKE OCR ÉCHOUÉ');
process.exit(ok ? 0 : 1);
