import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { FilesModule, StorageService } from '../files/files.service';
import { ref, memberNumber } from '../../common/utils';

/** Types de pièces acceptées pour l'inscription prestataire (§25). */
export const PROVIDER_DOC_TYPES: [string, ...string[]] = ['RCCM', 'AGREMENT', 'ID_PRO', 'RIB', 'AUTRE'];

export interface ProviderDocEntry {
  fileId: string;
  docType: string;
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
}

// ─── Inscription publique ──────────────────────────────────────────────────

const registerProviderSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['HOSPITAL', 'CLINIC', 'HEALTH_CENTER', 'PHARMACY', 'LABORATORY', 'MEDICAL_CABINET', 'SPECIALIST']),
  city: z.string().min(2).max(80),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email(),
  specialties: z.string().max(300).optional(),
  openingHours: z.string().max(200).optional(),
  services: z.string().max(500).optional(),
  contactFirstName: z.string().min(2).max(60),
  contactLastName: z.string().min(2).max(60),
  contactPhone: z.string().min(8).max(30),
  notes: z.string().max(500).optional(),
});

// ─── Import Excel bulk ─────────────────────────────────────────────────────

const bulkProviderSchema = z.object({
  name: z.string().min(2),
  type: z.string().default('CLINIC'),
  city: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email(),
  specialties: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactPhone: z.string().optional(),
});

