import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { Response } from 'express';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AuthUser, JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.module';
import { config } from '../../config';
import { sha256 } from '../../common/crypto';
import { RequirePermissions } from '../../common/guards/permissions.guard';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE = 8 * 1024 * 1024;

@Injectable()
export class StorageService {
  private s3: S3Client | null = null;

  private s3Enabled(): boolean {
    return Boolean(config.s3Endpoint && config.s3Bucket && config.s3AccessKeyId && config.s3SecretAccessKey);
  }

  private client(): S3Client {
    if (!this.s3) {
      this.s3 = new S3Client({
        region: config.s3Region,
        endpoint: config.s3Endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.s3AccessKeyId!,
          secretAccessKey: config.s3SecretAccessKey!,
        },
      });
    }
    return this.s3;
  }

  async save(ownerId: string, file: Express.Multer.File, opts?: { documentType?: string; tags?: string[] }): Promise<{ storagePath: string; mime: string; size: number; sha256: string }> {
    if (!ALLOWED_MIMES.includes(file.mimetype)) throw new BadRequestException('Format non autorisé (JPEG, PNG, WebP, PDF)');
    if (file.size > MAX_SIZE) throw new BadRequestException('Fichier trop volumineux (max 8 Mo)');
    const hash = sha256(file.buffer);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extname(file.originalname).slice(0, 10)}`;
    if (this.s3Enabled()) {
      await this.client().send(new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: name,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
    } else {
      if (!existsSync(config.uploadsDir)) mkdirSync(config.uploadsDir, { recursive: true });
      writeFileSync(join(config.uploadsDir, name), file.buffer);
    }
    return { storagePath: name, mime: file.mimetype, size: file.size, sha256: hash };
  }

  async saveBuffer(ownerId: string, buffer: Buffer, fileName: string, mime = 'application/pdf'): Promise<{ storagePath: string; mime: string; size: number; sha256: string }> {
    const hash = sha256(buffer);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extname(fileName).slice(0, 10) || '.pdf'}`;
    if (this.s3Enabled()) {
      await this.client().send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: name, Body: buffer, ContentType: mime }));
    } else {
      if (!existsSync(config.uploadsDir)) mkdirSync(config.uploadsDir, { recursive: true });
      writeFileSync(join(config.uploadsDir, name), buffer);
    }
    return { storagePath: name, mime, size: buffer.length, sha256: hash };
  }

  async open(auth: AuthUser, fileId: string, res: Response) {
    const f = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException('Fichier introuvable');
    // Provider photos are public
    if ((f as any).documentType === 'PROVIDER_PHOTO') {
      // allow public
    } else {
      const isStaff = auth && ['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT'].includes(auth.role);
      if (f.ownerId !== auth?.id && !isStaff) {
        const doc = await this.prisma.claimDocument.findFirst({
          where: { fileId },
          select: { claim: { select: { claimantUserId: true, contract: { select: { principalUserId: true, companyId: true } } } } },
        });
        const allowed =
          doc &&
          (doc.claim.claimantUserId === auth?.id ||
            doc.claim.contract.principalUserId === auth?.id ||
            (auth?.role === 'COMPANY_ADMIN' && auth?.companyId && doc.claim.contract.companyId === auth.companyId));
        if (!allowed) throw new ForbiddenException();
      }
    }
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${f.storagePath}"`);

    if (this.s3Enabled()) {
      const obj = await this.client().send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: f.storagePath }));
      (obj.Body as any as NodeJS.ReadableStream).pipe(res);
      return;
    }
    const path = join(config.uploadsDir, f.storagePath);
    if (!existsSync(path)) throw new NotFoundException('Fichier absent du stockage');
    createReadStream(path).pipe(res);
  }

  constructor(private prisma: PrismaService) {}
}

@Controller()
export class FilesController {
  constructor(private storage: StorageService, private prisma: PrismaService) {}

  @Get('files/:id/view')
  @Public()
  view(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Res() res: Response) {
    return this.storage.open(auth ?? { id: '', role: '', providerId: null, companyId: null } as any, id, res);
  }

  @Get('admin/documents')
  @RequirePermissions('members.read')
  async adminDocs(@Query('q') q?: string, @Query('documentType') documentType?: string, @Query('page') page = '1') {
    const where: any = {};
    if (q) where.OR = [{ storagePath: { contains: q } }, { tags: { contains: q } }];
    if (documentType) where.documentType = documentType;
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.fileObject.findMany({ where, include: { owner: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * take, take }),
      this.prisma.fileObject.count({ where }),
    ]);
    return { items, total, page: Number(page), pages: Math.ceil(total / take) };
  }
}

@Module({ controllers: [FilesController], providers: [StorageService], exports: [StorageService] })
export class FilesModule {}
