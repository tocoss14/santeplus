import { BadRequestException, Body, Controller, Get, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { BirthCertificateService } from './birth-certificate.service';

const extractedDataSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.coerce.date(),
  birthPlace: z.string().optional(),
  parents: z.string().optional(),
  documentNumber: z.string().optional(),
});

@Controller('subscription')
export class BirthCertificateController {
  constructor(private birthCert: BirthCertificateService) {}

  /**
   * Upload de l'acte de naissance (multipart/form-data)
   */
  @Post('birth-certificate/upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() auth: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.birthCert.uploadBirthCertificate(auth.id, file);
  }

  /**
   * Vérification manuelle (admin ou utilisateur saisit les données extraites)
   */
  @Post('birth-certificate/verify')
  async verify(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(extractedDataSchema)) dto: any,
  ) {
    // Récupérer le dernier fichier uploadé
    const config = await this.birthCert['prisma'].systemConfig.findUnique({
      where: { key: `birth_cert_verify_${auth.id}` },
    });

    if (!config) throw new BadRequestException('Aucun acte de naissance uploadé');

    let data: { fileId: string } = { fileId: '' };
    try {
      data = JSON.parse(config.value).fileId;
    } catch {
      throw new BadRequestException('État de vérification invalide');
    }

    return this.birthCert.manualVerify(auth.id, data.fileId, dto);
  }

  /**
   * Statut de vérification
   */
  @Get('birth-certificate/status')
  async status(@CurrentUser() auth: AuthUser) {
    return this.birthCert.getVerificationStatus(auth.id);
  }
}

@Module({
  controllers: [BirthCertificateController],
  providers: [BirthCertificateService],
  exports: [BirthCertificateService],
})
export class BirthCertificateModule {}