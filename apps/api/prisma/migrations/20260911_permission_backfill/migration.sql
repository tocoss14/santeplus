-- Permissions créées après le seed initial : les garantir aux gestionnaires existants.
-- Idempotent : ON CONFLICT DO NOTHING, réapplicable sans risque sur prod et CI.

INSERT INTO "RolePermission" ("id", "role", "permissionKey")
SELECT
  'INSURANCE_MANAGER:' || permission.key,
  'INSURANCE_MANAGER',
  permission.key
FROM (VALUES
  ('billing.view'),
  ('billing.manage'),
  ('commissions.read'),
  ('commissions.manage'),
  ('distributors.read'),
  ('distributors.manage')
) AS permission(key)
ON CONFLICT ("role", "permissionKey") DO NOTHING;
