import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { ref, memberNumber } from '../../common/utils';

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
  ) {}

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
   * GET /admin/providers/registrations — Inscriptions en attente
   */
  @Get('admin/providers/registrations')
  @RequirePermissions('providers.manage')
  listPending() {
    return this.reg.listPendingRegistrations();
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
})
export class ProviderRegistrationModule {}
