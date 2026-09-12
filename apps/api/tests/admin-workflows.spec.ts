import { describe, expect, it, vi } from 'vitest';
import { AdminMiscController } from '../src/modules/admin-misc/admin-misc.controller';

describe('admin audit compatibility', () => {
  it('filters by entity and action, and maps legacy audit fields', async () => {
    const prisma: any = {
      auditLog: {
        findMany: vi.fn(async () => ([
          {
            id: 'audit-1',
            action: 'CLAIM_APPROVED',
            entityType: 'Claim',
            entityId: 'claim-1',
            meta: JSON.stringify({ amount: 1000 }),
            user: { firstName: 'Awa', lastName: 'Diallo', email: 'awa@example.bj' },
          },
        ])),
        count: vi.fn(async () => 1),
      },
    };
    const controller = new AdminMiscController(prisma);
    const result = await controller.audit('1', undefined, 'Claim', 'CLAIM_APPROVED');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: { contains: 'Claim' },
        action: { contains: 'CLAIM_APPROVED' },
      }),
    }));
    expect(result.items[0]).toMatchObject({
      entity: 'Claim',
      details: JSON.stringify({ amount: 1000 }),
      user: { name: 'Awa Diallo' },
    });
    expect(result).toMatchObject({ total: 1, page: 1, pages: 1 });
  });
});
