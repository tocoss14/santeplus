import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorageService } from '../src/modules/files/files.service';
import { JwtService } from '../src/common/guards/jwt.service';

// Hérmetique : pas de lecture disque réelle dans ces tests d'autorisation.
vi.mock('fs', () => ({
  createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('x')),
  writeFileSync: vi.fn(),
}));

const FILE_ID = 'file-1';

function serviceWith(fileRow: any, claimDoc: any, jwtUser: any = null, jwtSub = 'u-jwt') {
  const prisma: any = {
    fileObject: { findUnique: vi.fn(async () => fileRow) },
    claimDocument: { findFirst: vi.fn(async () => claimDoc) },
    user: { findUnique: vi.fn(async () => jwtUser) },
  };
  const jwt: any = { verify: vi.fn(() => ({ sub: jwtSub, type: 'access' })) };
  const svc = new StorageService(prisma, jwt as unknown as JwtService);
  vi.spyOn(svc as any, 's3Enabled').mockReturnValue(false);
  return { svc, prisma, jwt };
}

function res() {
  return { setHeader: vi.fn() } as any;
}

const INVOICE_FILE = { id: FILE_ID, ownerId: 'u-owner', mime: 'application/pdf', storagePath: 'x.pdf' };
const DOC_ON_CLAIM = {
  claim: { claimantUserId: 'u-owner', contract: { principalUserId: 'u-principal', companyId: 'co-1' } },
};

describe('StorageService.open — matrice d’accès aux pièces jointes', () => {
  it('staff : accès accordé (gestionnaire assureur)', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    const auth = { id: 'u-staff', email: 'g@x.bj', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };
    await expect(svc.open(auth, FILE_ID, res(), { headers: {} })).resolves.toBeUndefined();
  });

  it('propriétaire du fichier : accès accordé', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    const auth = { id: 'u-owner', email: 'f@x.bj', role: 'MEMBER', companyId: null, providerId: null };
    await expect(svc.open(auth, FILE_ID, res(), { headers: {} })).resolves.toBeUndefined();
  });

  it('assuré principal du contrat : accès accordé', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    const auth = { id: 'u-principal', email: 'p@x.bj', role: 'MEMBER', companyId: null, providerId: null };
    await expect(svc.open(auth, FILE_ID, res(), { headers: {} })).resolves.toBeUndefined();
  });

  it('admin de la compagnie du contrat : accès accordé', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    const auth = { id: 'u-coadmin', email: 'c@x.bj', role: 'COMPANY_ADMIN', companyId: 'co-1', providerId: null };
    await expect(svc.open(auth, FILE_ID, res(), { headers: {} })).resolves.toBeUndefined();
  });

  it('visiteur anonyme sans lien : 403 (l’ancien bug rendait 403 à TOUT le monde)', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    await expect(svc.open(null, FILE_ID, res(), { headers: {} })).rejects.toThrow(ForbiddenException);
  });

  it('utilisateur connecté sans lien : 403', async () => {
    const { svc } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    const auth = { id: 'u-other', email: 'o@x.bj', role: 'MEMBER', companyId: null, providerId: null };
    await expect(svc.open(auth, FILE_ID, res(), { headers: {} })).rejects.toThrow(ForbiddenException);
  });

  it('repli JWT : un token valide dans la requête identifie le staff quand auth est absent', async () => {
    const { svc, jwt } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM, { id: 'u-jwt', email: 'g@x.bj', role: 'INSURANCE_MANAGER', status: 'ACTIVE', companyId: null, providerId: null });
    const req = { headers: { authorization: 'Bearer tok' }, cookies: {} };
    await expect(svc.open(null, FILE_ID, res(), req)).resolves.toBeUndefined();
    expect(jwt.verify).toHaveBeenCalledWith('tok');
  });

  it('repli JWT : identifie le propriétaire du document via cookie de session', async () => {
    const { svc, prisma } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM, { id: 'u-owner', email: 'f@x.bj', role: 'MEMBER', status: 'ACTIVE', companyId: null, providerId: null }, 'u-owner');
    const req = { headers: {}, cookies: { sp_access: 'cookie-tok' } };
    await expect(svc.open(null, FILE_ID, res(), req)).resolves.toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u-owner' } }));
  });

  it('repli JWT : token expiré → repli à anonyme → 403 (jamais 500)', async () => {
    const { svc, jwt } = serviceWith(INVOICE_FILE, DOC_ON_CLAIM);
    (jwt.verify as any).mockImplementation(() => { throw new Error('jwt expired'); });
    const req = { headers: { authorization: 'Bearer expired' }, cookies: {} };
    await expect(svc.open(null, FILE_ID, res(), req)).rejects.toThrow(ForbiddenException);
  });

  it('photo prestataire : publique, aucun contrôle', async () => {
    const { svc } = serviceWith({ id: FILE_ID, ownerId: 'u-provider', mime: 'image/jpeg', storagePath: 'p.jpg', documentType: 'PROVIDER_PHOTO' }, null);
    await expect(svc.open(null, FILE_ID, res(), { headers: {} })).resolves.toBeUndefined();
  });

  it('fichier introuvable : 404', async () => {
    const { svc } = serviceWith(null, null);
    await expect(svc.open(null, FILE_ID, res(), { headers: {} })).rejects.toThrow(NotFoundException);
  });
});
