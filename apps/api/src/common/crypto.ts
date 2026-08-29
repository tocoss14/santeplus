import { createCipheriv, createDecipheriv, createHash, createHash as hsh, randomBytes } from 'crypto';
import { config } from '../config';
import type { AuthUser } from './guards/jwt-auth.guard';

// Clé de chiffrement INDÉPENDANTE du JWT_SECRET pour éviter la perte de données
// lors d'une rotation du JWT. 32 octets hex = 256 bits.
// En développement, utilise une clé de dérivation du JWT_SECRET si FIELD_ENCRYPTION_KEY n'est pas défini.
let encryptionKeyHex = config.fieldEncryptionKey;
if (!encryptionKeyHex || encryptionKeyHex.length < 64) {
  // Fallback : dériver du JWT_SECRET (⚠️ changer de FIELD_ENCRYPTION_KEY = données chiffrées perdues)
  console.warn('[crypto] FIELD_ENCRYPTION_KEY non défini — clé dérivée du JWT_SECRET utilisée');
  encryptionKeyHex = createHash('sha256').update(config.jwtSecret + ':field-enc-dev').digest('hex');
}
const key = Buffer.from(encryptionKeyHex, 'hex');

export const MEDICAL_MASKED = '[Contenu médical restreint]';

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parts = payload.split('.');
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const d = createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function encryptMedical(plain: string): string {
  return encryptField(plain);
}

export function canAccessMedical(requester: AuthUser, ownerId: string, providerId?: string | null): boolean {
  if (!requester) return false;
  if (requester.id === ownerId) return true;
  if (requester.role === 'SUPER_ADMIN' || requester.role === 'INSURANCE_MANAGER') return true;
  if (requester.providerId && providerId && requester.providerId === providerId) return true;
  return false;
}

export function decryptMedical(
  enc: string | null | undefined,
  requester: AuthUser,
  ownerId: string,
  providerId?: string | null,
): string | null {
  if (!enc) return null;
  if (!canAccessMedical(requester, ownerId, providerId)) return null;
  return decryptField(enc);
}

export function sha256(buf: Buffer): string {
  return hsh('sha256').update(buf).digest('hex');
}

export function hmac(secret: string, data: string): string {
  return createHash('sha256').update(`${secret}.${data}`).digest('hex');
}
