import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma.module';
import { StorageService } from '../files/files.service';
import { parseBirthCertificateText, ParsedBirthCertificate } from './birth-certificate-parser';
import { rasterizePdf } from './pdf-rasterizer';
import { uprightImage, toPng, cropCenterBand } from './image-orientation';

export interface BirthCertificateData {
  firstName: string;
  lastName: string;
  birthDate: Date;
  birthPlace?: string;
  parents?: string;
  documentNumber?: string;
}

export interface VerificationComparison {
  match: boolean;
  confidence: number;
  details: {
    firstName: { match: boolean; extracted: string; provided: string };
    lastName: { match: boolean; extracted: string; provided: string };
    birthDate: { match: boolean; extracted: string; provided: string };
  };
  warnings: string[];
}

export interface VerificationResult extends VerificationComparison {
  initialProfile?: VerificationComparison;
}

export interface InitialProfileData {
  firstName: string;
  lastName: string;
  birthDate: Date;
}

export type VerifyUploadedDocumentInput = BirthCertificateData & {
  initialProfile?: InitialProfileData;
};

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
    file: Express.Multer.File | undefined,
  ): Promise<{ fileId: string; documentType: string }> {
    if (!file) {
      throw new BadRequestException('Fichier acte de naissance requis');
    }
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

    // Conserver le pointeur vers le document téléversé. Tout nouvel upload invalide
    // une vérification antérieure : l'utilisateur doit revérifier ce document précis.
    await this.prisma.systemConfig.upsert({
      where: { key: `birth_cert_verify_${userId}` },
      create: {
        key: `birth_cert_verify_${userId}`,
        value: JSON.stringify({
          fileId: fileObj.id,
          uploadedAt: new Date(),
          result: null,
          verifiedAt: null,
        }),
      },
      update: {
        value: JSON.stringify({
          fileId: fileObj.id,
          uploadedAt: new Date(),
          result: null,
          verifiedAt: null,
        }),
      },
    });

    return {
      fileId: fileObj.id,
      documentType: 'BIRTH_CERTIFICATE',
    };
  }

  // ——— Cache OCR par empreinte du contenu ———
  // L'OCR coûte plusieurs secondes CPU (passe droite, puis OSD + seconde
  // passe si le scan est pivoté) ; un même fichier peut être re-soumis
  // (retry UI, double onglet, vérification répétée). On mémorise le résultat
  // final par sha256 du buffer : borné en taille (FIFO) et en durée (TTL),
  // statique au process pour survivre au recyclage des instances.
  private static readonly OCR_CACHE_MAX = 16;
  private static readonly OCR_TTL_MS = 15 * 60_000;
  private static ocrCache: Map<string, { at: number; result: BirthCertificateData | null }> | null = null;

  private ocrCacheGet(key: string): BirthCertificateData | null | undefined {
    const cache = (BirthCertificateService.ocrCache ??= new Map());
    const hit = cache.get(key);
    if (!hit) return undefined; // miss
    if (Date.now() - hit.at > BirthCertificateService.OCR_TTL_MS) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key); // rafraîchir la récence (FIFO ≈ LRU)
    cache.set(key, hit);
    return hit.result;
  }

  private ocrCacheSet(key: string, result: BirthCertificateData | null): void {
    const cache = (BirthCertificateService.ocrCache ??= new Map());
    cache.delete(key);
    cache.set(key, { at: Date.now(), result });
    while (cache.size > BirthCertificateService.OCR_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  /** Conversion Parsed → contrat API : champs essentiels obligatoires, sinon null (acte sans données complètes). */
  private toExtractionResult(parsed: ParsedBirthCertificate | null): BirthCertificateData | null {
    if (!parsed?.firstName || !parsed.lastName || !parsed.birthDate) return null;
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      birthDate: parsed.birthDate,
      ...(parsed.birthPlace ? { birthPlace: parsed.birthPlace } : {}),
      ...(parsed.parents ? { parents: parsed.parents } : {}),
      ...(parsed.documentNumber ? { documentNumber: parsed.documentNumber } : {}),
    };
  }

  /**
   * Extrait les données de l'acte de naissance par OCR.
   *
   * Stratégie : PDF → texte natif (pdf-parse) ; image (ou PDF scanné sans
   * texte) → OCR Tesseract (fra+eng, worker réutilisé). Renvoie null quand
   * rien d'exploitable n'est extrait — l'appelant retombe sur la saisie
   * manuelle, jamais de blocage du parcours de souscription. Résultat mis en
   * cache par empreinte du contenu (les re-soumissions du même fichier ne
   * repayent pas l'OCR) ; les erreurs transitoires ne sont pas cachées.
   */
  async extractData(fileId: string, requesterId?: string): Promise<BirthCertificateData | null> {
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fichier introuvable');
    if (file.documentType && file.documentType !== 'BIRTH_CERTIFICATE') {
      throw new BadRequestException('Ce document n\'est pas un acte de naissance');
    }
    // L'extraction n'est accessible qu'au propriétaire du document (le parcours
    // de souscription est self-service) et au staff global.
    if (requesterId && file.ownerId !== requesterId) {
      throw new BadRequestException('Ce document n\'appartient pas à votre compte');
    }

    let buffer: Buffer;
    try {
      const read = await this.storage.readFile(file.id);
      if (!read) return null;
      buffer = read.buffer;
    } catch {
      return null; // fichier illisible/inaccessible → saisie manuelle
    }

    // Cache par contenu (pas par fileId) : le même document re-téléversé —
    // donc relu par le stockage — repart du résultat déjà calculé.
    const bufferKey = createHash('sha256').update(buffer).digest('hex');
    const cached = this.ocrCacheGet(bufferKey);
    if (cached !== undefined) return cached;

    let parsed: ParsedBirthCertificate | null = null;
    try {
      if (file.mime === 'application/pdf') {
        parsed = await this.extractFromPdf(buffer);
      } else {
        parsed = await this.extractFromImage(buffer);
      }
    } catch (e) {
      console.error('[birth-certificate] OCR error', e);
      return null; // pas de cache : l'erreur peut être transitoire (boot worker, OSD indisponible…)
    }

    // Conversion : champs partiels acceptés, Date obligatoire pour l'interface.
    // null (« rien d'exploitable sur ce contenu ») est un verdict définitif :
    // il est caché comme les succès.
    const result = this.toExtractionResult(parsed);
    this.ocrCacheSet(bufferKey, result);
    return result;
  }

  /** PDF : texte natif (pdf-parse) ; sinon rasterisation des pages (pdfjs + canvas) → OCR tesseract. */
  private async extractFromPdf(buffer: Buffer): Promise<ParsedBirthCertificate | null> {
    // Limite de taille pour la rasterisation/OCR (coût CPU) : au-delà, texte natif uniquement.
    const OCR_MAX_BYTES = 15 * 1024 * 1024;
    const pdfModule = await import('pdf-parse');
    // pdf-parse est CommonJS : la fonction vit dans `default` (interop ESM→CJS de Node).
    const pdf = ((pdfModule as any).default ?? pdfModule) as (b: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdf(buffer);
    const text: string = parsed?.text ?? '';
    const direct = parseBirthCertificateText(text);
    if (direct.firstName && direct.lastName && direct.birthDate) return direct;

    // PDF scanné (image sous PDF) : pdf-parse n'extrait rien d'utile → on
    // rasterise les premières pages et on laisse l'OCR lire l'image.
    if (buffer.length <= OCR_MAX_BYTES) {
      try {
        for (const image of await rasterizePdf(buffer)) {
          const ocr = await this.extractFromImage(image);
          if (ocr?.firstName && ocr.lastName && ocr.birthDate) return ocr;
        }
      } catch (e) {
        console.error('[birth-certificate] OCR error', e);
      }
    } else {
      console.warn('[birth-certificate] PDF trop volumineux pour la rasterisation OCR — texte natif uniquement');
    }
    return direct.rawText.trim() ? direct : null;
  }

  /**
   * Image (JPEG/PNG/WebP) : OCR tesseract fra+eng, worker réutilisé.
   * Paysage (scan probablement pivoté de 90/270°) : bande centrale légère,
   * puis OSD + passe sur l'image redressée, pleine passe en filet. Portrait :
   * pleine passe d'abord (acte droit ≈ 0,7 s), OSD en relais si elle est
   * muette.
   */
  private async extractFromImage(buffer: Buffer): Promise<ParsedBirthCertificate | null> {
    const worker = await this.getOcrWorker();
    // Décode une seule fois : l'image sert à la bande légère, à l'OSD et au
    // filet pleine passe.
    const canvas = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
    let img: import('@napi-rs/canvas').Image;
    try {
      img = await canvas.loadImage(buffer);
    } catch {
      return this.recognizeParse(worker, buffer); // décodage Skia impossible → passe pleine en filet
    }

    // Un acte est portrait : une image PAYSAGE est donc presque toujours un
    // scan pivoté de 90/270°. On sonde d'abord une bande centrale (l'OCR
    // coûte à peine moins qu'une pleine passe — mesuré ~1,0 s contre ~2,2 s,
    // le temps dépendant surtout du contenu, pas de la hauteur — mais elle
    // évite de payer la pleine résolution sur du texte couché), puis l'OSD
    // prend le relais, la pleine passe ne servant que de filet.
    if (img.width > img.height) {
      const probe = parseBirthCertificateText(await this.recognizeText(worker, await cropCenterBand(img)));
      if (probe?.firstName && probe.lastName && probe.birthDate) return probe;

      try {
        const up = await uprightImage(img);
        if (up.rotationApplied !== 0) {
          const upright = parseBirthCertificateText(await this.recognizeText(worker, await toPng(up.canvas)));
          if (upright?.firstName && upright.lastName && upright.birthDate) return upright;
        }
      } catch {
        // OSD indisponible : best-effort, le filet ci-dessous reste tenté.
      }
      return this.recognizeParse(worker, buffer); // filet : contenu hors bande
    }

    // PORTRAIT : la passe pleine d'abord est le meilleur pari (acte droit
    // ≈ 0,7 s ; une bande coûterait autant — il lui faut ≥ 75 % de hauteur
    // pour porter tous les champs — et ferait perdre les champs hors bande).
    const { data } = await worker.recognize(buffer);
    const text: string = data?.text ?? '';
    const parsed = text.trim() ? parseBirthCertificateText(text) : null;
    if (parsed?.firstName && parsed.lastName && parsed.birthDate) return parsed;

    try {
      const up = await uprightImage(img);
      if (up.rotationApplied === 0) return parsed; // droit (ou OSD muet) : pas de seconde passe
      const upright = parseBirthCertificateText(await this.recognizeText(worker, await toPng(up.canvas)));
      return upright?.firstName && upright.lastName && upright.birthDate ? upright : parsed;
    } catch {
      return parsed; // OSD indisponible : best-effort, on garde la 1re passe
    }
  }

  /** OCR d'un PNG → texte brut (jamais bloquant : '' en cas d'échec). */
  private async recognizeText(worker: any, png: Buffer): Promise<string> {
    try {
      const { data } = await worker.recognize(png);
      return data?.text ?? '';
    } catch {
      return '';
    }
  }

  /** Passe pleine → parse, avec texte brut même sans champ reconnu (retour partiel historique). */
  private async recognizeParse(worker: any, png: Buffer): Promise<ParsedBirthCertificate | null> {
    const text = await this.recognizeText(worker, png);
    return text.trim() ? parseBirthCertificateText(text) : null;
  }

  private ocrWorker: any = null;
  private ocrWorkerBooting: Promise<any> | null = null;

  /** Worker Tesseract paresseux et unique (chargement des données de langue ~une fois par process). */
  private async getOcrWorker(): Promise<any> {
    if (this.ocrWorker) return this.ocrWorker;
    if (!this.ocrWorkerBooting) {
      this.ocrWorkerBooting = (async () => {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('fra+eng');
        this.ocrWorker = worker;
        return worker;
      })().catch(e => {
        this.ocrWorkerBooting = null; // permet un nouveau tentatives au prochain appel
        throw e;
      });
    }
    return this.ocrWorkerBooting;
  }

  /** Empreinte du document : permet à l'UI d'afficher l'extraction sans re-OCR à chaque rendu. */
  documentFingerprint(fileId: string, buffer: Buffer): string {
    return createHash('sha256').update(`${fileId}:${buffer.length}`).digest('hex').slice(0, 16);
  }

  /**
   * Compare les données extraites avec les données fournies par l'utilisateur
   */
  verifyData(
    extracted: BirthCertificateData,
    provided: { firstName: string; lastName: string; birthDate: Date },
  ): VerificationComparison {
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

  private async getState(userId: string): Promise<{
    fileId?: string;
    result?: VerificationResult | null;
    verifiedAt?: string | null;
  } | null> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: `birth_cert_verify_${userId}` },
    });
    if (!config) return null;
    try {
      return JSON.parse(config.value);
    } catch {
      return null;
    }
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
    const data = await this.getState(userId);
    if (!data) return { verified: false };

    return {
      verified: data.result?.match === true,
      fileId: data.fileId,
      result: data.result ?? undefined,
      verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : undefined,
    };
  }

  /**
   * Vérifie les données recopiées depuis le document téléversé.
   * Le document doit appartenir à l'utilisateur et correspondre au dernier upload.
   */
  async verifyUploadedDocument(
    userId: string,
    fileId: string,
    data: VerifyUploadedDocumentInput,
  ): Promise<VerificationResult> {
    if (!fileId) throw new BadRequestException('Identifiant du document requis');

    const state = await this.getState(userId);
    if (!state?.fileId) throw new BadRequestException('Aucun acte de naissance uploadé');
    if (state.fileId !== fileId) {
      throw new BadRequestException('Ce document a été remplacé : téléversez-le à nouveau avant vérification');
    }

    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file || file.ownerId !== userId || file.documentType !== 'BIRTH_CERTIFICATE') {
      throw new BadRequestException('Document acte de naissance introuvable');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, birthDate: true },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.birthDate) throw new BadRequestException('Date de naissance manquante sur le profil utilisateur');

    const { initialProfile, ...extractedData } = data;
    const provided = {
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate as Date,
    };

    const profileResult = this.verifyData(extractedData, provided);
    const initialProfileResult = initialProfile
      ? this.verifyData(extractedData, {
          firstName: initialProfile.firstName,
          lastName: initialProfile.lastName,
          birthDate: new Date(initialProfile.birthDate),
        })
      : undefined;
    const result: VerificationResult = {
      ...profileResult,
      ...(initialProfileResult ? { initialProfile: initialProfileResult } : {}),
    };
    await this.saveVerification(userId, fileId, provided, result);

    return result;
  }
}