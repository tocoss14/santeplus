import { describe, expect, it, vi } from 'vitest';
import { resolveThreshold } from '../src/domain/engine';

// I1 : le seuil global de secours (anciennement codé en dur 150000 dans
// resolveThreshold) est désormais passé par les contrôleurs, lu depuis
// SystemConfig `thirdPartyAuthGlobalFallback` (défaut '150000').

describe('I1 — resolveThreshold avec fallback global injecté', () => {
  it('défaut du contrôleur : 150000 quand ni produit ni acte ne définissent de seuil', () => {
    expect(resolveThreshold(null, null, 150000)).toBe(150000);
    expect(resolveThreshold(undefined, undefined, 150000)).toBe(150000);
  });

  it('valeur SystemConfig personnalisée : 250000 éditable admin', () => {
    expect(resolveThreshold(null, null, 250000)).toBe(250000);
  });

  it('le seuil produit le plus restrictif gagne toujours sur le fallback global', () => {
    expect(resolveThreshold(50000, null, 150000)).toBe(50000);
    expect(resolveThreshold(null, 80000, 150000)).toBe(80000);
    expect(resolveThreshold(50000, 80000, 150000)).toBe(50000);
  });

  it('seuils négatifs ou nuls ignorés (comportement historique conservé)', () => {
    expect(resolveThreshold(-1, 0, 150000)).toBe(150000);
  });

  it('compatibilité : appel sans 3e argument garde le défaut 150000 (signature historique)', () => {
    expect(resolveThreshold(null, null)).toBe(150000);
  });

  it('getSystemConfig lit SystemConfig avec fallback (convention contrôleurs)', async () => {
    // Réplique exacte du helper utilisé dans care/provider-portal : la clé
    // `thirdPartyAuthGlobalFallback` doit primer sur le défaut '150000'.
    const prisma = {
      systemConfig: { findUnique: vi.fn(async ({ where }: any) => (where.key === 'thirdPartyAuthGlobalFallback' ? { key: where.key, value: '250000' } : null)) },
    };
    async function getSystemConfig(key: string, fallback: string): Promise<string> {
      try {
        const row = await (prisma as any).systemConfig.findUnique({ where: { key } });
        return row?.value ?? fallback;
      } catch {
        return fallback;
      }
    }
    const raw = await getSystemConfig('thirdPartyAuthGlobalFallback', '150000');
    expect(raw).toBe('250000');
    expect(resolveThreshold(null, null, Number(raw))).toBe(250000);
  });

  it('getSystemConfig retombe sur le défaut si SystemConfig injoignable', async () => {
    const prisma = { systemConfig: { findUnique: vi.fn(async () => { throw new Error('db down'); }) } };
    async function getSystemConfig(key: string, fallback: string): Promise<string> {
      try {
        const row = await (prisma as any).systemConfig.findUnique({ where: { key } });
        return row?.value ?? fallback;
      } catch {
        return fallback;
      }
    }
    const raw = await getSystemConfig('thirdPartyAuthGlobalFallback', '150000');
    expect(raw).toBe('150000');
    expect(resolveThreshold(null, null, Number(raw))).toBe(150000);
  });
});
