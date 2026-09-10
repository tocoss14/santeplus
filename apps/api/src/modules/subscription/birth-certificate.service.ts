import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { StorageService } from '../files/files.service';

export interface BirthCertificateData {
  firstName: string;
  lastName: string;
  birthDate: Date;
  birthPlace?: string;
  parents?: string;
  documentNumber?: string;
}

export interface VerificationResult {
  match: boolean;
  confidence: number;
  details: {
    firstName: { match: boolean; extracted: string; provided: string };
    lastName: { match: boolean; extracted: string; provided: string };
    birthDate: { match: boolean; extracted: string; provided: string };
  };
  warnings: string[];
}

@Injectable()
export class BirthCertificateService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /**
   * Upload et stocke l'acte de naissance
   */
  async uploadBirthCertificate(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ fileId: string; documentType: string }> {
    // Vérifier le type MIME
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Format non supporté. PDF, JPEG, PNG ou WebP uniquement.');
    }

    // Vérifier la taille (max 10 Mo)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Fichier trop volumineux (max 10 Mo).');
    }

    // Stocker via le service de stockage
    const saved = await this.storage.save(userId, file);

    // Créer l'entrée FileObject
    const fileObj = await this.prisma.fileObject.create({
      data: {
        storagePath: saved.storagePath,
        mime: saved.mime,
        size: saved.size,
        sha256: saved.sha256,
        ownerId: userId,
        documentType: 'BIRTH_CERTIFICATE',
      },
    });

    return {
      fileId: fileObj.id,
      documentType: 'BIRTH_CERTIFICATE',
    };
  }

  /**
   * Extrait les données de l'acte de naissance (OCR basique ou manuel)
   * En production, intégrer un service OCR (Tesseract, AWS Textract, Google Vision, etc.)
   */
  async extractData(fileId: string): Promise<BirthCertificateData | null> {
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fichier introuvable');

    // TODO: Intégrer OCR réel ici
    // Pour l'instant, retourne null = extraction manuelle requise
    // L'admin ou l'utilisateur devra saisir les données extraites
    return null;
  }

  /**
   * Compare les données extraites avec les données fournies par l'utilisateur
   */
  verifyData(
    extracted: BirthCertificateData,
    provided: { firstName: string; lastName: string; birthDate: Date },
  ): VerificationResult {
    const normalize = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

    const firstNameMatch = normalize(extracted.firstName) === normalize(provided.firstName);
    const lastNameMatch = normalize(extracted.lastName) === normalize(provided.lastName);

    const extractedBirth = new Date(extracted.birthDate).toISOString().split('T')[0];
    const providedBirth = new Date(provided.birthDate).toISOString().split('T')[0];
    const birthDateMatch = extractedBirth === providedBirth;

    const warnings: string[] = [];
    if (!firstNameMatch) warnings.push(`Prénom différent : extrait="${extracted.firstName}", fourni="${provided.firstName}"`);
    if (!lastNameMatch) warnings.push(`Nom différent : extrait="${extracted.lastName}", fourni="${provided.lastName}"`);
    if (!birthDateMatch) warnings.push(`Date de naissance différente : extrait="${extractedBirth}", fourni="${providedBirth}"`);

    const match = firstNameMatch && lastNameMatch && birthDateMatch;
    const confidence = (firstNameMatch ? 1 : 0) + (lastNameMatch ? 1 : 0) + (birthDateMatch ? 1 : 0);

    return {
      match,
      confidence: confidence / 3,
      details: {
        firstName: { match: firstNameMatch, extracted: extracted.firstName, provided: provided.firstName },
        lastName: { match: lastNameMatch, extracted: extracted.lastName, provided: provided.lastName },
        birthDate: { match: birthDateMatch, extracted: extractedBirth, provided: providedBirth },
      },
      warnings,
    };
  }

  /**
   * Sauvegarde le résultat de vérification
   */
  async saveVerification(
    userId: string,
    fileId: string,
    providedData: { firstName: string; lastName: string; birthDate: Date },
    result: VerificationResult,
  ) {
    return this.prisma.systemConfig.upsert({
      where: { key: `birth_cert_verify_${userId}` },
      create: {
        key: `birth_cert_verify_${userId}`,
        value: JSON.stringify({
          fileId,
          providedData,
          result,
          verifiedAt: new Date(),
        }),
      },
      update: {
        value: JSON.stringify({
          fileId,
          providedData,
          result,
          verifiedAt: new Date(),
        }),
      },
    });
  }

  /**
   * Récupère le statut de vérification
   */
  async getVerificationStatus(userId: string): Promise<{
    verified: boolean;
    fileId?: string;
    result?: VerificationResult;
    verifiedAt?: Date;
  }> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: `birth_cert_verify_${userId}` },
    });

    if (!config) return { verified: false };

    try {
      const data = JSON.parse(config.value);
      return {
        verified: data.result?.match === true,
        fileId: data.fileId,
        result: data.result,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : undefined,
      };
    } catch {
      return { verified: false };
    }
  }

  /**
   * Vérification manuelle par admin (si OCR échoue ou non disponible)
   */
  async manualVerify(
    userId: string,
    fileId: string,
    extractedData: BirthCertificateData,
  ): Promise<VerificationResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, birthDate: true },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.birthDate) throw new BadRequestException('Date de naissance manquante sur le profil utilisateur');

    // Type assertion since we checked birthDate is not null
    const provided = {
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate!,
    };

    const result = this.verifyData(extractedData, provided);
    await this.saveVerification(userId, fileId, provided, result);

    return result;
  }
}