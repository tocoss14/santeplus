import { test, expect } from '@playwright/test';
import { uid, registerMember, loginAs, cookieNames } from './helpers';

test.describe('Parcours particulier: register → acte de naissance → quote → subscribe → pay → carte → dépense', () => {
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

    // 2. Acte de naissance obligatoire : upload, comparaison document/profil, gate
    const me = await (await ctx.get('/api/auth/me')).json();
    const birthCertificate = Buffer.from('%PDF-1.4\n% acte de naissance de test\n', 'utf8');
    const uploadRes = await ctx.post('/api/subscription/birth-certificate/upload', {
      multipart: { file: { name: 'acte-naissance.pdf', mimeType: 'application/pdf', buffer: birthCertificate } },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const upload = await uploadRes.json();
    expect(upload.fileId).toBeTruthy();

    const verifyRes = await ctx.post('/api/subscription/birth-certificate/verify', {
      data: { fileId: upload.fileId, firstName: me.firstName, lastName: me.lastName, birthDate: me.birthDate },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const verification = await verifyRes.json();
    expect(verification.match).toBe(true);

    const statusRes = await ctx.get('/api/subscription/birth-certificate/status');
    expect(statusRes.ok()).toBeTruthy();
    expect((await statusRes.json()).verified).toBe(true);

    // 3. Quote
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

    // 4. Subscribe
    const subRes = await ctx.post('/api/subscription/subscribe', {
      data: { productId, frequency: 'MONTHLY', beneficiaries: [], selectedGuarantees: [] },
    });
    expect(subRes.ok()).toBeTruthy();
    const sub = await subRes.json();
    expect(sub.contractId).toBeTruthy();
    expect(sub.adhesion.adhesionFee).toBe(3000);
    expect(sub.firstPayment.totalFirstPayment).toBeGreaterThan(sub.firstPayment.amount);

    // 5. Pay (initiate + mock confirm)
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

    // 6. Carte
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

    // 7. Dépense : brouillon avec facture typée, puis soumission
    const categories = await (await ctx.get('/api/claims/categories')).json();
    const invoice = Buffer.from('%PDF-1.4\n% facture de test\n', 'utf8');
    const claimRes = await ctx.post('/api/claims', {
      multipart: {
        payload: JSON.stringify({
          contractId: sub.contractId,
          careDate: new Date().toISOString().slice(0, 10),
          items: [{ categoryId: categories[0].category, amountRequested: 10000 }],
          docTypes: ['INVOICE'],
        }),
        documents: { name: 'facture.pdf', mimeType: 'application/pdf', buffer: invoice },
      },
    });
    expect(claimRes.ok()).toBeTruthy();
    const claim = await claimRes.json();
    const claimDetail = await (await ctx.get(`/api/claims/${claim.id}`)).json();
    expect(claimDetail.documents[0].docType).toBe('INVOICE');

    const submitRes = await ctx.post(`/api/claims/${claim.id}/submit`, { data: {} });
    expect(submitRes.ok()).toBeTruthy();
    const submitted = await (await ctx.get(`/api/claims/${claim.id}`)).json();
    expect(submitted.status).toBe('SUBMITTED');

    await ctx.dispose();
  });
});
