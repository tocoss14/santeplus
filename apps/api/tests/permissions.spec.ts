import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_LABELS } from '../src/common/permissions';

const NEW_MANAGER_PERMISSIONS = [
  'billing.view',
  'billing.manage',
  'commissions.read',
  'commissions.manage',
  'distributors.read',
  'distributors.manage',
];

describe('permission coverage', () => {
  it('labels every newly required finance permission', () => {
    for (const permission of NEW_MANAGER_PERMISSIONS) {
      expect(PERMISSION_LABELS[permission], permission).toBeTruthy();
      expect(DEFAULT_ROLE_PERMISSIONS.INSURANCE_MANAGER).toContain(permission);
    }
  });

  it('backfills the finance permissions for existing managers', () => {
    const migration = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20260911_permission_backfill', 'migration.sql'),
      'utf8',
    );
    for (const permission of NEW_MANAGER_PERMISSIONS) {
      expect(migration).toContain(`('${permission}')`);
      expect(migration).toContain('INSURANCE_MANAGER');
    }
  });

  it('exposes the finance permissions in role management', () => {
    const rolesPage = readFileSync(
      join(__dirname, '..', '..', 'web', 'src', 'pages', 'admin', 'AdminRoles.tsx'),
      'utf8',
    );
    for (const permission of NEW_MANAGER_PERMISSIONS) {
      expect(rolesPage).toContain(permission);
    }
  });
});
