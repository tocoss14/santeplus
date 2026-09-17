import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.module';
import { config } from '../config';
import { getProvider, ProviderStatusCheck } from '../modules/payments/providers';
import { ProviderOutcome } from '../domain/payment-mapping';
import { PaymentsService } from '../modules/payments/payments.controller';

/**
 * Réconciliation des paiements PENDING (P0 ③ — filet de sécurité) :
 * les webhooks PSP peuvent ne jamais arriver (panne, mauvaise config notify_url,
 * réseau). Tant qu'un paiement réel reste PENDING, la cotisation n'est pas
 * marquée payée et le contrat peut rester inactif malgré un encaissement réel.
 *
 * Stratégie (identique au contrôleur) : le statut est TOUJOURS re-vérifié
 * auprès du PSP avant confirmation — le job ne fait jamais confiance à un
 * état local. Le montant encaissé est vérifié par le service
 * (confirmFromProvider), tout comme l'idempotence et l'activation.
 */
@Injectable()
export class PaymentReconciliationJob {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  async run(now = new Date(), maxPerRun = 50): Promise<{ checked: number; confirmed: number; failed: number; stillPending: number; errors: number }> {
    const cutoff = new Date(now.getTime() - 5 * 60 * 1000); // ≥ 5 min d'ancienneté
    // Seuls les PSP réels sont réconciliés — MOCK_MOMO ne passe jamais SUCCESS
    // tout seul, le polling serait du bruit.
    const realMethods = config.payProviders.filter(c => c !== 'MOCK_MOMO');
    if (realMethods.length === 0) return { checked: 0, confirmed: 0, failed: 0, stillPending: 0, errors: 0 };

    const pending = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        method: { in: realMethods },
        initiatedAt: { lt: cutoff },
      },
      orderBy: { initiatedAt: 'asc' },
      take: maxPerRun,
    });
    let confirmed = 0, failed = 0, stillPending = 0, errors = 0;

    for (const p of pending) {
      const provider = getProvider(p.method);
      if (!provider || !provider.available) { errors++; continue; }
      try {
        const res = await checkWithTimeout(() =>
          provider.checkStatus({ reference: p.reference, amount: p.amount, externalRef: p.externalRef }),
        );
        const outcome = typeof res === 'string' ? res : (res as ProviderStatusCheck).outcome;
        if (outcome === 'PENDING') { stillPending++; continue; }
        // La confirmation passe par le service : vérification du montant,
        // idempotence, activation, compta et CTS — une seule implémentation.
        const r = await this.payments.confirmFromProvider({
          provider: p.method,
          providerTxId: p.externalRef ?? undefined,
          ourReference: p.reference,
        });
        if (r.ok && r.status === 'SUCCEEDED') confirmed++;
        else if (r.status === 'AMOUNT_MISMATCH') errors++;
        else if (r.status === 'FAILED') failed++;
        else stillPending++;
      } catch {
        errors++;
      }
    }
    return { checked: pending.length, confirmed, failed, stillPending, errors };
  }
}

async function checkWithTimeout(
  fn: () => Promise<ProviderOutcome> | Promise<ProviderStatusCheck>,
  ms = 10_000,
): Promise<ProviderOutcome | ProviderStatusCheck> {
  return await Promise.race([
    fn(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PSP check timeout')), ms)),
  ]);
}
