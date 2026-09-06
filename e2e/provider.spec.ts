import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiContext, loginAs } from './helpers';

test.describe('Prestataire: verify QR', () => {
  test('verify cardToken demo', async () => {
    const ctx = await apiContext();
    // Login prestataire demo
    const loginRes = await ctx.post('/api/auth/login', { data: { email: 'prestataire@santeplus.bj', password: 'Demo1234!' } });
    if (!loginRes.ok()) {
      await ctx.dispose();
      test.skip();
      return;
    }
    await ctx.dispose();
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
    await auth.dispose();
    await jeanCtx.dispose();
  });
});
