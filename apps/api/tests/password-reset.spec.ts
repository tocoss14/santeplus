import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetTokenParamSchema } from '../src/modules/auth/dto';
import { ZodPipe } from '../src/common/pipes/zod.pipe';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// ─── Mock Prisma (sous-ensemble utilisé par le parcours de réinitialisation) ──
function mockPrisma() {
  const tokens: any[] = [];
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email === 'jean@demo.bj') {
          return { id: 'user-1', email: 'jean@demo.bj', firstName: 'Jean', status: 'ACTIVE' };
        }
        if (where.id === 'user-1') return { id: 'user-1', email: 'jean@demo.bj' };
        return null;
      }),
      update: vi.fn(async () => ({})),
    },
    refreshToken: { updateMany: vi.fn(async () => ({})) },
    passwordResetToken: {
      create: vi.fn(async ({ data }: any) => {
        tokens.push({ id: `tok-${tokens.length + 1}`, usedAt: null, ...data });
        return data;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = tokens.find(t => t.tokenHash === where.tokenHash);
        if (!row) return null;
        // Reproduit le `include: { user }` de resetPassword().
        return include?.user ? { ...row, user: { id: row.userId, email: 'jean@demo.bj' } } : row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const t = tokens.find(x => x.id === where.id)!;
        Object.assign(t, data);
        return t;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let n = 0;
        for (const t of tokens) {
          if (t.userId === where.userId && t.usedAt === null && where.usedAt === null) {
            Object.assign(t, data);
            n++;
          }
        }
        return { count: n };
      }),
    },
    _tokens: tokens,
  } as any;
  return prisma;
}

const mockJwt = () => ({ sign: vi.fn(), verify: vi.fn() }) as any;
const mockDispatch = () => ({ dispatchToUser: vi.fn(async () => {}) }) as any;

/** Récupère le token en clair contenu dans le lien envoyé par e-mail. */
function tokenFromEmail(dispatch: any): string {
  const html = dispatch.dispatchToUser.mock.calls.at(-1)![1].html as string;
  return /token=([a-f0-9]{64})/.exec(html)![1];
}

describe('Schéma du paramètre de lien (GET /auth/reset-password/:token)', () => {
  // Régression : `@Param` transmet la valeur BRUTE du paramètre d'URL. Appliquer
  // ici un schéma objet (`z.object({ token })`) faisait échouer la route en 400
  // pour tout lien valide — la page de réinitialisation était inutilisable.
  it('accepte le token en clair issu du paramètre d\'URL', () => {
    const pipe = new ZodPipe(resetTokenParamSchema);
    const token = 'a'.repeat(64);
    expect(pipe.transform(token, { type: 'param' } as any)).toBe(token);
  });

  it('refuse un token trop court (400 plutôt qu\'une recherche en base hasardeuse)', () => {
    const pipe = new ZodPipe(resetTokenParamSchema);
    expect(() => pipe.transform('trop-court', { type: 'param' } as any)).toThrow();
  });
});

