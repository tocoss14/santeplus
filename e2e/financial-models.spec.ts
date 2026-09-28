import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { registerMember, loginAs, apiContext, uid } from './helpers';

/**
 * E2E — coexistence V1/V2 de bout en bout.
 *
 * Scénario : un nouvel adhérent téléverse son acte de naissance (le serveur le
 * relit par OCR et vérifie l'identité), souscrit individuellement (ANNUAL), puis
 * paie sa première échéance via le PSP mock. On vérifie ensuite DANS LA BASE :
 *   1. le contrat est rattaché à V2_MUTUAL (version ACTIVE du moment) ;
 *   2. souscription ET paiement n'ont produit AUCUNE écriture dans le journal
 *      CTS V1 (CtsJournal, FundCall) — étanchéité des deux moteurs ;
 *   3. les écritures comptables du paiement sont tamponnées V2_MUTUAL ;
 *   4. l'API admin expose le badge modèle et des compteurs séparés par version.
 */

// e2e/ vit à la racine du dépôt — __dirname survit au transpile CJS de Playwright.
const root = path.resolve(__dirname, '..');

const ACTE_PDF = path.join(root, '.freebuff', 'acte-test-scanne.pdf');
// Identité portée par l'acte scanné de test (scripts-dev/make-birth-cert-fixture.mjs)
const ACTE = { firstName: 'Marie-Josée', lastName: 'ADJOVI', birthDate: '1990-01-12' };

// Prisma client résolu depuis apps/api (le root n'installe pas @prisma/client).
const requireFromApi = createRequire(path.join(root, 'apps/api/'));

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(root, 'apps/api/.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(l => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL introuvable (env process ou apps/api/.env)');
  return line.slice('DATABASE_URL='.length).trim().replace(/^"(.*)"$/, '$1');
}

/** Upload multipart de l'acte + vérification serveur (relit l'OCR elle-même). */
async function uploadAndVerifyBirthCertificate(email: string) {
  const ctx = await loginAs(email);
  const upload = await ctx.post('/api/subscription/birth-certificate/upload', {
    multipart: {
      file: {
        name: 'acte-test-scanne.pdf',
        mimeType: 'application/pdf',
        buffer: fs.readFileSync(ACTE_PDF),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const { fileId } = await upload.json();
  expect(fileId).toBeTruthy();

  const verify = await ctx.post('/api/subscription/birth-certificate/verify', {
    data: { fileId },
  });
  expect(verify.ok()).toBeTruthy();
  const verdict = await verify.json();
  // La vérification serveur relit l'acte par OCR (source = 'ocr') et compare
  // au profil : match true attendu avec l'identité de l'acte à l'inscription.
  expect(verdict.match).toBe(true);
  expect(verdict.source).toBe('ocr');
  return ctx;
}

test.describe('Modèles financiers V1/V2 — souscription et paiement', () => {
  test('un nouveau contrat naît sur V2_MUTUAL sans jamais toucher au journal CTS V1', async () => {
    const { PrismaClient } = requireFromApi('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
    try {
      // ── 1. Inscription avec l'identité portée par l'acte ────────────────
      const email = `e2e.fm.${uid()}@test.bj`;
      await registerMember(email, 'Test1234!', {
        firstName: ACTE.firstName,
        lastName: ACTE.lastName,
        birthDate: ACTE.birthDate,
        gender: 'F',
      });
      const ctx = await uploadAndVerifyBirthCertificate(email);

      // ── 2. Souscription individuelle ────────────────────────────────────
      const products = await (await ctx.get('/api/products?clientType=INDIVIDUAL')).json();
      expect(products.length).toBeGreaterThan(0);
      const sub = await (
        await ctx.post('/api/subscription/subscribe', {
          data: { productId: products[0].id, frequency: 'ANNUAL', beneficiaries: [] },
        })
      ).json();
      expect(sub.contractId).toBeTruthy();

      // ── 3. Contrat en base : rattaché à V2_MUTUAL ───────────────────────
      const contract = await prisma.contract.findUnique({
        where: { id: sub.contractId },
        include: { financialModelVersion: true },
      });
      expect(contract).toBeTruthy();
      expect(contract.financialModelVersion?.code).toBe('V2_MUTUAL');
      expect(contract.financialModelVersion?.engineVersion).toBe('V2');
      // Un contrat né sous son modèle n'a jamais de statut de migration.
      expect(contract.migrationStatus).toBeNull();

      // ── 4. Aucune écriture CTS V1 à la souscription ─────────────────────
      expect(await prisma.ctsJournal.count({ where: { contractId: contract.id } })).toBe(0);
      expect(await prisma.fundCall.count({ where: { contractId: contract.id } })).toBe(0);

      // ── 5. Paiement mock de la première échéance ────────────────────────
      const init = await (
        await ctx.post('/api/payments/initiate', {
          data: { contractId: contract.id, method: 'MOCK_MOMO' },
        })
      ).json();
      expect(init.payment?.id).toBeTruthy();

      const confirm = await (
        await ctx.post('/api/payments/mock/confirm', {
          data: { paymentId: init.payment.id, outcome: 'SUCCESS' },
        })
      ).json();
      expect(confirm.ok).toBe(true);

      // ── 6. Toujours aucune écriture CTS V1 après encaissement ───────────
      expect(await prisma.ctsJournal.count({ where: { contractId: contract.id } })).toBe(0);
      expect(await prisma.fundCall.count({ where: { contractId: contract.id } })).toBe(0);

      // ── 7. Écritures comptables tamponnées V2_MUTUAL ────────────────────
      const entries = await prisma.accountingEntry.findMany({
        where: { referenceType: 'Payment', referenceId: init.payment.id },
      });
      expect(entries.length).toBeGreaterThanOrEqual(2);
      for (const e of entries) {
        expect(e.financialModelVersion).toBe('V2_MUTUAL');
      }

      // La cotisation liée est réglée et le contrat activé.
      const contribution = await prisma.contribution.findFirst({
        where: { contractId: contract.id },
        orderBy: { sequence: 'asc' },
      });
      expect(contribution?.status).toBe('PAID');
      const activated = await prisma.contract.findUnique({ where: { id: contract.id } });
      expect(activated?.status).toBe('ACTIVE');

      // ── 8. Côté API admin : badge modèle + compteurs par version ────────
      const admin = await loginAs('gestionnaire@santeplus.bj', 'Demo1234!');
      const versions = await (await admin.get('/api/admin/financial-models')).json();
      const v1 = versions.find((v: any) => v.code === 'V1_LEGACY');
      const v2 = versions.find((v: any) => v.code === 'V2_MUTUAL');
      expect(v1?.status).toBe('ARCHIVED');
      expect(v2?.status).toBe('ACTIVE');
      expect(v2.contractsCount).toBeGreaterThanOrEqual(1);

      const list = await (await admin.get('/api/admin/contracts?q=' + activated.number)).json();
      const listed = list.items?.find((c: any) => c.id === contract.id);
      expect(listed?.financialModelVersion?.code).toBe('V2_MUTUAL');

      await ctx.dispose();
      await admin.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });
});
