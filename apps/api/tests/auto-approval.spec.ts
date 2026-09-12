import { describe, expect, it } from 'vitest';
import {
  autoApprovalAuditSample,
  isAutoApprovableClaim,
  resolveAutoApproveAuditPercent,
  resolveAutoApproveThreshold,
} from '../src/domain/claim-machine';

const cleanEstimation = (approved: number) => ({
  ok: true,
  flags: [] as string[],
  totals: { approved },
});

describe('approbation automatique des petits dossiers', () => {
  it('accepte un remboursement propre sous le seuil', () => {
    expect(
      isAutoApprovableClaim(
        { id: 'claim-1', kind: 'REIMBURSEMENT', totalRequested: 25000 },
        cleanEstimation(12000),
        50000,
      ),
    ).toBe(true);
  });

  it('respecte le seuil à la borne exacte', () => {
    expect(
      isAutoApprovableClaim(
        { id: 'claim-2', kind: 'REIMBURSEMENT', totalRequested: 50000 },
        cleanEstimation(12000),
        50000,
      ),
    ).toBe(true);
  });

  it('refuse le tiers payant, les dossiers avec drapeau et les montants nuls', () => {
    expect(
      isAutoApprovableClaim(
        { id: 'claim-3', kind: 'THIRDPARTY', totalRequested: 10000 },
        cleanEstimation(5000),
        50000,
      ),
    ).toBe(false);
    expect(
      isAutoApprovableClaim(
        { id: 'claim-4', kind: 'REIMBURSEMENT', totalRequested: 10000 },
        { ok: false, flags: ['DUPLICATE_SUSPECT'], totals: { approved: 5000 } },
        50000,
      ),
    ).toBe(false);
    expect(
      isAutoApprovableClaim(
        { id: 'claim-5', kind: 'REIMBURSEMENT', totalRequested: 10000 },
        cleanEstimation(0),
        50000,
      ),
    ).toBe(false);
  });

  it('plafonne le seuil configuré pour limiter le risque', () => {
    expect(resolveAutoApproveThreshold(25000)).toBe(25000);
    expect(resolveAutoApproveThreshold(10000000)).toBe(100000);
    expect(resolveAutoApproveThreshold(0)).toBe(0);
    expect(resolveAutoApproveThreshold('not-a-number')).toBe(0);
  });

  it('échantillonne les contrôles a posteriori de façon déterministe', () => {
    expect(autoApprovalAuditSample('claim-audit-1', 0)).toBe(false);
    expect(autoApprovalAuditSample('claim-audit-1', 100)).toBe(true);
    expect(autoApprovalAuditSample('claim-audit-1', 25)).toBe(
      autoApprovalAuditSample('claim-audit-1', 25),
    );
    expect(resolveAutoApproveAuditPercent(25)).toBe(25);
    expect(resolveAutoApproveAuditPercent(1000)).toBe(100);
    expect(resolveAutoApproveAuditPercent('invalid', 10)).toBe(10);
  });
});
