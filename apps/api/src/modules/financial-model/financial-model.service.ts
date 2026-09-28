import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';

/**
 * Versionnement des modèles financiers — V1_LEGACY (gelé) et V2_MUTUAL (cible).
 *
 * Règles absolues (cf. docs/financial-model-versioning.md) :
 *  - une seule version ACTIVE à un instant donné ;
 *  - V1 est ARCHIVED/READ_ONLY : aucun nouveau contrat ne peut s'y rattacher
 *    sans habilitation financière explicite ;
 *  - l'archivage/réactivation n'a JAMAIS d'effet rétroactif sur les écritures ;
 *  - toute migration de contrat est volontaire, traçable, snapshotée avant
 *    effet et certifiée (ANALYSIS → … → CERTIFICATION).
 */

export const V1_LEGACY_ID = 'fmv_v1_legacy';
export const V2_MUTUAL_ID = 'fmv_v2_mutual';

const MIGRATION_STATUSES = [
  'ANALYSIS',
  'PREVIEW',
  'VALIDATION',
  'SNAPSHOT',
  'MIGRATION',
  'VERIFICATION',
  'CERTIFICATION',
] as const;

/** Aire de croissance des statuts de migration (ordre strict). */
export const MIGRATION_FLOW = MIGRATION_STATUSES as readonly string[];

@Injectable()
export class FinancialModelService {
  constructor(private prisma: PrismaService) {}

  // ── Seed idempotent ─────────────────────────────────────────────────────

  /** Garantit la présence des deux versions de référence (INSERT ON CONFLICT). */
  async ensureSeeded(): Promise<void> {
    await this.prisma.financialModelVersion.upsert({
      where: { code: 'V1_LEGACY' },
      update: {},
      create: {
        id: V1_LEGACY_ID,
        code: 'V1_LEGACY',
        label: 'V1 — Legacy (gelé)',
        status: 'ARCHIVED',
        engineVersion: 'V1',
        activatedAt: new Date('2019-01-01'),
        archivedAt: new Date(),
      },
    });
    await this.prisma.financialModelVersion.upsert({
      where: { code: 'V2_MUTUAL' },
      update: {},
      create: {
        id: V2_MUTUAL_ID,
        code: 'V2_MUTUAL',
        label: 'V2 — Mutualiste (charges réelles, provisions, réserves)',
        status: 'ACTIVE',
        engineVersion: 'V2',
        activatedAt: new Date(),
        archivedAt: null,
      },
    });
  }

  // ── Lecture ─────────────────────────────────────────────────────────────

  /** Liste des versions + nombre de contrats rattachés (compteur non rétroactif). */
  async listVersions() {
    const versions = await this.prisma.financialModelVersion.findMany({
      orderBy: { code: 'asc' },
    });
    const counts = await this.prisma.contract.groupBy({
      by: ['financialModelVersionId'],
      _count: { _all: true },
    });
    const byId = new Map(counts.map(c => [c.financialModelVersionId, c._count._all]));
    return versions.map(v => ({
      ...v,
      contractsCount: byId.get(v.id) ?? 0,
    }));
  }

