import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.module';
import { JwtService } from '../../common/guards/jwt.service';
import { memberNumber } from '../../common/utils';
import { encryptField } from '../../common/crypto';
import { changePasswordSchema, loginSchema, registerSchema } from './dto';

interface LoginAttempt {
  count: number;
  lockedUntil?: number;
}

@Injectable()
export class AuthService {
  private attempts = new Map<string, LoginAttempt>();
  private MAX_ATTEMPTS = 5;
  private LOCK_MS = 15 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: typeof registerSchema._input) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet email');
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
      },
    });
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

    // Enregistrer le nouveau refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
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
    return { ok: true };
  }

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
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
      refreshToken: this.jwt.sign({ sub: id, role, type: 'refresh' }),
      tokenType: 'Bearer',
    };
  }

  private async storeRefreshToken(token: string, userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  }
}
