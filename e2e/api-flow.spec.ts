import { test, expect } from '@playwright/test';
import { uid, registerMember, loginAs, cookieNames } from './helpers';

test.describe('Parcours particulier: register → quote → subscribe → pay → carte', () => {
  const email = `e2e_${uid()}@test.bj`;

  test('flow complet', async () => {
    // 1. Register + login cookie
    await registerMember(email);
    const ctx = await loginAs(email);
    // Cookies httpOnly posés par le serveur
    const names = await cookieNames(ctx);
    expect(names).toContain('sp_access');
    expect(names).toContain('sp_refresh');
    const access = (await ctx.storageState()).cookies.find(c => c.name === 'sp_access');
    expect(access?.httpOnly).toBe(true);

    // 2. Quote
    const productsRes = await ctx.get('/api/products?clientType=INDIVIDUAL');
    expect(productsRes.ok()).toBeTruthy();
    const products = await productsRes.json();
    expect(products.length).toBeGreaterThan(0);
    const productId = products[0].id;

    const quoteRes = await ctx.post('/api/subscription/quote', {
      data: { productId, frequency: 'MONTHLY', beneficiaries: [], selectedGuarantees: [] },
    });
    // 200 ou 201 selon validation
    expect([200, 201].includes(quoteRes.status())).toBeTruthy();
    const quoteData = await quoteRes.json();
    expect(quoteData.quote).toBeDefined();
    // adhesion
    expect(quoteData.adhesion).toBeDefined();
    expect(quoteData.adhesion.adhesionFee).toBe(3000); // 1 pers × 3000

    // 3. Subscribe
    const subRes = await ctx.post('/api/subscription/subscribe', {
      data: { productId, frequency: 'MONTHLY', beneficiaries: [], selectedGuarantees: [] },
    });
    expect(subRes.ok()).toBeTruthy();
    const sub = await subRes.json();
    expect(sub.contractId).toBeTruthy();
    expect(sub.adhesion.adhesionFee).toBe(3000);
    expect(sub.firstPayment.totalFirstPayment).toBeGreaterThan(sub.firstPayment.amount);

    // 4. Pay (initiate + mock confirm)
    const initRes = await ctx.post('/api/payments/initiate', {
      data: { contractId: sub.contractId, method: 'MOCK_MOMO' },
    });
    expect(initRes.ok()).toBeTruthy();
    const init = await initRes.json();
    expect(init.payment.amount).toBe(sub.firstPayment.totalFirstPayment);

    const confirmRes = await ctx.post('/api/payments/mock/confirm', {
      data: { paymentId: init.payment.id, outcome: 'SUCCESS' },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const conf = await confirmRes.json();
    expect(conf.status).toBe('SUCCEEDED');

    // 5. Carte
    const contractsRes = await ctx.get('/api/contracts/mine');
    expect(contractsRes.ok()).toBeTruthy();
    const contracts = await contractsRes.json();
    const mine = contracts.find((c: any) => c.id === sub.contractId);
    expect(mine.status).toBe('ACTIVE');
    expect(mine.adhesionFee).toBe(3000);
    expect(mine.adhesionPaidAt).toBeTruthy();

    const cardRes = await ctx.get(`/api/contracts/${sub.contractId}/card`);
    expect(cardRes.ok()).toBeTruthy();
    const card = await cardRes.json();
    expect(card.cardToken).toBeTruthy();
    expect(card.qrPayload).toContain(card.cardToken);

    await ctx.dispose();
  });
});
