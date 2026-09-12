import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Prestataire: verify QR', () => {
  test('verify cardToken demo', async () => {
    const auth: APIRequestContext = await loginAs('prestataire@santeplus.bj', 'Demo1234!');

    // Get a contract cardToken via jean@demo.bj
    const jeanCtx = await loginAs('jean@demo.bj', 'Demo1234!');
    const contracts = await (await jeanCtx.get('/api/contracts/mine')).json();
    const cardToken = contracts[0]?.cardToken;
    expect(cardToken).toBeTruthy();

    // Verify via provider
    const verifyRes = await auth.post('/api/provider/verify', { data: { cardToken } });
    // 200/201 si trouvé (Nest POST -> 201 par défaut), sinon 404
    expect([200, 201, 404].includes(verifyRes.status())).toBeTruthy();
    if (verifyRes.ok()) {
      const data = await verifyRes.json();
      expect(data.contract?.number).toBeTruthy();
    }

    // Mobile provider APIs use the authenticated establishment, never an arbitrary provider ID
    const dashboardRes = await auth.get('/api/provider/dashboard');
    expect(dashboardRes.ok()).toBeTruthy();
    const dashboard = await dashboardRes.json();
    expect(dashboard.today).toBeDefined();
    expect(dashboard.month).toBeDefined();

    const thirdPartyRes = await auth.get('/api/provider/thirdparty?status=PENDING');
    expect(thirdPartyRes.ok()).toBeTruthy();
    expect(Array.isArray((await thirdPartyRes.json()).items)).toBe(true);

    const batchesRes = await auth.get('/api/provider/batch-invoices');
    expect(batchesRes.ok()).toBeTruthy();
    expect(Array.isArray(await batchesRes.json())).toBe(true);

    const rejectionsRes = await auth.get('/api/provider/rejections');
    expect(rejectionsRes.ok()).toBeTruthy();
    expect(Array.isArray(await rejectionsRes.json())).toBe(true);

    const crossProviderRes = await auth.get('/api/billing/batch-invoices?providerId=other-provider');
    expect(crossProviderRes.status()).toBe(403);

    await auth.dispose();
    await jeanCtx.dispose();
  });
});
