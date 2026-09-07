/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Backfill UNIQUE : chiffre les champs médicaux en clair restants
 * (Consultation.motif / diagnostic, Prescription.note) dans les colonnes
 * AES-256-GCM (*Enc), AVANT la migration 20260906_remove_medical_plaintext
 * qui supprime les colonnes en clair.
 *
 * ⚠️ À exécuter une seule fois par base existante, AVANT `prisma migrate deploy` :
 *     cd apps/api && npx tsx scripts/backfill-medical-enc.ts
 * Idempotent : ne remplit que les lignes dont la colonne *Enc est vide.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { encryptMedical } from '../src/common/crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let updated = 0;

  // Lecture du clair via SQL brut (les colonnes vont disparaître du client après la migration)
  const consultations = await prisma.$queryRaw<Array<{ id: string; motif: string | null; diagnostic: string | null }>>`
    SELECT id, motif, diagnostic FROM "Consultation"
    WHERE ("motifEnc" IS NULL AND motif IS NOT NULL)
       OR ("diagnosticEnc" IS NULL AND diagnostic IS NOT NULL)
  `;
  for (const c of consultations) {
    const data: Record<string, string> = {};
    if (c.motif && !data.motifEnc) data.motifEnc = encryptMedical(c.motif);
    if (c.diagnostic) data.diagnosticEnc = encryptMedical(c.diagnostic);
    if (Object.keys(data).length) {
      await prisma.consultation.update({ where: { id: c.id }, data });
      updated++;
    }
  }

  const prescriptions = await prisma.$queryRaw<Array<{ id: string; note: string | null }>>`
    SELECT id, note FROM "Prescription"
    WHERE "noteEnc" IS NULL AND note IS NOT NULL
  `;
  for (const p of prescriptions) {
    if (p.note) {
      await prisma.prescription.update({ where: { id: p.id }, data: { noteEnc: encryptMedical(p.note) } });
      updated++;
    }
  }

  console.log(`Backfill terminé : ${updated} enregistrement(s) chiffré(s).`);
  console.log('Vous pouvez maintenant déployer la migration 20260906_remove_medical_plaintext.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Backfill échoué :', e);
  await prisma.$disconnect();
  process.exit(1);
});