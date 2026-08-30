import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { Public } from '../../common/guards/jwt-auth.guard';

const branchSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const diseaseSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(200),
  category: z.string().max(80).optional(),
  active: z.boolean().optional(),
});

@Injectable()
export class ReferentialService {
  constructor(private prisma: PrismaService) {}

  // Branch
  branches(q?: string) {
    const where: any = {};
    if (q) where.OR = [{ code: { contains: q.toUpperCase() } }, { name: { contains: q } }];
    return this.prisma.branch.findMany({ where, orderBy: { sortOrder: 'asc' } });
  }
  branchById(id: string) { return this.prisma.branch.findUnique({ where: { id } }); }
  createBranch(dto: any) { return this.prisma.branch.create({ data: dto }); }
  updateBranch(id: string, dto: any) { return this.prisma.branch.update({ where: { id }, data: dto }); }

  // Disease
  diseases(q?: string, category?: string, page = 1) {
    const where: any = {};
    if (q) where.OR = [{ code: { contains: q.toUpperCase() } }, { name: { contains: q } }];
    if (category) where.category = category;
    const take = 50;
    return this.prisma.disease.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * take, take }).then(async items => ({ items, total: await this.prisma.disease.count({ where }), page, pages: Math.ceil(await this.prisma.disease.count({ where }) / take) }));
  }
  diseaseById(id: string) { return this.prisma.disease.findUnique({ where: { id } }); }
  createDisease(dto: any) { return this.prisma.disease.create({ data: dto }); }
  updateDisease(id: string, dto: any) { return this.prisma.disease.update({ where: { id }, data: dto }); }
}

@Controller()
export class ReferentialController {
  constructor(private ref: ReferentialService) {}

  @Public()
  @Get('branches')
  branches(@Query('q') q?: string) { return this.ref.branches(q); }

  @Get('admin/branches')
  @RequirePermissions('referential.manage')
  adminBranches(@Query('q') q?: string) { return this.ref.branches(q); }

  @Post('admin/branches')
  @RequirePermissions('referential.manage')
  createBranch(@Body(new ZodPipe(branchSchema)) dto: any) { return this.ref.createBranch(dto); }

  @Post('admin/branches/:id')
  @RequirePermissions('referential.manage')
  updateBranch(@Param('id') id: string, @Body() dto: any) { return this.ref.updateBranch(id, dto); }

  @Public()
  @Get('diseases')
  diseases(@Query('q') q?: string, @Query('category') category?: string, @Query('page') page = '1') { return this.ref.diseases(q, category, Number(page)); }

  @Get('admin/diseases')
  @RequirePermissions('referential.manage')
  adminDiseases(@Query('q') q?: string, @Query('category') category?: string, @Query('page') page = '1') { return this.ref.diseases(q, category, Number(page)); }

  @Post('admin/diseases')
  @RequirePermissions('referential.manage')
  createDisease(@Body(new ZodPipe(diseaseSchema)) dto: any) { return this.ref.createDisease(dto); }

  @Post('admin/diseases/:id')
  @RequirePermissions('referential.manage')
  updateDisease(@Param('id') id: string, @Body() dto: any) { return this.ref.updateDisease(id, dto); }
}

@Module({ controllers: [ReferentialController], providers: [ReferentialService], exports: [ReferentialService] })
export class ReferentialModule {}
