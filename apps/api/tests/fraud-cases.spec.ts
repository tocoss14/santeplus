import { describe, expect, it, vi } from 'vitest';
import { FraudController } from '../src/modules/fraud/fraud.controller';

function makeController(cases: any[]) {
  const prisma: any = {
    fraudCase: {
      findMany: vi.fn(async ({ where }: any) => cases.filter(item => (
        (where.status === undefined || item.status === where.status) &&
        (where.OR === undefined || where.OR.some((clause: any) => (
          (clause.kind !== undefined && item.kind.includes(clause.kind.contains)) ||
          (clause.note !== undefined && (item.note ?? '').includes(clause.note.contains))
        )))
      ))),
      count: vi.fn(async () => cases.length),
      findUnique: vi.fn(async ({ where }: any) => cases.find(item => item.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const item = cases.find(entry => entry.id === where.id);
        Object.assign(item, data);
        return item;
      }),
    },
  };
  return new FraudController(prisma);
}

const fraudCase = {
  id: 'fraud-123456',
  kind: 'Z_SCORE',
  status: 'OPEN',
  note: null,
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  linkedAuditIds: JSON.stringify(['audit-1']),
  contract: {
    id: 'contract-1',
    number: 'CTR-1',
    principalUser: { firstName: 'Jean', lastName: 'Agbodjan', memberNumber: 'MEM-1' },
  },
  provider: { id: 'provider-1', name: 'Clinique Mahouna' },
};

describe('fraud cases', () => {
  it('lists mapped cases with pagination metadata', async () => {
    const controller = makeController([{ ...fraudCase }]);
    const result = await controller.list({ status: 'OPEN', q: 'Z_SCORE', page: 1 });
    expect(result).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(result.items[0]).toMatchObject({
      caseNumber: 'FRA-2026-123456',
      kind: 'Z_SCORE',
      status: 'OPEN',
      linkedAuditIds: ['audit-1'],
    });
    expect(result.items[0].contract).toMatchObject({ number: 'CTR-1', holder: 'Jean Agbodjan' });
  });

  it('allows valid review transitions and rejects invalid ones', async () => {
    const fresh = makeController([{ ...fraudCase }]);
    await expect(fresh.review('fraud-123456', { status: 'CONFIRMED' })).rejects.toThrow('Transition impossible');
    const controller = makeController([{ ...fraudCase }]);
    const reviewed = await controller.review('fraud-123456', { status: 'REVIEWING', note: 'Vérification en cours' });
    expect(reviewed).toMatchObject({ status: 'REVIEWING', note: 'Vérification en cours' });
    await expect(controller.review('fraud-123456', { status: 'CONFIRMED' })).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(controller.review('missing', { status: 'OPEN' })).rejects.toThrow('introuvable');
  });
});
