/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Provisionne le compte de service utilisé par la CI pour vérifier les
 * garde-fous produits en production (job `verify-guardrails` de deploy.yml).
 *
 * À exécuter sur la base que la CI interroge — c'est-à-dire la PRODUCTION :
 *
 *     cd apps/api
 *     DATABASE_URL="postgresql://…" npx tsx scripts/provision-service-account.ts
 *
 * Sortie : l'adresse du compte, et — uniquement s'il vient d'être créé ou
 * tourné — le mot de passe, affiché une seule fois. Il n'est écrit nulle part
 * par ce script : c'est à l'opérateur de le déposer dans les secrets GitHub
 * Actions (PRODUCTS_CHECK_EMAIL / PRODUCTS_CHECK_PASSWORD).
 *
 * Options :
 *   --email <adresse>     surcharge ci-gardefous@santeplus.bj
 *   --password <mdp>      impose un mot de passe (rotation pilotée)
 *   --rotate              génère un mot de passe neuf et le révoque l'ancien
 *   --help
 *
 * Idempotent : sans option, un compte déjà en place n'est pas modifié.
 * Une rotation révoque aussitôt les refresh tokens du compte (sinon les
 * sessions ouvertes survivraient 30 jours au changement de mot de passe).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { ensureServiceAccount, SERVICE_ACCOUNT_EMAIL } from '../prisma/service-account';

const prisma = new PrismaClient();

interface Options {
  email?: string;
  password?: string;
  rotate: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    email: process.env.SERVICE_ACCOUNT_EMAIL,
    password: process.env.SERVICE_ACCOUNT_PASSWORD,
    rotate: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' || a === '-e') opts.email = argv[++i];
    else if (a === '--password' || a === '-p') opts.password = argv[++i];
    else if (a === '--rotate') opts.rotate = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'Usage : npx tsx scripts/provision-service-account.ts [--email <adresse>] [--password <mdp> | --rotate]',
    );
    return 0;
  }

  const base = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@');
  console.log('Compte de service CI');
  console.log(`  base : ${base || '<DATABASE_URL absente>'}`);
  console.log(`  cible : ${opts.email ?? SERVICE_ACCOUNT_EMAIL}`);
  console.log('');

  const res = await ensureServiceAccount(prisma, opts);

  if (res.created) {
    console.log(`[ OK ] Compte créé (${res.email}, id ${res.id}) — rôle SUPER_ADMIN, statut ACTIVE`);
  } else if (res.passwordChanged) {
    console.log(`[ OK ] Mot de passe renouvelé (${res.email}) — sessions du compte révoquées`);
  } else {
    console.log(`[ OK ] Compte déjà en place et conforme (${res.email}) — rien à changer`);
  }

  if (res.password) {
    const barre = '═'.repeat(64);
    console.log('');
    console.log(barre);
    console.log(' MOT DE PASSE — affiché une seule fois, il n\'est stocké nulle part');
    console.log(` ${res.password}`);
    console.log(barre);
  }

  console.log('');
  console.log('Étape suivante — secrets GitHub Actions du dépôt');
  console.log('  Settings → Secrets and variables → Actions → Secrets');
  console.log(`    PRODUCTS_CHECK_EMAIL    = ${res.email}`);
  console.log('    PRODUCTS_CHECK_PASSWORD = <le mot de passe ci-dessus>');
  console.log('  Rotation ultérieure : relancer ce script avec --rotate, puis mettre à jour');
  console.log('  le secret PRODUCTS_CHECK_PASSWORD. Sans mise à jour, la CI se verrouille :');
  console.log('  5 échecs de connexion bloquent le compte 15 minutes côté API.');
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`[FAIL] Provisionnement impossible : ${err?.message ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
