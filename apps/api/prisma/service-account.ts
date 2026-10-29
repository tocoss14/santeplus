/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Compte de service « garde-fous » — l'identité que la CI utilise pour
 * interroger la production en lecture seule (job verify-guardrails).
 *
 * Pourquoi un compte dédié plutôt que le compte d'un humain :
 *   - son mot de passe finit dans un secret GitHub Actions, partagé par tous
 *     les runs : ce ne doit pas être celui d'une personne ;
 *   - une rotation de mot de passe (départ, doute) ne doit pas casser la CI,
 *     et inversement une désactivation du compte humain ne doit pas la casser
 *     non plus ;
 *   - le rôle SUPER_ADMIN est requis parce que `products.manage` n'est porté
 *     que par lui (cf. DEFAULT_ROLE_PERMISSIONS) — la sonde ne lit pourtant que
 *     /api/admin/products, sans jamais écrire (mode --read-only).
 *
 * Le mot de passe n'est JAMAIS écrit dans le dépôt : il est fourni par
 * l'environnement, sinon généré à la création et affiché une seule fois par
 * scripts/provision-service-account.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/** Adresse du compte de service, surchargeable par SERVICE_ACCOUNT_EMAIL. */
export const SERVICE_ACCOUNT_EMAIL = 'ci-gardefous@santeplus.bj';

/**
 * Matricule fixe : il rend le compte reconnaissable dans l'écran d'admin et
 * vérifiable à l'œil dans un dump, sans dépendre de l'ordre d'insertion.
 */
export const SERVICE_ACCOUNT_MEMBER_NUMBER = 'MEM-CI-SVC';

export interface ServiceAccountOptions {
  /** Surcharge l'adresse par défaut. */
  email?: string;
  /** Mot de passe imposé (rotation pilotée) ; absent → inchangé s'il existe. */
  password?: string;
  /** Génère un mot de passe neuf même si l'option précédente est absente. */
  rotate?: boolean;
}

export interface ServiceAccountResult {
  email: string;
  id: string;
  /** Le compte vient d'être créé. */
  created: boolean;
  /** Le hash a bougé (création ou rotation) — sessions révoquées dans ce cas. */
  passwordChanged: boolean;
  /**
   * Mot de passe GÉNÉRÉ par cette exécution, à afficher une seule fois.
   * `null` dès que le mot de passe venait de l'appelant ou n'a pas bougé :
   * un secret fourni par l'opérateur n'a aucune raison d'être réimprimé.
   */
  password: string | null;
}

/**
 * Mot de passe aléatoire de 26 caractères (18 octets base64url + suffixe).
 * Le suffixe `a1` garantit la présence d'une lettre et d'un chiffre : la
 * politique de `changePasswordSchema` s'applique si on le change par l'API.
 */
export function generateServicePassword(): string {
  return randomBytes(18).toString('base64url') + 'a1';
}

/**
 * Crée le compte de service s'il manque, sinon le remet dans l'état attendu
 * (rôle SUPER_ADMIN, statut ACTIVE, matricule). Idempotent : deux exécutions
 * de suite sans option ne modifient rien et ne génèrent aucun mot de passe.
 */
export async function ensureServiceAccount(
  prisma: PrismaClient,
  opts: ServiceAccountOptions = {},
): Promise<ServiceAccountResult> {
  const email = (opts.email ?? process.env.SERVICE_ACCOUNT_EMAIL ?? SERVICE_ACCOUNT_EMAIL).trim().toLowerCase();
  // `genere` n'est renseigné que par --rotate : c'est le seul cas où le mot de
  // passe doit être affiché, l'appelant ne le connaissant pas encore.
  const genere = opts.rotate ? generateServicePassword() : null;
  const demande = genere ?? ((opts.password ?? '').trim() || null);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const password = demande ?? generateServicePassword();
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        firstName: 'Service',
        lastName: 'CI — garde-fous',
        memberNumber: SERVICE_ACCOUNT_MEMBER_NUMBER,
        language: 'fr',
      },
    });
    return {
      email,
      id: user.id,
      created: true,
      passwordChanged: true,
      // Mot de passe imposé par l'opérateur → rien à afficher ; généré ici → à noter.
      password: demande ? genere : password,
    };
  }

  const data: Record<string, unknown> = {};
  if (existing.role !== 'SUPER_ADMIN') data.role = 'SUPER_ADMIN';
  if (existing.status !== 'ACTIVE') data.status = 'ACTIVE';
  if (!existing.memberNumber) data.memberNumber = SERVICE_ACCOUNT_MEMBER_NUMBER;

  // On ne réécrit pas le hash avec un mot de passe identique : cela
  // révoquerait les sessions sans rien changer à la sécurité.
  if (demande && !(await bcrypt.compare(demande, existing.passwordHash))) {
    data.passwordHash = await bcrypt.hash(demande, 10);
  }

  if (Object.keys(data).length === 0) {
    return { email, id: existing.id, created: false, passwordChanged: false, password: null };
  }

  await prisma.user.update({ where: { id: existing.id }, data });
  if (data.passwordHash) {
    // Rotation : les jetons de rafraîchissement ouverts avec l'ancien mot de
    // passe tombent immédiatement (30 jours de validité sinon).
    await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
  }
  return {
    email,
    id: existing.id,
    created: false,
    passwordChanged: Boolean(data.passwordHash),
    password: data.passwordHash ? genere : null,
  };
}