describe('Mot de passe oublié — AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let dispatch: ReturnType<typeof mockDispatch>;

  beforeEach(() => {
    prisma = mockPrisma();
    dispatch = mockDispatch();
    service = new AuthService(prisma as any, mockJwt(), dispatch);
  });

  describe('requestPasswordReset — anti-énumération', () => {
    it('email inconnu : réponse identique, aucun token, aucun e-mail', async () => {
      await expect(service.requestPasswordReset('inconnu@test.bj')).resolves.toEqual({ sent: true });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(dispatch.dispatchToUser).not.toHaveBeenCalled();
    });

    it('email connu : réponse identique (aucune fuite d\'existence)', async () => {
      await expect(service.requestPasswordReset('jean@demo.bj')).resolves.toEqual({ sent: true });
    });

    it('ne persiste que l\'empreinte SHA-256, jamais le token en clair', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      const plain = tokenFromEmail(dispatch);
      const stored = prisma._tokens[0];
      expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.tokenHash).not.toBe(plain);
      expect(prisma._tokens.some((t: any) => t.tokenHash === plain)).toBe(false);
    });

    it('envoie l\'e-mail en mode forcé : NOTIFY_EMAIL_TOPICS ne peut pas le supprimer', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      const input = dispatch.dispatchToUser.mock.calls[0][1];
      expect(input.topic).toBe('PASSWORD_RESET');
      expect(input.force).toBe(true);
      expect(input.html).toContain('1 heure');
    });

    it('demande suivante : la précédente est neutralisée (un seul lien valide)', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      await service.requestPasswordReset('jean@demo.bj');
      expect(prisma._tokens.filter((t: any) => t.usedAt === null).length).toBe(1);
    });

    it('quota 3/h : la 4e demande est neutralisée, réponse identique, aucun envoi', async () => {
      prisma.user.findUnique = vi.fn(async () => ({ id: 'user-9', email: 'quota@test.bj', firstName: 'Q', status: 'ACTIVE' }));
      for (let i = 0; i < 3; i++) {
        await expect(service.requestPasswordReset('quota@test.bj')).resolves.toEqual({ sent: true });
      }
      expect(dispatch.dispatchToUser).toHaveBeenCalledTimes(3);
      await expect(service.requestPasswordReset('quota@test.bj')).resolves.toEqual({ sent: true });
      expect(dispatch.dispatchToUser).toHaveBeenCalledTimes(3);
    });

    it('compte suspendu : aucun e-mail, réponse identique', async () => {
      prisma.user.findUnique = vi.fn(async () => ({ id: 'user-8', email: 'susp@test.bj', firstName: 'S', status: 'SUSPENDED' }));
      await expect(service.requestPasswordReset('susp@test.bj')).resolves.toEqual({ sent: true });
      expect(dispatch.dispatchToUser).not.toHaveBeenCalled();
    });
  });

  describe('checkResetToken', () => {
    it('token valide et non consommé', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      await expect(service.checkResetToken(tokenFromEmail(dispatch))).resolves.toEqual({ valid: true });
    });

    it('token inconnu, consommé ou expiré → invalide', async () => {
      await expect(service.checkResetToken('f'.repeat(64))).resolves.toEqual({ valid: false });

      await service.requestPasswordReset('jean@demo.bj');
      const token = tokenFromEmail(dispatch);
      await service.resetPassword(token, 'Nouveau123');
      await expect(service.checkResetToken(token)).resolves.toEqual({ valid: false });

      await service.requestPasswordReset('jean@demo.bj');
      const soon = tokenFromEmail(dispatch);
      prisma._tokens.find((t: any) => t.tokenHash === sha256(soon)).expiresAt = new Date(Date.now() - 1000);
      await expect(service.checkResetToken(soon)).resolves.toEqual({ valid: false });
    });
  });

  describe('resetPassword', () => {
    it('change le mot de passe, pose le token et révoque les sessions', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      const token = tokenFromEmail(dispatch);

      await expect(service.resetPassword(token, 'Nouveau123')).resolves.toEqual({ ok: true });

      expect(bcrypt.getRounds(prisma.user.update.mock.calls[0][0].data.passwordHash)).toBe(10);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
      expect(prisma._tokens.every((t: any) => t.usedAt !== null)).toBe(true);
    });

    it('token à usage unique : la seconde tentative échoue', async () => {
      await service.requestPasswordReset('jean@demo.bj');
      const token = tokenFromEmail(dispatch);
      await service.resetPassword(token, 'Nouveau123');
      await expect(service.resetPassword(token, 'Autre123')).rejects.toThrow('invalide ou a expiré');
    });

    it('token inconnu ou expiré : refus explicite, aucun changement', async () => {
      await expect(service.resetPassword('a'.repeat(64), 'Nouveau123')).rejects.toThrow('invalide ou a expiré');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});