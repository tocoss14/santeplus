import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Admin: instruction, fraude, analytique et facturation', () => {
  test('workflows use canonical APIs and shapes', async () => {
    const ctx = await loginAs('gestionnaire@santeplus.bj', 'Demo1234!');

    const claimsRes = await ctx.get('/api/admin/claims?status=SUBMITTED');
    expect(claimsRes.ok()).toBeTruthy();
    const claims = await claimsRes.json();
    expect(Array.isArray(claims.items)).toBe(true);
    expect(typeof claims.total).toBe('number');
    expect(typeof claims.page).toBe('number');
    expect(typeof claims.pages).toBe('number');
    expect(claims.items.length).toBeGreaterThan(0);

    const claimId = claims.items[0].id;
    const detailRes = await ctx.get(`/api/claims/${claimId}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = await detailRes.json();
    expect(Array.isArray(detail.documents)).toBe(true);

    const reviewRes = await ctx.post(`/api/admin/claims/${claimId}/under-review`, { data: {} });
    expect(reviewRes.ok()).toBeTruthy();
    const reviewed = await (await ctx.get(`/api/claims/${claimId}`)).json();
    expect(reviewed.status).toBe('UNDER_REVIEW');

    const fraudRes = await ctx.get('/api/admin/fraud');
    expect(fraudRes.ok()).toBeTruthy();
    const fraud = await fraudRes.json();
    expect(Array.isArray(fraud.items)).toBe(true);
    expect(typeof fraud.total).toBe('number');

    const analyticsRes = await ctx.get('/api/analytics/kpis');
    expect(analyticsRes.ok()).toBeTruthy();
    const kpis = await analyticsRes.json();
    expect(typeof kpis.activeContracts).toBe('number');
    expect(typeof kpis.technicalReserves).toBe('number');

    const providers = await (await ctx.get('/api/admin/providers')).json();
    const providerId = providers.items?.[0]?.id ?? providers?.[0]?.id;
    expect(providerId).toBeTruthy();
    const billingRes = await ctx.get(`/api/billing/batch-invoices?providerId=${providerId}`);
    expect(billingRes.ok()).toBeTruthy();
    expect(Array.isArray(await billingRes.json())).toBe(true);

    await ctx.dispose();
  });
});
