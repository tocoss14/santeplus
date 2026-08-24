import { createCipheriv, createDecipheriv, createHash, createHash as hsh, randomBytes } from 'crypto';
import { config } from '../config';

const key = createHash('sha256').update(config.jwtSecret + ':field-enc').digest();

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

export function sha256(buf: Buffer): string {
  return hsh('sha256').update(buf).digest('hex');
}

export function hmac(secret: string, data: string): string {
  return createHash('sha256').update(`${secret}.${data}`).digest('hex');
}