@Injectable()
export class ProviderRegistrationService {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
    private storage: StorageService,
  ) {}

  private parseDocs(raw: string | null | undefined): ProviderDocEntry[] {
    try {
      const v = JSON.parse(raw ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  /**
   * Inscription publique d'un prestataire.
   * Crée le Provider (status=PENDING_APPROVAL, registrationStatus=PENDING_REGISTRATION)
   * et notifie les gestionnaires.
   */
  async registerPublic(dto: z.infer<typeof registerProviderSchema>) {
    // Vérifier si un prestataire avec cet email existe déjà
    const existing = await this.prisma.provider.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('Un prestataire avec cet email existe déjà');
    }

    const provider = await this.prisma.provider.create({
      data: {
        name: dto.name,
        type: dto.type,
        city: dto.city,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        email: dto.email,
        specialties: dto.specialties ?? null,
        openingHours: dto.openingHours ?? null,
        services: dto.services ?? null,
        notes: dto.notes ?? null,
        status: 'PENDING_APPROVAL',
        partnerStatus: 'PENDING',
        active: false,
        registrationStatus: 'PENDING_REGISTRATION',
        contactFirstName: dto.contactFirstName,
        contactLastName: dto.contactLastName,
        contactEmail: dto.email,
        contactPhone: dto.contactPhone,
      },
    });

    // Notifier les gestionnaires
    await this.notifyManagers(
      'PROVIDER_REGISTRATION',
      `Nouvelle inscription prestataire — ${dto.name}`,
      `${dto.contactFirstName} ${dto.contactLastName} (${dto.type}) à ${dto.city}. En attente de validation.`,
    );

    // Audit
    await this.prisma.auditLog.create({
      data: {
        action: 'PROVIDER_REGISTRATION',
        entityType: 'provider',
        entityId: provider.id,
        status: 'OK',
        meta: JSON.stringify({ name: dto.name, city: dto.city, type: dto.type }),
      },
    });

    return {
      ok: true,
      message: 'Votre inscription a été reçue. Nous la traiterons dans les plus brefs délais.',
      providerId: provider.id,
    };
  }

  /**
   * Import bulk depuis un tableau JSON (issu d'un fichier Excel parsé côté frontend).
   * Crée les comptes PROVIDER avec un mot de passe temporaire.
   */
  async bulkImport(providers: z.infer<typeof bulkProviderSchema>[]) {
    const results: { email: string; name: string; status: 'created' | 'exists' | 'error'; tempPassword?: string; error?: string }[] = [];
    const tempPassword = this.generateTempPassword();

    for (const dto of providers) {
      try {
        // Vérifier si l'email existe déjà
        const existingProvider = await this.prisma.provider.findFirst({ where: { email: dto.email } });
        if (existingProvider) {
          results.push({ email: dto.email, name: dto.name, status: 'exists' });
          continue;
        }

        const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existingUser) {
          results.push({ email: dto.email, name: dto.name, status: 'exists' });
          continue;
        }

        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // Créer le Provider + l'utilisateur en transaction
        const { provider, user } = await this.prisma.$transaction(async tx => {
          const provider = await tx.provider.create({
            data: {
              name: dto.name,
              type: dto.type || 'CLINIC',
              city: dto.city,
              address: dto.address ?? null,
              phone: dto.phone ?? null,
              email: dto.email,
              specialties: dto.specialties ?? null,
              status: 'ACTIVE',
              partnerStatus: 'ACTIVE',
              active: true,
              registrationStatus: 'APPROVED',
              contactFirstName: dto.contactFirstName ?? dto.name.split(' ')[0] ?? 'Admin',
              contactLastName: dto.contactLastName ?? dto.name.split(' ').slice(1).join(' ') ?? '',
              contactEmail: dto.email,
              contactPhone: dto.contactPhone ?? dto.phone ?? null,
            },
          });

          const user = await tx.user.create({
            data: {
              email: dto.email,
              passwordHash,
              role: 'PROVIDER',
              firstName: dto.contactFirstName ?? dto.name.split(' ')[0] ?? 'Admin',
              lastName: dto.contactLastName ?? dto.name.split(' ').slice(1).join(' ') ?? '',
              phone: dto.contactPhone ?? dto.phone ?? null,
              providerId: provider.id,
              isEstablishmentAdmin: true,
              memberNumber: memberNumber(),
            },
          });

          return { provider, user };
        });

        results.push({
          email: dto.email,
          name: dto.name,
          status: 'created',
          tempPassword,
        });

        // Notifier le prestataire
        await this.dispatch.dispatchToUser(user.id, {
          topic: 'ACCOUNT_CREATED',
          title: 'Votre compte SantéPlus est prêt',
          body: `Bienvenue ${dto.name} ! Votre compte a été créé. Connectez-vous avec ${dto.email} et le mot de passe temporaire fourni par l'administrateur. Changez-le immédiatement.`,
        });
      } catch (e: any) {
        results.push({
          email: dto.email,
          name: dto.name,
          status: 'error',
          error: e.message ?? 'Erreur inconnue',
        });
      }
    }

    // Audit
    await this.prisma.auditLog.create({
      data: {
        action: 'PROVIDER_BULK_IMPORT',
        entityType: 'system',
        status: 'OK',
        meta: JSON.stringify({
          total: providers.length,
          created: results.filter(r => r.status === 'created').length,
          exists: results.filter(r => r.status === 'exists').length,
          errors: results.filter(r => r.status === 'error').length,
        }),
      },
    });

    return { results, tempPassword };
  }

  /**
   * Approuver une inscription prestataire.
   */
  async approveRegistration(id: string, note?: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new BadRequestException('Prestataire introuvable');
    if (provider.registrationStatus !== 'PENDING_REGISTRATION' && provider.registrationStatus !== 'DOCUMENTS_REVIEWED') {
      throw new BadRequestException(`Statut ${provider.registrationStatus} non approuvable`);
    }

    await this.prisma.provider.update({
      where: { id },
      data: {
        registrationStatus: 'APPROVED',
        registrationNote: note ?? null,
        status: 'ACTIVE',
        partnerStatus: 'ACTIVE',
        active: true,
      },
    });

    // Notifier le prestataire si on a son email de contact
    if (provider.contactEmail) {
      await this.dispatch.dispatchToMany([], {
        topic: 'PROVIDER_APPROVED',
        title: `Inscription approuvée — ${provider.name}`,
        body: `Votre inscription a été approuvée. Vous pouvez maintenant créer des comptes pour votre personnel depuis l'espace prestataire.`,
      });
    }

    return { ok: true };
  }

  /**
   * Rejeter une inscription prestataire.
   */
  async rejectRegistration(id: string, reason: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new BadRequestException('Prestataire introuvable');

    await this.prisma.provider.update({
      where: { id },
      data: {
        registrationStatus: 'REJECTED',
        registrationNote: reason,
        status: 'SUSPENDED',
        active: false,
      },
    });

    return { ok: true };
  }

  /**
   * Lister les inscriptions en attente.
   */
  async listPendingRegistrations() {
    return this.prisma.provider.findMany({
      where: {
        registrationStatus: { in: ['PENDING_REGISTRATION', 'DOCUMENTS_REVIEWED'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, name: true, type: true, city: true, address: true,
        phone: true, email: true, specialties: true,
        contactFirstName: true, contactLastName: true, contactEmail: true, contactPhone: true,
        registrationStatus: true, registrationNote: true, registrationDocs: true,
        createdAt: true,
      },
    });
  }

  /**
   * Dépôt de pièces d'inscription (GED prestataire, §25).
   * Appel public : le déclarant n'a pas encore de compte, l'email de contact
   * déclaré à l'inscription fait office de preuve (comparaison insensible à la casse).
   * Les fichiers sont versionnés comme FileObject sans propriétaire (ownerId null,
   * documentType=PROVIDER_DOC) et référencés dans Provider.registrationDocs.
   * Tout nouveau dépôt repasse le dossier en PENDING_REGISTRATION (à réviser).
   */
  async uploadRegistrationDocuments(
    providerId: string,
    contactEmail: string,
    docType: string,
    files: Express.Multer.File[] | undefined,
  ) {
    const provider = await this.prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    if ((provider.contactEmail ?? '').toLowerCase() !== (contactEmail ?? '').toLowerCase() || !contactEmail) {
      throw new ForbiddenException("L'email de contact ne correspond pas à l'inscription");
    }
    if (!['PENDING_REGISTRATION', 'DOCUMENTS_REVIEWED'].includes(provider.registrationStatus)) {
      throw new BadRequestException(`Statut ${provider.registrationStatus} : dépôt de pièces impossible`);
    }
    if (!files || files.length === 0) throw new BadRequestException('Aucun fichier reçu');
    if (!PROVIDER_DOC_TYPES.includes(docType)) {
      throw new BadRequestException(`Type de document invalide (attendu : ${PROVIDER_DOC_TYPES.join(', ')})`);
    }

    const entries = this.parseDocs(provider.registrationDocs);
    for (const f of files) {
      // ownerId '' : save() ne persiste que les octets ; aucun compte pré-inscription.
      const saved = await this.storage.save('', f);
      const fileObj = await this.prisma.fileObject.create({
        data: {
          storagePath: saved.storagePath,
          mime: saved.mime,
          size: saved.size,
          sha256: saved.sha256,
          ownerId: null,
          documentType: 'PROVIDER_DOC',
          tags: JSON.stringify([provider.id, docType]),
        },
      });
      entries.push({
        fileId: fileObj.id,
        docType,
        fileName: f.originalname,
        mime: saved.mime,
        size: saved.size,
        uploadedAt: new Date().toISOString(),
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
      });
    }
    await this.prisma.provider.update({
      where: { id: providerId },
      data: { registrationDocs: JSON.stringify(entries), registrationStatus: 'PENDING_REGISTRATION' },
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'PROVIDER_DOC_UPLOADED',
        entityType: 'provider',
        entityId: providerId,
        status: 'OK',
        meta: JSON.stringify({ docType, count: files.length }),
      },
    });
    return { ok: true, files: entries.slice(-files.length) };
  }

  /**
   * Revue d'une pièce par un gestionnaire. Quand toutes les pièces sont
   * ACCEPTED (et au moins une), le dossier passe DOCUMENTS_REVIEWED
   * (approuvable). Sinon il reste PENDING_REGISTRATION.
   */
  async reviewDocument(
    providerId: string,
    fileId: string,
    decision: 'ACCEPTED' | 'REJECTED',
    reviewerId: string,
    note?: string,
  ) {
    const provider = await this.prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    const entries = this.parseDocs(provider.registrationDocs);
    const entry = entries.find(e => e.fileId === fileId);
    if (!entry) throw new NotFoundException('Pièce introuvable pour ce prestataire');
    entry.status = decision;
    entry.reviewedAt = new Date().toISOString();
    entry.reviewedBy = reviewerId;
    entry.reviewNote = note ?? null;
    const allAccepted = entries.length > 0 && entries.every(e => e.status === 'ACCEPTED');
    const registrationStatus = allAccepted ? 'DOCUMENTS_REVIEWED' : 'PENDING_REGISTRATION';
    await this.prisma.provider.update({
      where: { id: providerId },
      data: { registrationDocs: JSON.stringify(entries), registrationStatus },
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'PROVIDER_DOC_REVIEWED',
        entityType: 'provider',
        entityId: providerId,
        userId: reviewerId,
        status: 'OK',
        meta: JSON.stringify({ fileId, decision }),
      },
    });
    return { ok: true, registrationStatus };
  }

  /**
   * Pièces d'un dossier pour revue admin.
   */
  async listDocuments(providerId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true, registrationStatus: true, registrationDocs: true },
    });
    if (!provider) throw new NotFoundException('Prestataire introuvable');
    return { provider: { id: provider.id, name: provider.name, registrationStatus: provider.registrationStatus }, documents: this.parseDocs(provider.registrationDocs) };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async notifyManagers(topic: string, title: string, body: string) {
    try {
      const managers = await this.prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.dispatch.dispatchToMany(managers.map(m => m.id), { topic, title, body });
    } catch {}
  }
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class ProviderRegistrationController {
  constructor(private reg: ProviderRegistrationService) {}

  /**
   * POST /providers/register — Inscription publique (pas d'auth requise)
   */
  @Public()
  @Post('providers/register')
  registerPublic(@Body(new ZodPipe(registerProviderSchema)) dto: any) {
    return this.reg.registerPublic(dto);
  }

  /**
   * POST /admin/providers/bulk-import — Import Excel (admin only)
   * Body: { providers: [...], file?: base64 }
   * Le frontend parse l'Excel et envoie le JSON.
   */
  @Post('admin/providers/bulk-import')
  @RequirePermissions('providers.manage')
  bulkImport(@Body(new ZodPipe(z.object({ providers: z.array(bulkProviderSchema).min(1).max(500) }))) dto: any) {
    return this.reg.bulkImport(dto.providers);
  }

  /**
   * POST /providers/register/:id/documents — Dépôt public de pièces (multipart).
   * Champs : contactEmail (doit matcher l'inscription), docType, documents[] (max 5).
   */
  @Public()
  @Post('providers/register/:id/documents')
  @UseInterceptors(FilesInterceptor('documents', 5))
  async uploadDocs(
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ contactEmail: z.string().email(), docType: z.enum(PROVIDER_DOC_TYPES) }))) dto: any,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.reg.uploadRegistrationDocuments(id, dto.contactEmail, dto.docType, files);
  }

  /**
   * GET /admin/providers/registrations — Inscriptions en attente
   */
  @Get('admin/providers/registrations')
  @RequirePermissions('providers.manage')
  listPending() {
    return this.reg.listPendingRegistrations();
  }

  /**
   * GET /admin/providers/:id/documents — Pièces d'un dossier pour revue
   */
  @Get('admin/providers/:id/documents')
  @RequirePermissions('providers.manage')
  documents(@Param('id') id: string) {
    return this.reg.listDocuments(id);
  }

  /**
   * POST /admin/providers/:id/documents/review — Revue d'une pièce.
   * Toutes ACCEPTED → DOCUMENTS_REVIEWED (approuvable), sinon PENDING_REGISTRATION.
   */
  @Post('admin/providers/:id/documents/review')
  @RequirePermissions('providers.manage')
  review(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ fileId: z.string().min(5), decision: z.enum(['ACCEPTED', 'REJECTED']), note: z.string().max(500).optional() }))) dto: any,
  ) {
    return this.reg.reviewDocument(id, dto.fileId, dto.decision, auth.id, dto.note);
  }

  /**
   * POST /admin/providers/:id/approve-registration — Approuver inscription
   */
  @Post('admin/providers/:id/approve-registration')
  @RequirePermissions('providers.manage')
  approve(@Param('id') id: string, @Body() body?: { note?: string }) {
    return this.reg.approveRegistration(id, body?.note);
  }

  /**
   * POST /admin/providers/:id/reject-registration — Rejeter inscription
   */
  @Post('admin/providers/:id/reject-registration')
  @RequirePermissions('providers.manage')
  reject(@Param('id') id: string, @Body(new ZodPipe(z.object({ reason: z.string().min(3).max(500) }))) dto: any) {
    return this.reg.rejectRegistration(id, dto.reason);
  }
}

@Module({
  controllers: [ProviderRegistrationController],
  providers: [ProviderRegistrationService],
  imports: [FilesModule],
})
export class ProviderRegistrationModule {}
