import { Body, Controller, Get, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { FilesModule } from '../files/files.service';
import { BirthCertificateService } from './birth-certificate.service';

const initialProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.coerce.date(),
});

// Les données de l'acte NE SONT PAS reçues du client : la vérification les lit
// elle-même sur le document par OCR. Le client ne fournit qu'une recopie
// manuelle, utilisée uniquement quand l'OCR n'a rien extrait du document.
const manualDataSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.coerce.date(),
});

const verifySchema = z.object({
  fileId: z.string().min(5),
  manual: manualDataSchema.optional(),
  initialProfile: initialProfileSchema.optional(),
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
   * Extraction OCR des données de l'acte téléversé (pré-remplissage du formulaire).
   * Réponse { extracted: null } si l'OCR n'a rien pu exploiter → l'UI garde la saisie manuelle.
   */
  @Post('birth-certificate/extract')
  async extract(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(z.object({ fileId: z.string().min(1) }))) dto: { fileId: string }) {
    const extracted = await this.birthCert.extractData(dto.fileId, auth.id);
    return { extracted };
  }

  /**
   * Vérification de l'acte téléversé : le serveur relit lui-même les données
   * par OCR (source non modifiable) et les confronte au profil. La recopie
   * `manual` ne sert qu'en repli, quand l'OCR n'a rien extrait.
   */
  @Post('birth-certificate/verify')
  async verify(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(verifySchema)) dto: any,
  ) {
    const { fileId, ...rest } = dto;
    return this.birthCert.verifyUploadedDocument(auth.id, fileId, rest);
  }

  /**
   * Statut de vérification
   */
  @Get('birth-certificate/status')
  async status(@CurrentUser() auth: AuthUser) {
    return this.birthCert.getVerificationStatus(auth.id);
  }

  /**
   * Comparatif « acte de naissance ↔ compte » pour la page profil :
   * l'UI propose d'aligner le profil sur les données extraites par OCR.
   */
  @Get('birth-certificate/profile-diff')
  async profileDiff(@CurrentUser() auth: AuthUser) {
    return this.birthCert.getProfileDiff(auth.id);
  }
}

@Module({
  imports: [FilesModule],
  controllers: [BirthCertificateController],
  providers: [BirthCertificateService],
  exports: [BirthCertificateService],
})
export class BirthCertificateModule {}