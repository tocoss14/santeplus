import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Hérmetique : aucun disque réel — on simule dist/build-info.json.
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn<(p: any) => boolean>(() => false),
  readFileSync: vi.fn<(p: any, e?: any) => string>(() => '{}'),
}));
vi.mock('fs', () => ({ existsSync: fsMock.existsSync, readFileSync: fsMock.readFileSync }));

import { HealthController } from '../src/modules/admin-misc/admin-misc.controller';

const controller = new HealthController();

describe('GET /api/version — sonde de version pour deploy.yml', () => {
  beforeEach(() => {
    delete process.env.APP_VERSION;
    delete process.env.BUILT_AT;
    delete process.env.RENDER_GIT_COMMIT;
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    delete process.env.APP_VERSION;
    delete process.env.BUILT_AT;
    delete process.env.RENDER_GIT_COMMIT;
  });

  it('dist/build-info.json absent (dev hors Docker) → valeurs nulles, jamais d’erreur', () => {
    const res = controller.version();
    expect(res.service).toBe('santeplus-api');
    expect(res.version).toBeNull();
    expect(res.builtAt).toBeNull();
    expect(typeof res.time).toBe('string');
  });

  it('dist/build-info.json tamponné par le Dockerfile → SHA et builtAt exposés', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{"version":"abc123def","builtAt":"2026-09-27T08:00:00Z"}');
    const res = controller.version();
    expect(res.version).toBe('abc123def');
    expect(res.builtAt).toBe('2026-09-27T08:00:00Z');
  });

  it('APP_VERSION/BUILT_AT en variable d’environnement → prioritaires sur le fichier (image GHCR sans SHA Render)', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{"version":"sha-de-l-image","builtAt":"2026-09-01T00:00:00Z"}');
    process.env.APP_VERSION = 'sha-du-runtime';
    process.env.BUILT_AT = '2026-09-27T09:00:00Z';
    const res = controller.version();
    expect(res.version).toBe('sha-du-runtime');
    expect(res.builtAt).toBe('2026-09-27T09:00:00Z');
  });

  it('image bâtie sans tampon (ancien build) sur Render → RENDER_GIT_COMMIT runtime referme la chaîne', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{"version":"","builtAt":""}');
    process.env.RENDER_GIT_COMMIT = 'sha-du-deploy-render';
    const res = controller.version();
    expect(res.version).toBe('sha-du-deploy-render');
    expect(res.builtAt).toBeNull();
  });

  it('tampon périmé (couche Docker réutilisée) → le SHA runtime fait foi', () => {
    // Cas réel du 2026-10-23 : un commit qui ne touche aucun fichier copié par
    // le Dockerfile réutilise la couche de tampon, qui désigne donc le commit
    // précédent. La production tournait sur le bon code ; seule la sonde
    // mentait, et la certification du déploiement échouait.
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{"version":"sha-dans-l-image","builtAt":"2026-10-23T22:39:33Z"}');
    process.env.RENDER_GIT_COMMIT = 'sha-du-deploy-render';
    const res = controller.version();
    expect(res.version).toBe('sha-du-deploy-render');
    // builtAt documente l'image, pas le commit : il peut rester en arrière.
    expect(res.builtAt).toBe('2026-10-23T22:39:33Z');
  });

  it('le SHA runtime prime aussi sur APP_VERSION (variable périmée côté plateforme)', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{"version":"sha-dans-l-image","builtAt":"2026-10-23T22:39:33Z"}');
    process.env.APP_VERSION = 'sha-fige-dans-l-env';
    process.env.RENDER_GIT_COMMIT = 'sha-du-deploy-render';
    expect(controller.version().version).toBe('sha-du-deploy-render');
  });

  it('build-info.json corrompu → dégradation gracieuse en valeurs nulles', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('{json invalide');
    const res = controller.version();
    expect(res.version).toBeNull();
    expect(res.builtAt).toBeNull();
  });
});
