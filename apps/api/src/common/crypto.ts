import { createCipheriv, createDecipheriv, createHash, createHash as hsh, randomBytes } from 'crypto';
import { config } from '../config';
import type { AuthUser } from './guards/jwt-auth.guard';

// Clé de chiffrement INDÉPENDANTE du JWT_SECRET pour éviter la perte de données
// lors d'une rotation du JWT. 32 octets hex = 256 bits.
// En prod sans FIELD_ENCRYPTION_KEY, dérive du JWT_SECRET (avertissement) pour éviter crash au démarrage.
//
// Versioning (I2) : les payload chiffrés après déploiement sont préfixés « v1. »
// (chiffrement avec la clé dédiée FIELD_ENCRYPTION_KEY). Les payload legacy sans
// préfixe restent déchiffrables avec la clé de dérivation JWT — un payload v1 ne
// peut jamais être déchiffré avec la clé legacy et inversement (tampering détecté
// par GCM). Chiffrement toujours en v1 dès qu'une clé dédiée est disponible.
const hasDedicatedKey = Boolean(config.fieldEncryptionKey) && config.fieldEncryptionKey.length >= 64;
let encryptionKeyHex = config.fieldEncryptionKey;
if (!hasDedicatedKey) {
  console.warn('[crypto] FIELD_ENCRYPTION_KEY manquant/invalide — clé dérivée du JWT_SECRET utilisée (définir FIELD_ENCRYPTION_KEY en prod pour persistance)');
  encryptionKeyHex = createHash('sha256').update(config.jwtSecret + ':field-enc-dev').digest('hex');
}
const key = Buffer.from(encryptionKeyHex, 'hex');
// Clé legacy : dérivation déterministe du JWT_SECRET (payloads antérieurs au versioning).
const legacyKey = Buffer.from(createHash('sha256').update(config.jwtSecret + ':field-enc-dev').digest('hex'), 'hex');
const CURRENT_PAYLOAD_VERSION = 'v1';

export const MEDICAL_MASKED = '[Contenu médical restreint]';

export function encryptField(plain: string): string {
  // Versioning : sans clé dédiée on reste au format legacy (sinon les payload
  // deviendraient illisibles dès que la clé dédiée serait ajoutée).
  if (!hasDedicatedKey) return encryptWithKey(plain, key);
  return `${CURRENT_PAYLOAD_VERSION}.${encryptWithKey(plain, key)}`;
}

function encryptWithKey(plain: string, k: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    // v1 = chiffrement avec la clé dédiée ; sans préfixe = legacy (dérivation JWT).
    if (payload.startsWith('v1.')) {
      if (!hasDedicatedKey) return null; // clé dédiée absente : impossible de déchiffrer v1
      return decryptWithKey(payload.slice(3), key);
    }
    return decryptWithKey(payload, legacyKey);
  } catch {
    return null;
  }
}

function decryptWithKey(payload: string, k: Buffer): string | null {
  try {
    const parts = payload.split('.');
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const d = createDecipheriv('aes-256-gcm', k, iv);
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
