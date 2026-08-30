import { test, expect } from '@playwright/test';
import { uid, registerMember, login, authContext } from './helpers';

test.describe('Entreprise: register-entreprise → import salariés', () => {
  test('import CSV salariés', async () => {
    const adminEmail = `ent_${uid()}@test.bj`;
    // Register company via /companies/register (pas /auth/register)
    const { request } = await import('@playwright/test');
    const ctx0 = await request.newContext({ baseURL: process.env.API_URL ?? 'http://127.0.0.1:4000' });
    const compRes = await ctx0.post('/api/companies/register', {
      data: {
        companyName: 'Test SARL ' + uid(),
        city: 'Cotonou',
        email: adminEmail,
        password: 'Test1234!',
        contactName: 'Admin Test',
      },
    });
    expect(compRes.ok()).toBeTruthy();
    await ctx0.dispose();

    const token = await login(adminEmail);
    const ctx = await authContext(token);

    // Souscrire contrat collectif (1 salarié pour test adhesion cap)
    const prodRes = await ctx.get('/api/products?clientType=COMPANY');
    const prods = await prodRes.json();
    if (prods.length === 0) test.skip();
    const productId = prods[0].id;

    const subRes = await ctx.post('/api/subscription/subscribe-company', {
      data: { productId, employeesCount: 2, frequency: 'QUARTERLY' },
    });
    expect(subRes.ok()).toBeTruthy();
    const sub = await subRes.json();
    expect(sub.adhesion.adhesionFee).toBe(6000); // 2 × 3000 < cap 100k

    // Import salariés CSV (2 lignes)
    const csv = `NOM,PRENOM,EMAIL,TELEPHONE,DATENAISSANCE,FONCTION\nDoe,John,john_${uid()}@test.bj,+22997000001,15/06/1990,Chauffeur\nDoe,Jane,jane_${uid()}@test.bj,+22997000002,20/08/1992,Comptable`;
    const impRes = await ctx.post('/api/company/me/employees/import', { data: { csv } });
    expect(impRes.ok()).toBeTruthy();
    const imp = await impRes.json();
    expect(imp.imported).toBe(2);
    expect(imp.errors.length).toBe(0);

    await ctx.dispose();
  });
});