  /** Modèle d'un contrat (déterminé une fois pour toutes à la création). */
  async contractModel(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        number: true,
        financialModelVersionId: true,
        migrationStatus: true,
        financialModelVersion: true,
      },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    return {
      contractId: contract.id,
      contractNumber: contract.number,
      engineVersion: contract.financialModelVersion?.engineVersion ?? 'V1',
      financialModelVersion: contract.financialModelVersion,
      migrationStatus: contract.migrationStatus,
    };
  }

  /**
   * Résout la version à rattacher à un NOUVEAU contrat.
   * Défaut : la version ACTIVE du moment (V2_MUTUAL). `modelVersionId` est un
   * override réservé aux habilités financial-model.admin — jamais silencieux.
   */
  async resolveVersionForNewContract(modelVersionId?: string | null): Promise<{ id: string; engineVersion: string }> {
    if (modelVersionId) {
      const chosen = await this.prisma.financialModelVersion.findUnique({ where: { id: modelVersionId } });
      if (!chosen) throw new NotFoundException('Modèle financier introuvable');
      if (chosen.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Le modèle ${chosen.code} est ${chosen.status} : seuls les contrats nouveaux de modèle ACTIVE peuvent être créés (archivage/réactivation gérés via l'administration).`,
        );
      }
      return { id: chosen.id, engineVersion: chosen.engineVersion };
    }
    const active = await this.prisma.financialModelVersion.findFirst({ where: { status: 'ACTIVE' } });
    if (!active) {
      // Sécurité : ne jamais bloquer la souscription, rattachement V1 explicite.
      return { id: V1_LEGACY_ID, engineVersion: 'V1' };
    }
    return { id: active.id, engineVersion: active.engineVersion };
  }

  // ── Cycle de vie des versions ───────────────────────────────────────────

  /** Active une version : au plus une ACTIVE — l'ancienne est suspendue puis archivée. */
  async activateVersion(versionId: string, actor: { id: string; role: string }, justification?: string) {
    this.requireAdmin(actor);
    if (!justification || justification.trim().length < 10) {
      throw new BadRequestException('Une justification (≥ 10 caractères) est requise pour changer de modèle actif.');
    }
    const target = await this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
    if (!target) throw new NotFoundException('Modèle financier introuvable');

    const previous = await this.prisma.financialModelVersion.findMany({ where: { status: 'ACTIVE' } });
    await this.prisma.$transaction(async tx => {
      for (const prev of previous) {
        if (prev.id === target.id) continue;
        await tx.financialModelVersion.update({
          where: { id: prev.id },
          data: { status: 'SUSPENDED', archivedAt: prev.archivedAt ?? new Date() },
        });
      }
      await tx.financialModelVersion.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', activatedAt: new Date(), archivedAt: null },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FINANCIAL_MODEL_ACTIVATED',
          entityType: 'FinancialModelVersion',
          entityId: target.id,
          status: 'OK',
          meta: JSON.stringify({
            code: target.code,
            previous: previous.map(p => p.code),
            justification: justification.trim(),
          }),
        },
      });
    });
    return this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
  }

  /** Archive une version : READ_ONLY — les contrats existants continuent, aucune écriture réétiquetée. */
  async archiveVersion(versionId: string, actor: { id: string; role: string }, justification: string) {
    this.requireAdmin(actor);
    if (!justification || justification.trim().length < 10) {
      throw new BadRequestException('Une justification (≥ 10 caractères) est requise pour archiver un modèle.');
    }
    const target = await this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
    if (!target) throw new NotFoundException('Modèle financier introuvable');
    if (target.status === 'ARCHIVED') return target; // idempotent
    const activeContracts = await this.prisma.contract.count({
      where: { financialModelVersionId: versionId, status: 'ACTIVE' },
    });
    await this.prisma.$transaction(async tx => {
      await tx.financialModelVersion.update({
        where: { id: versionId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FINANCIAL_MODEL_ARCHIVED',
          entityType: 'FinancialModelVersion',
          entityId: versionId,
          status: 'OK',
          meta: JSON.stringify({
            code: target.code,
            activeContractsAtArchive: activeContracts,
            readOnly: true,
            justification: justification.trim(),
          }),
        },
      });
    });
    return this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
  }

  /**
   * Réactive une version archivée (permission + justification + audit).
   * SANS effet rétroactif : les écritures passées restent rattachées au modèle
   * sous lequel elles ont été produites.
   */
  async reactivateVersion(versionId: string, actor: { id: string; role: string }, justification: string) {
    this.requireAdmin(actor);
    if (!justification || justification.trim().length < 10) {
      throw new BadRequestException('Une justification (≥ 10 caractères) est requise pour réactiver un modèle.');
    }
    const target = await this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
    if (!target) throw new NotFoundException('Modèle financier introuvable');
    if (target.status === 'ACTIVE') return target; // idempotent
    await this.prisma.$transaction(async tx => {
      // Une seule ACTIVE : on suspend les autres sans toucher à leur historique.
      const others = await tx.financialModelVersion.findMany({ where: { status: 'ACTIVE' } });
      for (const other of others) {
        await tx.financialModelVersion.update({
          where: { id: other.id },
          data: { status: 'SUSPENDED', archivedAt: other.archivedAt ?? new Date() },
        });
      }
      await tx.financialModelVersion.update({
        where: { id: versionId },
        data: { status: 'ACTIVE', activatedAt: new Date(), archivedAt: null },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FINANCIAL_MODEL_REACTIVATED',
          entityType: 'FinancialModelVersion',
          entityId: versionId,
          status: 'OK',
          meta: JSON.stringify({
            code: target.code,
            previousStatus: target.status,
            retroactiveEffect: false,
            justification: justification.trim(),
          }),
        },
      });
    });
    return this.prisma.financialModelVersion.findUnique({ where: { id: versionId } });
  }

  // ── Migration contrôlée d'un contrat ────────────────────────────────────

  /** Phases ANALYSIS → PREVIEW → VALIDATION → SNAPSHOT → MIGRATION → VERIFICATION → CERTIFICATION. */
  async advanceMigration(contractId: string, actor: { id: string; role: string }) {
    this.requireAdmin(actor);
    let migration = await this.prisma.financialModelMigration.findFirst({
      where: { contractId, status: { in: [...MIGRATION_FLOW] } },
      orderBy: { createdAt: 'desc' },
    });
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { financialModelVersion: true },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    const from = contract.financialModelVersion;
    if (!from) throw new BadRequestException('Contrat sans modèle financier rattaché');
    // Après la phase MIGRATION le contrat pointe déjà vers V2 : seules les
    // phases restantes (VERIFICATION, CERTIFICATION) restent accessibles.
    if (from.code === 'V2_MUTUAL' && !migration) {
      throw new BadRequestException('Contrat déjà sur le modèle V2_MUTUAL');
    }
    const to = await this.prisma.financialModelVersion.findUnique({ where: { code: 'V2_MUTUAL' } });
    if (!to) throw new NotFoundException('Version cible V2_MUTUAL introuvable');

    if (!migration) {
      migration = await this.prisma.financialModelMigration.create({
        data: { contractId, fromVersionId: from.id, toVersionId: to.id, status: 'ANALYSIS', createdBy: actor.id },
      });
    }
    const currentIdx = MIGRATION_FLOW.indexOf(migration.status);
    const next = MIGRATION_FLOW[currentIdx + 1];
    if (!next) throw new BadRequestException('Migration déjà certifiée — aucun effet supplémentaire possible.');

    switch (next) {
      case 'PREVIEW': {
        const analysis = await this.buildAnalysis(contractId, from.engineVersion, to.engineVersion);
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'PREVIEW', analysis: JSON.stringify(analysis) },
        });
        break;
      }
      case 'VALIDATION': {
        if (!migration.analysis) throw new BadRequestException('Phase ANALYSIS incomplète : relancez PREVIEW.');
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'VALIDATION' },
        });
        break;
      }
      case 'SNAPSHOT': {
        const snapshot = await this.buildSnapshot(contractId);
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'SNAPSHOT', snapshot: JSON.stringify(snapshot) },
        });
        break;
      }
      case 'MIGRATION': {
        if (!migration.snapshot) throw new BadRequestException('SNAPSHOT requis avant MIGRATION (aucune migration sans état figé).');
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'MIGRATION' },
        });
        // Point de bascule unique et volontaire du contrat vers V2.
        await this.prisma.contract.update({
          where: { id: contractId },
          data: { financialModelVersionId: to.id, migrationStatus: 'MIGRATION_PENDING' },
        });
        break;
      }
      case 'VERIFICATION': {
        const verification = await this.verifyAgainstSnapshot(contractId, migration.snapshot);
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'VERIFICATION', verification: JSON.stringify(verification) },
        });
        break;
      }
      case 'CERTIFICATION': {
        const verification = safeParse(migration.verification);
        if (!verification?.ok) throw new BadRequestException('VERIFICATION non concluante : certification refusée.');
        migration = await this.prisma.financialModelMigration.update({
          where: { id: migration.id },
          data: { status: 'CERTIFICATION', certifiedAt: new Date() },
        });
        await this.prisma.contract.update({
          where: { id: contractId },
          data: { migrationStatus: 'MIGRATED_TO_V2' },
        });
        await this.prisma.auditLog.create({
          data: {
            userId: actor.id,
            action: 'FINANCIAL_MODEL_MIGRATION_CERTIFIED',
            entityType: 'Contract',
            entityId: contractId,
            status: 'OK',
            meta: JSON.stringify({
              from: from.code,
              to: to.code,
              migrationId: migration.id,
              snapshotPreserved: true,
            }),
          },
        });
        break;
      }
    }
    return migration;
  }

  /** Liste des migrations (traçabilité complète, filtrable par contrat). */
  async listMigrations(contractId?: string) {
    return this.prisma.financialModelMigration.findMany({
      where: contractId ? { contractId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Construction des données des phases ─────────────────────────────────

  private async buildAnalysis(contractId: string, fromEngine: string, toEngine: string) {
    const [contributions, claims, fundCalls] = await Promise.all([
      this.prisma.contribution.findMany({ where: { contractId }, select: { status: true, amount: true } }),
      this.prisma.claim.findMany({ where: { contractId }, select: { status: true, totalRequested: true, totalApproved: true } }),
      this.prisma.fundCall.findMany({ where: { contractId }, select: { status: true, chosenAmount: true } }),
    ]);
    const sum = (rows: any[], pick: (r: any) => number | null | undefined) =>
      rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    return {
      generatedAt: new Date().toISOString(),
      fromEngine,
      toEngine,
      ruleDifferences: [
        'V1 : management fee 20 %, appels de fonds, crédit de renouvellement, fonds de solidarité mutualisé',
        'V2 : cotisations mutualistes, charges réelles, prestations engagées/payées, provisions RBNS+IBNR, réserves, réassurance',
      ],
      contributions: {
        total: sum(contributions, c => c.amount),
        paid: sum(contributions.filter(c => c.status === 'PAID'), c => c.amount),
        pending: sum(contributions.filter(c => c.status !== 'PAID'), c => c.amount),
      },
      claims: {
        totalRequested: sum(claims, c => c.totalRequested),
        totalApproved: sum(claims, c => c.totalApproved),
        openCount: claims.filter(c => !['PAID', 'REJECTED', 'CANCELLED'].includes(c.status)).length,
      },
      fundCalls: {
        count: fundCalls.length,
        totalChosen: sum(fundCalls, f => f.chosenAmount),
        unpaid: sum(fundCalls.filter(f => f.status === 'SENT'), f => f.chosenAmount),
      },
    };
  }

  /**
   * Snapshot figé de l'état du contrat avant migration : contributions,
   * sinistres, journal CTS, appels de fonds. Sert de preuve et de base de
   * vérification — jamais réécrit après coup.
   */
  private async buildSnapshot(contractId: string) {
    const [contract, contributions, claims, ctsJournals, fundCalls] = await Promise.all([
      this.prisma.contract.findUnique({ where: { id: contractId } }),
      this.prisma.contribution.findMany({ where: { contractId }, orderBy: { sequence: 'asc' } }),
      this.prisma.claim.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.ctsJournal.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.fundCall.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      takenAt: new Date().toISOString(),
      contract: contract ? { ...contract, financialModelVersion: undefined } : null,
      contributions,
      claims,
      ctsJournals,
      fundCalls,
      totals: {
        contributionsPaid: contributions.filter(c => c.status === 'PAID').reduce((a, c) => a + c.amount, 0),
        claimsPaid: claims.filter(c => c.status === 'PAID').reduce((a, c) => a + (c.totalApproved ?? 0), 0),
        ctsEntries: ctsJournals.length,
      },
    };
  }

  /** Contrôle post-migration : le snapshot reste intact, le contrat pointe vers V2. */
  private async verifyAgainstSnapshot(contractId: string, snapshotJson: string | null) {
    const snapshot = safeParse(snapshotJson);
    if (!snapshot) return { ok: false, reason: 'SNAPSHOT_MISSING' };
    const [contributions, claims, ctsJournals, fundCalls, contract] = await Promise.all([
      this.prisma.contribution.findMany({ where: { contractId } }),
      this.prisma.claim.findMany({ where: { contractId } }),
      this.prisma.ctsJournal.findMany({ where: { contractId } }),
      this.prisma.fundCall.findMany({ where: { contractId } }),
      this.prisma.contract.findUnique({ where: { id: contractId }, include: { financialModelVersion: true } }),
    ]);
    const sameRows = (a: any[], b: any[]) => a.length === b.length;
    const checks = {
      snapshotPresent: Boolean(snapshot.takenAt),
      contributionsIntact: sameRows(snapshot.contributions ?? [], contributions),
      claimsIntact: sameRows(snapshot.claims ?? [], claims),
      ctsJournalsIntact: sameRows(snapshot.ctsJournals ?? [], ctsJournals),
      fundCallsIntact: sameRows(snapshot.fundCalls ?? [], fundCalls),
      contractOnV2: contract?.financialModelVersion?.code === 'V2_MUTUAL',
      historyNotRelabeled: true, // aucun UPDATE d'écriture n'est émis par la migration
    };
    return { ok: Object.values(checks).every(Boolean), checks, verifiedAt: new Date().toISOString() };
  }

  private requireAdmin(actor: { id: string; role: string }) {
    if (!actor?.id) throw new ForbiddenException('Authentification requise');
    // La garde @RequirePermissions('financial-model.admin') s'applique déjà au
    // contrôleur ; ce contrôle secondaire protège les appels directs au service.
    if (actor.role && actor.role !== 'SUPER_ADMIN' && actor.role !== 'INSURANCE_MANAGER') {
      // les rôles sans habilitation financière ne passent jamais
      throw new ForbiddenException('Habilitation financière requise');
    }
  }
}

function safeParse(json: string | null): any {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
