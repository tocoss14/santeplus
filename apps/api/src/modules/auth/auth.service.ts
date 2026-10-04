import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.module';
import { JwtService } from '../../common/guards/jwt.service';
import { memberNumber } from '../../common/utils';
import { encryptField } from '../../common/crypto';
import { config } from '../../config';
import { changePasswordSchema, loginSchema, registerSchema } from './dto';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { welcomeEmail, smsTemplates, passwordResetEmail } from '../../common/notifications/email-templates';

interface LoginAttempt {
  count: number;
  lockedUntil?: number;
}

interface ResetRequestWindow {
  count: number;
  windowStart: number;
}

/** SHA-256 hex du token de réinitialisation : c'est la seule forme persistée. */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private attempts = new Map<string, LoginAttempt>();
  private MAX_ATTEMPTS = 5;
  private LOCK_MS = 15 * 60 * 1000;

  // Anti-abus « mot de passe oublié » : borne le nombre d'e-mails envoyés par
  // adresse et par heure, pour qu'un attaquant ne puisse pas inonder une boîte
  // ni utiliser l'endpoint comme oracle de bombardage.
  private resetRequests = new Map<string, ResetRequestWindow>();
  private MAX_RESET_REQUESTS = 3;
  private RESET_WINDOW_MS = 60 * 60 * 1000;
  private RESET_TTL_MS = 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private dispatch: NotificationDispatchService,
  ) {}

  async register(dto: typeof registerSchema._input) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet email');

    // Lookup distributor from referral code if provided
    let referredById: string | undefined;
    if (dto.referralCode) {
      const distributor = await this.prisma.distributor.findUnique({
        where: { referralCode: dto.referralCode.toUpperCase() },
      });
      if (distributor && distributor.status === 'ACTIVE') {
        // ANTI-FRAUDE : max 5 inscriptions par jour par distributeur
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await this.prisma.user.count({
          where: {
            referredById: distributor.id,
            createdAt: { gte: todayStart },
          },
        });
        if (todayCount >= 5) {
          throw new BadRequestException(
            'Ce lien de parrainage a atteint la limite quotidienne. Réessayez demain.',
          );
        }
        referredById = distributor.id;
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'MEMBER',
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        birthDate: dto.birthDate ?? null,
        gender: dto.gender ?? null,
        memberNumber: memberNumber(),
        referredById: referredById ?? null,
        consentGivenAt: dto.consent ? new Date() : null,
      },
    });

    // Increment distributor's totalRecruited
    if (referredById) {
      await this.prisma.distributor.update({
        where: { id: referredById },
        data: { totalRecruited: { increment: 1 } },
      }).catch(() => {}); // non-blocking
    }
    // Send welcome notification (email + SMS)
    await this.dispatch.dispatchToUser(user.id, {
      topic: 'WELCOME',
      title: `Bienvenue sur SantéPlus, ${user.firstName} !`,
      body: `Votre compte a été créé. Souscrivez une formule pour activer votre couverture santé.`,
      html: welcomeEmail(user.firstName, `${process.env.APP_URL ?? 'https://santeplus.bj'}/app/souscrire`),
      meta: { userId: user.id },
    }).catch(() => {});

    const tokens = this.issueTokens(user.id, user.role);
    await this.storeRefreshToken(tokens.refreshToken, user.id);
    return tokens;
  }

  async login(dto: typeof loginSchema._input) {
    const attempt = this.attempts.get(dto.email);
    if (attempt?.lockedUntil && Date.now() < attempt.lockedUntil) {
      throw new UnauthorizedException('Trop de tentatives. Réessayez plus tard.');
    }
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      const a = this.attempts.get(dto.email) ?? { count: 0 };
      a.count++;
      if (a.count >= this.MAX_ATTEMPTS) {
        a.lockedUntil = Date.now() + this.LOCK_MS;
        a.count = 0;
      }
      this.attempts.set(dto.email, a);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Compte suspendu. Contactez le support.');
    this.attempts.delete(dto.email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = this.issueTokens(user.id, user.role);
    await this.storeRefreshToken(tokens.refreshToken, user.id);
    return tokens;
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Session expirée, reconnectez-vous');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Token invalide');

    // Vérifier que le token n'a pas été révoqué
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revokedAt) {
      throw new UnauthorizedException('Token révoqué — reconnexion requise');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expiré — reconnexion requise');
    }

    // Rotation : révoquer l'ancien token et en créer un nouveau
    await this.prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });

    const tokens = this.issueTokens(payload.sub, payload.role);

    // Enregistrer le nouveau refresh token (30 jours pour aligner JWT + cookie)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: payload.sub,
        expiresAt,
        replacedBy: tokens.refreshToken,
      },
    });

    return tokens;
  }

  async changePassword(userId: string, dto: typeof changePasswordSchema._input) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
      throw new BadRequestException('Mot de passe actuel incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    // Changement de mot de passe : invalider toutes les sessions existantes
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  /**
   * Étape 1 — « mot de passe oublié ».
   *
   * Renvoie TOUJOURS `{ sent: true }`, que l'adresse existe ou non : une réponse
   * conditionnelle permettrait d'énumérer les comptes insured. Le quota par adresse
   * est lui aussi silencieux (même réponse), pour ne pas révéler l'existence
   * d'un compte via le seul canal « vous avez atteint la limite ».
   */
  async requestPasswordReset(email: string) {
    const now = Date.now();
    const window = this.resetRequests.get(email);
    const withinWindow = window && now - window.windowStart < this.RESET_WINDOW_MS;
    if (withinWindow && window.count >= this.MAX_RESET_REQUESTS) return { sent: true };
    this.resetRequests.set(
      email,
      withinWindow ? { count: window.count + 1, windowStart: window.windowStart } : { count: 1, windowStart: now },
    );

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'SUSPENDED') return { sent: true };

    // Un seul lien valide à la fois : toute demande précédente est neutralisée
    // pour qu'un e-mail intercepté ne puisse pas être rejoué après une nouvelle demande.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(token),
        userId: user.id,
        expiresAt: new Date(now + this.RESET_TTL_MS),
      },
    });

    // Le token en clair n'existe que dans ce lien : il n'est jamais journalisé
    // ni persisté, seule sa empreinte l'est.
    const resetUrl = `${config.appUrl}/reinitialiser-mot-de-passe?token=${token}`;
    await this.dispatch
      .dispatchToUser(user.id, {
        topic: 'PASSWORD_RESET',
        title: 'Réinitialisation de votre mot de passe',
        body: `Une réinitialisation a été demandée pour votre compte SantéPlus. Ce lien est valable 1 heure : ${resetUrl}`,
        html: passwordResetEmail(user.firstName ?? '', resetUrl),
        meta: { userId: user.id },
        force: true,
      })
      .catch(() => {});

    return { sent: true };
  }

  /** Étape 2 — le lien est-il encore exploitable ? (avant d'afficher le formulaire) */
  async checkResetToken(token: string) {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    });
    return { valid: Boolean(row && !row.usedAt && row.expiresAt > new Date()) };
  }

  /** Étape 3 — nouveau mot de passe : consommation du token et coupure des sessions. */
  async resetPassword(token: string, newPassword: string) {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      throw new BadRequestException('Ce lien est invalide ou a expiré. Demandez-en un nouveau.');
    }

    await this.prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    await this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    // Les autres demandes encore ouvertes pour ce compte deviennent caduques.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Un mot de passe réinitialisé doit déconnecter tous les appareils ouverts :
    // une session volée ne doit pas survivre au changement de secret.
    await this.prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Le verrou anti-bruit de login ne doit pas survivre à une réinitialisation réussie.
    this.attempts.delete(row.user.email);

    return { ok: true };
  }

  async logout(userId: string, refreshToken?: string) {
    // Révoquer tous les refresh tokens de l'utilisateur (logout global)
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private issueTokens(id: string, role: string) {
    return {
      accessToken: this.jwt.sign({ sub: id, role, type: 'access' }),
      // jti unique : deux emissions dans la meme seconde ne doivent jamais collisionner (RefreshToken.token unique)
      refreshToken: this.jwt.sign({ sub: id, role, type: 'refresh', jti: randomUUID() }),
      tokenType: 'Bearer',
    };
  }

  private async storeRefreshToken(token: string, userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  }
}
