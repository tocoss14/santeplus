import { describe, expect, it, vi } from 'vitest';

// I2 — versioning des clés de chiffrement :
//  - payload « v1. » = chiffré avec la clé dédiée FIELD_ENCRYPTION_KEY ;
//  - payload sans préfixe = legacy (dérivé du JWT_SECRET), toujours lisible ;
//  - une clé donnée ne déchiffre jamais les payload d'une autre clé (GCM).
// Chaque scénario recharge le module avec une config mockée (config.ts mocké une fois,
// vi.resetModules + import dynamique pour repartir du state du module).

vi.mock('../src/config', () => ({
  config: {
    jwtSecret: 'test-jwt-secret-for-legacy-derivation',
    fieldEncryptionKey: '',
    isProd: false,
  },
}));

async function loadCrypto(fieldEncryptionKey: string) {
  vi.resetModules();
  const configModule = await import('../src/config');
  (configModule as any).config.fieldEncryptionKey = fieldEncryptionKey;
  return import('../src/common/crypto');
}

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('I2 — versioning des payload chiffrés', () => {
  it('sans clé dédiée (dev) : payload legacy sans préfixe, chiffré/déchiffré avec la clé dérivée du JWT', async () => {
    const { encryptField, decryptField } = await loadCrypto('');
    const enc = encryptField('diagnostic dev');
    expect(enc.startsWith('v1.')).toBe(false);
    expect(decryptField(enc)).toBe('diagnostic dev');
  });

  it('avec clé dédiée : payload préfixé v1. et déchiffrable avec la même clé', async () => {
    const { encryptField, decryptField } = await loadCrypto(KEY_A);
    const enc = encryptField('diagnostic sensible');
    expect(enc.startsWith('v1.')).toBe(true);
    expect(decryptField(enc)).toBe('diagnostic sensible');
  });

  it('rétro-compatibilité : payload legacy (clé dérivée JWT) reste lisible après ajout de la clé dédiée', async () => {
    const legacy = await loadCrypto('');
    const encLegacy = legacy.encryptField('donnée avant rotation');
    expect(encLegacy.startsWith('v1.')).toBe(false);

    const upgraded = await loadCrypto(KEY_A);
    expect(upgraded.decryptField(encLegacy)).toBe('donnée avant rotation');
  });

  it('un payload v1 chiffré avec la clé A est illisible avec la clé B (rotation propre)', async () => {
    const withA = await loadCrypto(KEY_A);
    const enc = withA.encryptField('donnée confidentielle');

    const withB = await loadCrypto(KEY_B);
    expect(withB.decryptField(enc)).toBeNull();
  });

  it('un payload v1 est illisible sans clé dédiée (retour null, jamais de crash)', async () => {
    const withKey = await loadCrypto(KEY_A);
    const enc = withKey.encryptField('donnée confidentielle');

    const withoutKey = await loadCrypto('');
    expect(withoutKey.decryptField(enc)).toBeNull();
  });

  it('cross-key : un payload v1 (clé dédiée) n\'est PAS déchiffrable par la clé legacy dérivée du JWT', async () => {
    const withKey = await loadCrypto(KEY_A);
    const enc = withKey.encryptField('donnée confidentielle');

    // Simule une instance qui n'a jamais eu de clé dédiée mais le même JWT :
    // le déchiffrement doit échouer (le préfixe v1 exige la clé dédiée).
    const withoutKey = await loadCrypto('');
    expect(withoutKey.decryptField(enc)).toBeNull();
  });

  it('payload corrompu → null (GCM tamper detection conservée)', async () => {
    const { encryptField, decryptField } = await loadCrypto(KEY_A);
    const enc = encryptField('intégrité');
    const parts = enc.split('.');
    parts[2] = Buffer.from('corrompu').toString('base64');
    expect(decryptField(parts.join('.'))).toBeNull();
    expect(decryptField('garbage')).toBeNull();
    expect(decryptField(null)).toBeNull();
  });
});
