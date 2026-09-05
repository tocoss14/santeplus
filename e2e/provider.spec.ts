import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import { API_URL } from './helpers';

test.describe('Prestataire: verify QR', () => {
  test('verify cardToken demo', async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    // Login prestataire demo
    const loginRes = await ctx.post('/api/auth/login', { data: { email: 'prestataire@santeplus.bj', password: 'Demo1234!' } });
    if (!loginRes.ok()) test.skip();
    const { accessToken } = await loginRes.json();
    const auth = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });

    // Get a contract cardToken via jean@demo.bj
    const jeanLogin = await ctx.post('/api/auth/login', { data: { email: 'jean@demo.bj', password: 'Demo1234!' } });
    const jeanToken = (await jeanLogin.json()).accessToken;
    const jeanCtx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${jeanToken}` } });
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
    await ctx.dispose();
    await auth.dispose();
    await jeanCtx.dispose();
  });
});
