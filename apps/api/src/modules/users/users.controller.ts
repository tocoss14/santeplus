import { BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { PERMISSION_LABELS, ROLES } from '../../common/permissions';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { decryptField, encryptField } from '../../common/crypto';
import { StorageService } from '../files/files.service';
import { updateProfileSchema } from '../auth/dto';

const createStaffSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.enum(['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT', 'PROVIDER']),
});

const adminUpdateUserSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  role: z.enum(['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT', 'PROVIDER', 'MEMBER', 'COMPANY_ADMIN']).optional(),
  newPassword: z.string().min(8).optional(),
});

@Controller()
@UseInterceptors(AuditInterceptor)
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Post('users/me/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @CurrentUser() auth: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Fichier photo requis');
    const saved = await this.storage.save(auth.id, file);
    const fileObj = await this.prisma.fileObject.create({
      data: { storagePath: saved.storagePath, mime: saved.mime, size: saved.size, sha256: saved.sha256, ownerId: auth.id },
    });
    await this.prisma.user.update({ where: { id: auth.id }, data: { photoFileId: fileObj.id } });
    return { ok: true, fileId: fileObj.id };
  }

  @Get('users/me/photo')
  async getPhotoId(@CurrentUser() auth: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id: auth.id }, select: { photoFileId: true } });
    return { fileId: u?.photoFileId ?? null };
  }

  @Patch('users/me')
  async updateProfile(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(updateProfileSchema)) dto: any) {
    const data: any = { ...dto };
    if (dto.nationalId) data.nationalIdEnc = encryptField(dto.nationalId);
    delete data.nationalId;
    await this.prisma.user.update({ where: { id: auth.id }, data });
    return this.prisma.user.findUnique({ where: { id: auth.id }, select: this.safeSelect() });
  }

  @Get('users/me/national-id')
  async getNationalId(@CurrentUser() auth: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id: auth.id }, select: { nationalIdEnc: true } });
    return { nationalId: decryptField(u?.nationalIdEnc) };
  }

  @Get('admin/users')
  @RequirePermissions('members.read')
  async list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
  ) {
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
        { memberNumber: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * take,
        take,
        select: {
          ...this.safeSelect(),
          _count: { select: { contractsAsPrincipal: true, claims: true } },
          company: { select: { name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: Number(page), pages: Math.ceil(total / take) };
  }

  @Get('admin/users/:id')
  @RequirePermissions('members.read')
  async detail(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        contractsAsPrincipal: {
          select: { id: true, number: true, status: true, startDate: true, endDate: true, product: { select: { name: true } } },
        },
        company: { select: { name: true } },
        claims: { select: { id: true, reference: true, status: true, totalRequested: true, careDate: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!u) throw new BadRequestException('Utilisateur introuvable');
    const { passwordHash: _p, nationalIdEnc: _n, ...rest } = u;
    return { ...rest, nationalId: decryptField(u.nationalIdEnc) };
  }

  @Post('admin/users')
  @RequirePermissions('members.manage')
  async createStaff(@Body(new ZodPipe(createStaffSchema)) dto: any) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email déjà utilisé');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });
    return { id: user.id, email: user.email, role: user.role };
  }

  @Patch('admin/users/:id')
  @RequirePermissions('members.manage')
  async adminUpdate(@Param('id') id: string, @Body(new ZodPipe(adminUpdateUserSchema)) dto: any) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new BadRequestException('Utilisateur introuvable');
    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.role) data.role = dto.role;
    if (dto.newPassword) data.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id }, data });
    return { ok: true };
  }

  @Get('admin/roles')
  roles() {
    return ROLES.map(role => ({ role, label: ROLE_LABELS[role], permissions: Object.keys(PERMISSION_LABELS) }));
  }

  @Get('admin/roles/:role/permissions')
  async rolePermissions(@Param('role') role: string) {
    const rows = await this.prisma.rolePermission.findMany({ where: { role } });
    return { role, keys: rows.map(r => r.permissionKey) };
  }

  @Post('admin/roles/:role/permissions')
  @RequirePermissions('roles.manage')
  async setRolePermissions(@Param('role') role: string, @Body() body: { keys?: string[] }) {
    if (!ROLES.includes(role as any)) throw new BadRequestException('Rôle inconnu');
    const keys = Array.isArray(body.keys) ? body.keys.filter(k => k in PERMISSION_LABELS) : [];
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({ data: keys.map(permissionKey => ({ role, permissionKey })) }),
    ]);
    return { role, keys };
  }

private safeSelect() {
    return {
      id: true, email: true, phone: true, firstName: true, lastName: true, role: true, status: true,
      birthDate: true, gender: true, address: true, city: true, emergencyContact: true,
      memberNumber: true, companyId: true, language: true, lastLoginAt: true, createdAt: true,
    } as const;
  }

  @Get('users/me/photo')
  async getMyPhoto(@CurrentUser() auth: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id: auth.id }, select: { photoFileId: true } });
    return { fileId: u?.photoFileId ?? null };
  }

  @Post('beneficiaries/:id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async addBeneficiaryPhoto(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Fichier photo requis');
    const ben = await this.prisma.beneficiary.findFirst({ where: { id, contract: { principalUserId: auth.id } } });
    if (!ben) throw new NotFoundException('Bénéficiaire introuvable');
    const saved = await this.storage.save(auth.id, file);
    const fileObj = await this.prisma.fileObject.create({
      data: { storagePath: saved.storagePath, mime: saved.mime, size: saved.size, sha256: saved.sha256, ownerId: auth.id },
    });
    await this.prisma.beneficiary.update({ where: { id }, data: { photoFileId: fileObj.id } });
    return { ok: true, fileId: fileObj.id };
  }

  @Get('beneficiaries/:id/photo')
  async getBeneficiaryPhoto(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const ben = await this.prisma.beneficiary.findFirst({ where: { id, contract: { principalUserId: auth.id } }, select: { photoFileId: true } });
    if (!ben?.photoFileId) return { fileId: null };
    return { fileId: ben.photoFileId };
  }
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  INSURANCE_MANAGER: 'Gestionnaire assurance',
  SUPPORT_AGENT: 'Agent support',
  COMPANY_ADMIN: "Gestionnaire entreprise",
  MEMBER: 'Assuré',
  PROVIDER: 'Prestataire de santé',
};

@Module({ controllers: [UsersController] })
export class UsersModule {}
