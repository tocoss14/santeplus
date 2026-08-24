import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { memberNumber, secureToken } from '../../common/utils';

const registerCompanySchema = z.object({
  companyName: z.string().min(2).max(120),
  sector: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  contactName: z.string().max(120).optional(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
});

const addEmployeeSchema = z.object({
  firstName: z.string().min(2).max(60),
  lastName: z.string().min(2).max(60),
  email: z.string().email().toLowerCase(),
  phone: z.string().max(30).optional(),
  birthDate: z.coerce.date(),
  gender: z.enum(['M', 'F']),
  position: z.string().max(80).optional(),
  beneficiaries: z.array(z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    birthDate: z.coerce.date(),
    gender: z.enum(['M', 'F']),
    relation: z.enum(['SPOUSE', 'CHILD', 'OTHER']),
  })).default([]),
});

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async requireCompany(auth: AuthUser) {
    if (!auth.companyId) throw new ForbiddenException('Compte entreprise requis');
    const company = await this.prisma.company.findUnique({ where: { id: auth.companyId } });
    if (!company || company.status !== 'ACTIVE') throw new ForbiddenException('Entreprise non active');
    return company;
  }

  async groupContract(companyId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { companyId, kind: 'GROUP', status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      include: {
        product: { select: { name: true, code: true } },
        contributions: { orderBy: { sequence: 'asc' } },
      },
    });
    return contract;
  }

  async dashboard(auth: AuthUser) {
    const company = await this.requireCompany(auth);
    const group = await this.groupContract(company.id);
    const [employeesTotal, employeesActive, contracts, claimsAgg] = await Promise.all([
      this.prisma.user.count({ where: { companyId: company.id, role: 'MEMBER' } }),
      this.prisma.user.count({ where: { companyId: company.id, role: 'MEMBER', status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { companyId: company.id, kind: 'INDIVIDUAL', status: 'ACTIVE' } }),
      company.claimsVisibility
        ? this.prisma.claim.aggregate({
            where: { contract: { companyId: company.id }, submittedAt: { not: null } },
            _count: true,
            _sum: { totalRequested: true, totalApproved: true },
          })
        : Promise.resolve(null),
    ]);
    const pendingContributions = group ? group.contributions.filter(c => ['PENDING', 'OVERDUE'].includes(c.status)) : [];
    return {
      company: { id: company.id, name: company.name, claimsVisibility: company.claimsVisibility },
      groupContract: group
        ? { id: group.id, number: group.number, status: group.status, product: group.product, startDate: group.startDate, endDate: group.endDate }
        : null,
      stats: {
        employeesTotal,
        employeesActive,
        employeeContractsActive: contracts,
        pendingContributions: pendingContributions.length,
        nextDueAmount: pendingContributions[0]?.amount ?? null,
        nextDueDate: pendingContributions[0]?.dueDate ?? null,
        claims: claimsAgg
          ? { count: claimsAgg._count, totalRequested: claimsAgg._sum.totalRequested ?? 0, totalApproved: claimsAgg._sum.totalApproved ?? 0 }
          : null,
      },
    };
  }

  async listEmployees(companyId: string, q?: string) {
    const where: any = { companyId, role: 'MEMBER' };
    if (q) where.OR = [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }];
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, birthDate: true,
        memberNumber: true, status: true, createdAt: true,
        contractsAsPrincipal: { select: { id: true, status: true, number: true }, where: { kind: 'INDIVIDUAL', companyId } },
        _count: { select: { beneficiariesAdded: true } },
      },
    });
  }

  parseDate(v: string): Date | null {
    if (!v) return null;
    const s = v.trim();
    let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
  }

  normalizePhone(p?: string): string | null {
    if (!p) return null;
    const digits = p.replace(/[^0-9+]/g, '');
    return digits.length >= 8 ? digits : null;
  }

  async importEmployees(
    auth: AuthUser,
    csvContent: string,
  ): Promise<{ imported: number; errors: { row: number; message: string }[]; tempPasswords: { email: string; password: string }[] }> {
    const company = await this.requireCompany(auth);
    const parsed = Papa.parse<Record<string, string>>(csvContent, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toUpperCase() });
    const rows = parsed.data;
    const errors: { row: number; message: string }[] = [];
    const tempPasswords: { email: string; password: string }[] = [];
    let imported = 0;

    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    const seenIdentity = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const firstName = (row['PRENOM'] ?? row['PRÉNOM'] ?? '').trim();
        const lastName = (row['NOM'] ?? '').trim();
        const email = (row['EMAIL'] ?? '').trim().toLowerCase();
        const phone = this.normalizePhone(row['TELEPHONE'] ?? row['TÉLÉPHONE'] ?? '');
        const birthDate = this.parseDate(row['DATENAISSANCE'] ?? row['DATE NAISSANCE'] ?? row['DATE DE NAISSANCE'] ?? '');
        const position = (row['FONCTION'] ?? row['POSTE'] ?? '').trim() || undefined;

        if (!firstName || !lastName) throw new Error('Nom et prénom requis');
        if (!birthDate) throw new Error('Date de naissance invalide ou manquante (JJ/MM/AAAA)');
        if (!email && !phone) throw new Error('Au moins un email ou un téléphone est requis');
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Email invalide : ${email}`);

        const identityKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthDate.toISOString().slice(0, 10)}`;
        if (seenIdentity.has(identityKey)) throw new Error('Doublon dans le fichier (même identité)');
        seenIdentity.add(identityKey);
        if (email && seenEmails.has(email)) throw new Error('Doublon dans le fichier (email)');
        if (email) seenEmails.add(email);
        if (phone && seenPhones.has(phone)) throw new Error('Doublon dans le fichier (téléphone)');
        if (phone) seenPhones.add(phone);

        if (email) {
          const exists = await this.prisma.user.findUnique({ where: { email } });
          if (exists) throw new Error(`Un compte existe déjà avec cet email`);
        }
        if (phone) {
          const exists = await this.prisma.user.findFirst({ where: { phone } });
          if (exists) throw new Error('Un compte existe déjà avec ce téléphone');
        }

        const beneficiaries = this.parseBeneficiaries(row['AYANTSDROIT'] ?? row['AYANTS DROIT'] ?? row['AYANTS DROITS'] ?? '');

        const result = await this.createEmployee(company.id, {
          firstName, lastName, email: email || '', phone, birthDate, gender: 'M', position, beneficiaries,
        });
        tempPasswords.push({ email: email || phone!, password: result.tempPassword });
        imported++;
      } catch (e: any) {
        errors.push({ row: rowNum, message: e.message ?? 'Erreur inconnue' });
      }
    }
    return { imported, errors, tempPasswords };
  }

  private parseBeneficiaries(raw: string): any[] {
    if (!raw?.trim()) return [];
    const entries = raw.split(/[;\n]/).map(s => s.trim()).filter(Boolean);
    const out: any[] = [];
    for (const entry of entries) {
      const m = entry.match(/^(conjoint|enfant|autre)\s*:\s*([^,]+),\s*(.+)$/i);
      if (!m) continue;
      const relation = /conjoint/i.test(m[1]) ? 'SPOUSE' : /enfant/i.test(m[1]) ? 'CHILD' : 'OTHER';
      const nameParts = m[2].trim().split(/\s+/);
      const dob = this.parseDate(m[3]);
      if (!dob || nameParts.length < 2) continue;
      out.push({
        firstName: nameParts.slice(1).join(' '),
        lastName: nameParts[0],
        birthDate: dob.toISOString(),
        gender: relation === 'SPOUSE' ? 'F' : 'M',
        relation,
      });
    }
    return out;
  }

  async createEmployee(companyId: string, dto: any): Promise<{ userId: string; tempPassword: string }> {
    const tempPassword = `MS-${secureToken(4)}`;
    const user = await this.prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          email: dto.email || `${companyId}-${secureToken(6)}@salaries.local`,
          phone: dto.phone ?? null,
          passwordHash: await bcrypt.hash(tempPassword, 10),
          role: 'MEMBER',
          firstName: dto.firstName,
          lastName: dto.lastName,
          birthDate: dto.birthDate,
          gender: dto.gender,
          companyId,
          memberNumber: memberNumber(),
        },
      });
      const group = await tx.contract.findFirst({ where: { companyId, kind: 'GROUP', status: 'ACTIVE' } });
      if (group) {
        await tx.contract.create({
          data: {
            number: `${group.number}-S${secureToken(2)}`,
            kind: 'INDIVIDUAL',
            status: 'ACTIVE',
            principalUserId: created.id,
            productId: group.productId,
            companyId,
            groupContractId: group.id,
            insurerPartnerId: group.insurerPartnerId,
            startDate: group.startDate,
            endDate: group.endDate,
            premiumAnnual: 0,
            frequency: group.frequency,
            quote: JSON.stringify({ viaGroup: group.number }),
            cardToken: secureToken(16),
          },
        });
        if (dto.beneficiaries?.length) {
          const empContract = await tx.contract.findFirst({ where: { principalUserId: created.id, companyId, kind: 'INDIVIDUAL' } });
          if (empContract) {
            await tx.beneficiary.createMany({
              data: dto.beneficiaries.map((b: any) => ({
                contractId: empContract.id,
                firstName: b.firstName,
                lastName: b.lastName,
                birthDate: new Date(b.birthDate),
                gender: b.gender,
                relation: b.relation,
                memberNumber: memberNumber(),
              })),
            });
          }
        }
      }
      return created;
    });
    return { userId: user.id, tempPassword };
  }

  async exitEmployee(auth: AuthUser, userId: string) {
    void auth;
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('Salarié introuvable');
    await this.prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
      const contracts = await tx.contract.findMany({ where: { principalUserId: userId, companyId: target.companyId, status: 'ACTIVE', kind: 'INDIVIDUAL' } });
      for (const c of contracts) {
        await tx.contract.update({ where: { id: c.id }, data: { status: 'TERMINATED', endDate: new Date() } });
        await tx.beneficiary.updateMany({ where: { contractId: c.id }, data: { status: 'REMOVED', removedAt: new Date() } });
      }
    });
    return { ok: true };
  }
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class CompanyController {
  constructor(
    private companies: CompanyService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('companies/register')
  async register(@Body(new ZodPipe(registerCompanySchema)) dto: any) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Un compte existe déjà avec cet email');
    const company = await this.prisma.company.create({
      data: {
        name: dto.companyName,
        sector: dto.sector,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        contactName: dto.contactName,
        status: 'ACTIVE',
      },
    });
    const admin = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'COMPANY_ADMIN',
        firstName: dto.contactName?.split(' ')[0] ?? 'Contact',
        lastName: dto.contactName?.split(' ').slice(1).join(' ') ?? dto.companyName,
        companyId: company.id,
        memberNumber: memberNumber(),
      },
    });
    return { ok: true, companyId: company.id, userId: admin.id, message: 'Compte entreprise créé.' };
  }

  @Get('company/me/dashboard')
  @RequirePermissions('company.dashboard')
  dashboard(@CurrentUser() auth: AuthUser) {
    return this.companies.dashboard(auth);
  }

  @Get('company/me/group-contract')
  @RequirePermissions('company.contracts.manage')
  async groupContract(@CurrentUser() auth: AuthUser) {
    const company = await this.companies.requireCompany(auth);
    return this.companies.groupContract(company.id);
  }

  @Get('company/me/employees')
  @RequirePermissions('company.employees.manage')
  async employees(@CurrentUser() auth: AuthUser, @Query('q') q?: string) {
    const company = await this.companies.requireCompany(auth);
    return this.companies.listEmployees(company.id, q);
  }

  @Post('company/me/employees')
  @RequirePermissions('company.employees.manage')
  async addEmployee(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(addEmployeeSchema)) dto: any) {
    const company = await this.companies.requireCompany(auth);
    if (dto.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('Email déjà utilisé');
    }
    const result = await this.companies.createEmployee(company.id, dto);
    return { ...result, message: 'Salarié ajouté. Communiquez le mot de passe temporaire au salarié.' };
  }

  @Post('company/me/employees/import')
  @RequirePermissions('company.employees.manage')
  async importEmployees(@CurrentUser() auth: AuthUser, @Body() body: any) {
    if (typeof body?.csv !== 'string' || body.csv.length < 10)
      throw new BadRequestException('Contenu CSV requis (champ csv)');
    return this.companies.importEmployees(auth, body.csv);
  }

  @Patch('company/me/employees/:id')
  async suspendEmployee(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const company = await this.companies.requireCompany(auth);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.companyId !== company.id) throw new NotFoundException();
    return this.companies.exitEmployee(auth, id);
  }

  @Delete('company/me/employees/:id')
  deleteEmployee(@Param('id') id: string) {
    void id;
    throw new BadRequestException("Utilisez la sortie de salarié plutôt que la suppression");
  }

  @Get('company/me/claims')
  @RequirePermissions('company.claims.view')
  async claims(@CurrentUser() auth: AuthUser, @Query('page') page = '1') {
    const company = await this.companies.requireCompany(auth);
    if (!company.claimsVisibility) throw new ForbiddenException('Suivi sinistralité non activé pour cette entreprise');
    return this.prisma.claim.findMany({
      where: { contract: { companyId: company.id }, submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      skip: (Number(page) - 1) * 20,
      take: 20,
      select: {
        reference: true,
        careDate: true,
        status: true,
        totalRequested: true,
        totalApproved: true,
        submittedAt: true,
        paidAt: true,
      },
    });
  }
}

@Module({ controllers: [CompanyController], providers: [CompanyService], exports: [CompanyService] })
export class CompanyModule {}
