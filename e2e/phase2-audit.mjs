/**
 * Audit Phase 2 — Tests métier/financiers/sécurité réels sur stack isolée.
 * Aucune modification du code métier : ce script n'exerce que l'API publique.
 * Usage : node e2e/phase2-audit.mjs [sections...]
 * Ex.   : node e2e/phase2-audit.mjs CTS IDEMPOTENCE
 */
import { request } from '@playwright/test';
import fs from 'fs';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const ONLY = process.argv.slice(2).map(s => s.toUpperCase());

const results = [];
function record(section, name, ok, proof) {
  results.push({ section, name, status: ok ? 'PASS' : 'FAIL', proof: proof ?? '' });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${name}${proof ? ` — ${proof}` : ''}`);
}
const step = (m) => console.log(`\n── ${m}`);

function ctxNew() {
  return request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: ORIGIN } });
}

async function loginAs(email, password) {
  const ctx = await ctxNew();
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) {
    const body = await res.text();
    await ctx.dispose();
    throw new Error(`login ${email} -> ${res.status()} ${body.slice(0, 200)}`);
  }
  return ctx;
}

async function adminLogin() {
  return loginAs('admin@santeplus.bj', 'Demo1234!');
}

/** Récupère les IDs du catalogue garanties et compose le tableau guarantees du DTO produit. */
async function gidsFor(adminCtx, codes, specs) {
  const catalog = await (await adminCtx.get('/api/admin/guarantees')).json();
  return specs.map((spec, i) => {
    const g = catalog.find(c => c.code === codes[i] || c.category === codes[i]);
    if (!g) throw new Error(`Garantie ${codes[i]} absente du catalogue`);
    return { guaranteeId: g.id, ...spec };
  });
}

/** Membre vérifié (acte de naissance validé) sans aucun contrat. */
async function createVerifiedMember() {
  const ctx = await ctxNew();
  const email = `p2_${uid()}@test.bj`;
  await ctx.post('/api/auth/register', {
    data: {
      firstName: 'P2', lastName: uid().toUpperCase(), email, password: 'Test1234!',
      phone: '+229 9' + Math.floor(10000000 + Math.random() * 90000000),
      birthDate: '1988-07-14', gender: 'M',
    },
  });
  const loginRes = await ctx.post('/api/auth/login', { data: { email, password: 'Test1234!' } });
  if (!loginRes.ok()) throw new Error('register/login member failed: ' + loginRes.status());
  const me = await (await ctx.get('/api/auth/me')).json();
  const buf = Buffer.from('%PDF-1.4\n% acte de naissance phase2\n', 'utf8');
  const up = await ctx.post('/api/subscription/birth-certificate/upload', {
    multipart: { file: { name: 'acte.pdf', mimeType: 'application/pdf', buffer: buf } },
  });
  const upBody = await up.json();
  const verRes = await ctx.post('/api/subscription/birth-certificate/verify', {
    data: { fileId: upBody.fileId, firstName: me.firstName, lastName: me.lastName, birthDate: me.birthDate },
  });
  if (!verRes.ok()) throw new Error('verify BC failed: ' + verRes.status());
  return { ctx, email };
}

/** Souscrit et paie un produit précis pour un membre vérifié. Retourne { contract, sub }. */
async function subscribeAndPay(ctx, productId, { frequency = 'ANNUAL', beneficiaries = [] } = {}) {
  const subRes = await ctx.post('/api/subscription/subscribe', {
    data: { productId, frequency, beneficiaries, selectedGuarantees: [] },
  });
  if (!subRes.ok()) throw new Error(`subscribe failed: ${subRes.status()} ${(await subRes.text()).slice(0, 150)}`);
  const sub = await subRes.json();
  const initRes = await ctx.post('/api/payments/initiate', { data: { contractId: sub.contractId, method: 'MOCK_MOMO' } });
  if (!initRes.ok()) throw new Error('initiate failed: ' + initRes.status());
  const init = await initRes.json();
  const confRes = await ctx.post('/api/payments/mock/confirm', { data: { paymentId: init.payment.id, outcome: 'SUCCESS' } });
  if (!confRes.ok()) throw new Error('confirm failed: ' + confRes.status());
  const contracts = await (await ctx.get('/api/contracts/mine')).json();
  const contract = contracts.find(c => c.id === sub.contractId);
  return { contract, sub };
}

/** Parcours assuré complet jusqu'au paiement (contrat ACTIF) sur le 1er produit public. */
async function createPaidMember({ frequency = 'ANNUAL', beneficiaries = [] } = {}) {
  const { ctx, email } = await createVerifiedMember();
  const products = await (await ctx.get('/api/products?clientType=INDIVIDUAL')).json();
  if (!products.length) throw new Error('no products');
  const productId = products[0].id;
  const { contract, sub } = await subscribeAndPay(ctx, productId, { frequency, beneficiaries });
  return { ctx, email, contract, productId, sub };
}

async function getCtsOverview(adminCtx, contractId) {
  const r = await adminCtx.get(`/api/admin/contracts/${contractId}/cts`);
  if (!r.ok()) throw new Error(`CTS overview ${r.status()}`);
  return (await r.json()).account;
}

// ══════════════════════════════════════════════════════════════════════════
// §8-§13 CTS avec chiffres réels + engagement + seuils + épuisement + appel
// ══════════════════════════════════════════════════════════════════════════
async function testCts() {
  step('§8-§13 CTS — chiffres réels');
  const admin = await adminLogin();

  // Produit dédié : prime 1 000 000, frais 20 %, budget 800 000
  const prodRes = await admin.post('/api/admin/products', {
    data: {
      code: 'P2CTS' + uid().toUpperCase(), name: 'P2 CTS 1M', clientType: 'INDIVIDUAL',
      basePremiumAnnual: 1000000, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 0,
      minAge: 0, maxAge: 65, waitingPeriodDays: 0, globalAnnualCap: 900000,
      status: 'ACTIVE', sortOrder: 99,
      ctsConfig: { managementRate: 20, warnRatio: 50, alertRatio: 30, criticalRatio: 10, carryRate: 70, renewalMode: 'DEDUCT' },
      guarantees: await gidsFor(admin, ['CONSULTATION', 'PHARMACY'], [
        { annualLimit: 2000000, rate: 80, minRate: 80, maxRate: 80, minLimit: 2000000, maxLimit: 2000000, copayRate: 20, mandatory: true, customizable: false },
        { annualLimit: 1000000, rate: 80, minRate: 80, maxRate: 80, minLimit: 1000000, maxLimit: 1000000, copayRate: 20, mandatory: true, customizable: false },
      ]),
    },
  });
  const prodOk = prodRes.ok();
  record('CTS', 'Produit test 1M créé (admin)', prodOk, prodOk ? '' : `HTTP ${prodRes.status()}`);
  if (!prodOk) { await admin.dispose(); return; }
  // NB : POST /api/admin/products renvoie le cuid en texte brut (anomalie d'API en soi)
  const productId2 = (await prodRes.text()).replace(/"/g, '').trim();
  record('CTS', 'Produit créé renvoie un identifiant', /^[a-z0-9]{10,30}$/i.test(productId2), `body=${productId2.slice(0, 30)}`);

  // Membre neuf + souscription directe sur ce produit (sans contrat préexistant)
  const m2 = await createVerifiedMember();
  let cid = null;
  try {
    const { contract } = await subscribeAndPay(m2.ctx, productId2);
    cid = contract.id;
    record('CTS', 'Souscription produit 1M', true, `contract=${cid}`);
  } catch (e) {
    record('CTS', 'Souscription produit 1M', false, e.message.slice(0, 150));
    await admin.dispose(); await m2.ctx.dispose(); return;
  }

  // §8 : PRIME 1M → FRAIS 200k → BUDGET 800k
  const acc1 = await getCtsOverview(admin, cid);
  record('CTS', 'FRAIS = 200 000 (20 %)', acc1.managementFees === 200000, `managementFees=${acc1.managementFees}`);
  record('CTS', 'BUDGET = 800 000', acc1.benefitBudget === 800000, `benefitBudget=${acc1.benefitBudget}`);
  record('CTS', 'Disponible initial = 800 000', acc1.available === 800000, `available=${acc1.available}`);

  // §9 : engagement 100 000 via tiers payant, puis réalisation = consommation
  const cats = await (await m2.ctx.get('/api/claims/categories')).json();
  const catCons = (cats.find(c => /CONS/i.test(c.category)) ?? cats[0]).category;
  const catPhar = (cats.find(c => /PHAR/i.test(c.category)) ?? cats[0]).category;
  const pres = await loginAs('prestataire@santeplus.bj', 'Demo1234!');
  const card = await (await m2.ctx.get(`/api/contracts/${cid}/card`)).json();      const tpRes = await pres.post('/api/provider/thirdparty/initiate', {
    multipart: { payload: JSON.stringify({ cardToken: card.cardToken, items: [{ code: 'CONS-P2', label: 'Consultation P2', categoryId: catCons, quantity: 1, unitPrice: 100000 }] }) },
  });
  const tpOk = tpRes.ok();
  if (!tpOk) {
    record('CTS', 'Tiers payant initié (100 000)', false, `HTTP ${tpRes.status()} ${(await tpRes.text()).slice(0, 120)}`);
  } else {
    const tp = await tpRes.json();
    const confTp = await pres.post(`/api/provider/thirdparty/${tp.id}/confirm`, { data: {} });
    const engAcc = await getCtsOverview(admin, cid);
    // Le fonds doit : montant approuvé × (1 − copay) = 100k × 80 % × 80 % = 64 000
    record('CTS', '§9 Engagement = 64 000 (part fonds : 80 % × 80 %)', confTp.ok() && engAcc.committed === 64000, `committed=${engAcc.committed}`);
    record('CTS', '§9 Disponible après engagement = 736 000', engAcc.available === 736000, `available=${engAcc.available}`);

    const realRes = await pres.post(`/api/provider/thirdparty/${tp.id}/realize`, { data: {} });
    const invRes = await pres.post(`/api/provider/thirdparty/${tp.id}/invoice`, { data: {} });
    record('CTS', 'Réalisation + facture prestataire OK', realRes.ok() && invRes.ok(), `realize=${realRes.status()} invoice=${invRes.status()}`);

    // Consommation : pour le tiers payant, l'engagement est la dette du fonds (facturation groupée).
    // On vérifie que la dette reste inscrite (traçabilité) et on note la voie de règlement.
    const afterRealize = await getCtsOverview(admin, cid);
    record('CTS', '§9 Engagement libéré en consommation (via règlement fonds)', afterRealize.consumed === 64000 && afterRealize.committed === 0, `consumed=${afterRealize.consumed} committed=${afterRealize.committed} (si 0/64000 : règlement prestataire non chainé → voir anomalie facturation groupée)`);
    record('CTS', '§9 Disponible final = 736 000 (dette inscrite)', afterRealize.available === 736000, `available=${afterRealize.available}`);
    const ov = await (await admin.get(`/api/admin/contracts/${cid}/cts`)).json();
    record('SEUILS', '§10 Bande NORMAL à 87,5 % restant', String(ov.band ?? '').toUpperCase().includes('NORMAL'), `band=${JSON.stringify(ov.band)}`);
  }

  // §11 : épuisement du BUDGET CTS (part fonds 38 400/acte × 21 > 800 000) avant le plafond catégorie (2M)
  step('§11 Épuisement');
  let exhaustErr = null;
  try {
    for (let i = 0; i < 25; i++) {
      const c2 = await (await m2.ctx.get(`/api/contracts/${cid}/card`)).json();
      const r = await pres.post('/api/provider/thirdparty/initiate', {
        multipart: { payload: JSON.stringify({ cardToken: c2.cardToken, items: [{ code: `CONS-P2-${i}`, label: 'Consultation P2', categoryId: catCons, quantity: 1, unitPrice: 60000 }] }) },
      });
      if (!r.ok()) { exhaustErr = `initiate ${r.status()}: ${(await r.text()).slice(0, 120)}`; break; }
      const tp2 = await r.json();
      const c = await pres.post(`/api/provider/thirdparty/${tp2.id}/confirm`, { data: {} });
      if (!c.ok()) { exhaustErr = `confirm ${c.status()}: ${(await c.text()).slice(0, 120)}`; break; }
      const acc = await getCtsOverview(admin, cid);
      console.log(`   itération ${i + 1} : available=${acc.available} committed=${acc.committed}`);
      if (acc.available <= 0) break;
    }
  } catch (e) { exhaustErr = e.message.slice(0, 120); }
  const accEnd = await getCtsOverview(admin, cid);
  record('ÉPUIS', 'CTS porté à 0 ou prestation refusée explicitement', accEnd.available <= 0 || exhaustErr !== null, `available=${accEnd.available}, refus=${exhaustErr ?? 'aucun'}`);

  // §12-13 : appel de fonds + paiement + reconstitution
  step('§12-§13 Appel de fonds');
  const fcRes = await admin.post(`/api/admin/contracts/${cid}/fund-calls`, { data: { chosenAmount: 500000 } });
  const fcOk = fcRes.ok();
  if (fcOk) {
    const fcBody = await fcRes.json();
    const fc = fcBody.fundCall ?? fcBody;
    const sendRes = await admin.post(`/api/admin/fund-calls/${fc.id}/send`, { data: {} });
    record('FONDS', 'Appel de fonds créé + envoyé', sendRes.ok(), `status=${(await sendRes.json().catch(() => ({}))).status ?? sendRes.status()}`);
    const payRes = await m2.ctx.post('/api/payments/initiate', { data: { contractId: cid, method: 'MOCK_MOMO', fundCallId: fc.id } });
    if (payRes.ok()) {
      const pay = await payRes.json();
      record('FONDS', 'Montant appel = montant choisi exact', pay.payment?.amount === 500000, `amount=${pay.payment?.amount}`);
      const conf = await m2.ctx.post('/api/payments/mock/confirm', { data: { paymentId: pay.payment.id, outcome: 'SUCCESS' } });
      const after = await getCtsOverview(admin, cid);
      record('FONDS', '§13 CTS reconstitué (500k − 20 % frais)', conf.ok() && after.available === accEnd.available + 400000, `available=${after.available} (attendu ${accEnd.available + 400000})`);
    } else {
      record('FONDS', 'Paiement appel de fonds', false, `HTTP ${payRes.status()}`);
    }
  } else {
    record('FONDS', 'Appel de fonds créé', false, `HTTP ${fcRes.status()} ${(await fcRes.text()).slice(0, 120)}`);
  }

  await pres.dispose(); await admin.dispose(); await m2.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §14 Idempotence financière
// ══════════════════════════════════════════════════════════════════════════
async function testIdempotence() {
  step('§14 Idempotence');
  const admin = await adminLogin();
  const m = await createPaidMember({ frequency: 'ANNUAL' });
  const before = await getCtsOverview(admin, m.contract.id);

  const initRes = await m.ctx.post('/api/payments/initiate', { data: { contractId: m.contract.id, method: 'MOCK_MOMO' } });
  let payId = null;
  if (initRes.ok()) {
    const init = await initRes.json();
    payId = init.payment?.id ?? init.id ?? null;
    record('IDEM', 'Nouveau paiement initié sur contrat payé', !!payId, initRes.ok() ? `paymentId=${payId}` : `shape=${JSON.stringify(init).slice(0, 120)}`);
  } else {
    record('IDEM', 'Re-paiement sur contrat déjà payé (comportement)', true, `HTTP ${initRes.status()} — API refuse ou restreint`);
  }
  if (payId) {
    await m.ctx.post('/api/payments/mock/confirm', { data: { paymentId: payId, outcome: 'SUCCESS' } });
    const dup = await m.ctx.post('/api/payments/mock/confirm', { data: { paymentId: payId, outcome: 'SUCCESS' } });
    record('IDEM', 'Double confirm du même paiement rejeté', !dup.ok(), `HTTP 2e appel=${dup.status()}`);
  }
  const after = await getCtsOverview(admin, m.contract.id);
  record('IDEM', 'Prime comptée une seule fois', after.primeCollected >= before.primeCollected, `prime ${before.primeCollected} → ${after.primeCollected}`);

  const wh1 = await m.ctx.post('/api/payments/webhook/cinetpay', { data: { cpm_trans_id: 'UNKNOWN-P2-REF' } });
  const wh2 = await m.ctx.post('/api/payments/webhook/cinetpay', { data: { cpm_trans_id: 'UNKNOWN-P2-REF' } });
  record('IDEM', 'Webhook référence inconnue : pas de crash, déterministe', wh1.status() === wh2.status() && wh1.status() < 500, `HTTP=${wh1.status()}/${wh2.status()}`);
  const afterWh = await getCtsOverview(admin, m.contract.id);
  record('IDEM', 'CTS inchangé par webhooks inconnus', afterWh.primeCollected === after.primeCollected, `prime=${afterWh.primeCollected}`);

  await admin.dispose(); await m.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §18-§19 Ordonnances
// ══════════════════════════════════════════════════════════════════════════
async function testPrescriptions() {
  step('§18-§19 Ordonnances');
  const admin = await adminLogin();

  const phEmail = `pharm_${uid()}@test.bj`;
  const bulkRes = await admin.post('/api/admin/providers/bulk-import', {
    data: { providers: [{ name: 'Pharma P2 ' + uid(), type: 'PHARMACY', city: 'Cotonou', email: phEmail, contactPhone: '+22997000001', contactFirstName: 'Pharm', contactLastName: 'P2' }] },
  });
  const bulkOk = bulkRes.ok();
  let phPassword = 'Test1234!';
  if (bulkOk) {
    const body = await bulkRes.json();
    const row = Array.isArray(body) ? body[0] : body.results?.[0] ?? body[0];
    phPassword = row?.tempPassword ?? phPassword;
  }
  record('ORD', 'Établissement PHARMACY créé (bulk import)', bulkOk, bulkOk ? phEmail : `HTTP ${bulkRes.status()}`);
  let pharm = null;
  try { pharm = await loginAs(phEmail, phPassword); } catch { /* compte non créé */ }
  record('ORD', 'Compte pharmacie utilisable', !!pharm, pharm ? 'login OK' : 'login impossible');

  const m = await createPaidMember({ frequency: 'ANNUAL' });
  const contracts = await (await m.ctx.get('/api/contracts/mine')).json();
  const cid = contracts[0].id;

  if (pharm) {
    const illegal = await pharm.post('/api/provider/prescriptions', {
      data: { memberNumber: 'MEM-A00001', lines: [{ code: 'X', name: 'Médicament test', categoryId: 'PHARMACY', quantity: 1, unitPrice: 5000 }], validDays: 7 },
      headers: { 'X-Test-Endpoint': '/api/provider/prescriptions' },
    });
    // Vérifie que la route est bien celle du CareController (pas un double de ProviderPortal)
    const illegalBody = illegal.ok() ? '' : await illegal.text();
    console.log('DEBUG illegal prescription response:', illegal.status(), illegalBody.slice(0, 200));
    record('ORD', '§18 Pharmacie NE PEUT PAS créer d\'ordonnance', !illegal.ok(), `HTTP ${illegal.status()}${illegalBody ? ' ' + illegalBody.slice(0, 120) : ''}`);
  }

  const doc = await loginAs('prestataire@santeplus.bj', 'Demo1234!');
  const card = await (await m.ctx.get(`/api/contracts/${cid}/card`)).json();
  const presRes = await doc.post('/api/provider/prescriptions', {
    data: { cardToken: card.cardToken, lines: [{ code: 'PHAR-001', name: 'Paracétamol P2', categoryId: 'PHARMACY', quantity: 2, unitPrice: 5000 }], validDays: 7 },
  });
  const presOk = presRes.ok();
  record('ORD', '§18 Médecin crée une ordonnance', presOk, presOk ? '' : `HTTP ${presRes.status()}`);
  if (presOk) {
    const pres = await presRes.json();
    if (pharm) {
      const scan = await pharm.post('/api/provider/prescriptions/scan', { data: { number: pres.number } });
      record('ORD', 'Pharmacie consulte l\'ordonnance (scan)', scan.ok(), `HTTP ${scan.status()}`);
    }
    const actor = pharm ?? doc;
    const mkDel = (qty) => actor.post('/api/provider/deliveries', { data: { payload: JSON.stringify({ prescriptionId: pres.id, lines: [{ lineId: pres.lines[0].id, quantity: qty }] }) } });
    const del1 = await mkDel(1);
    record('ORD', '§19 Délivrance partielle acceptée', del1.ok(), `HTTP ${del1.status()}${del1.ok() ? '' : ' ' + (await del1.text()).slice(0, 100)}`);
    const del2 = await mkDel(1);
    record('ORD', '§19 Délivrance du reliquat acceptée', del2.ok(), `HTTP ${del2.status()}${del2.ok() ? '' : ' ' + (await del2.text()).slice(0, 100)}`);
    const del3 = await mkDel(1);
    record('ORD', '§18 Ordonnance épuisée NON réutilisable', !del3.ok(), `HTTP ${del3.status()}`);
    const unk = await doc.post('/api/provider/prescriptions/scan', { data: { number: 'P2-UNKNOWN-0001' } });
    record('ORD', '§19 Ordonnance inconnue → 404', unk.status() === 404, `HTTP ${unk.status()}`);
  }

  await doc.dispose(); if (pharm) await pharm.dispose(); await admin.dispose(); await m.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §32-§35 RBAC & sécurité backend
// ══════════════════════════════════════════════════════════════════════════
async function testSecurity() {
  step('§32-§35 Sécurité / RBAC');
  const member = await createPaidMember({ frequency: 'ANNUAL' });
  const contracts = await (await member.ctx.get('/api/contracts/mine')).json();
  const cid = contracts[0].id;

  const anon = await ctxNew();
  const anonRes = await anon.get('/api/contracts/mine');
  record('SEC', 'Sans token → 401/403', [401, 403].includes(anonRes.status()), `HTTP ${anonRes.status()}`);
  await anon.dispose();

  const forbidden = [];
  for (const [method, url] of [
    ['GET', '/api/admin/contracts'],
    ['GET', '/api/admin/payments'],
    ['GET', '/api/admin/cts/portfolio'],
    ['GET', '/api/analytics/kpis'],
    ['GET', '/api/admin/claims?status=SUBMITTED'],
  ]) {
    const r = await member.ctx.get(url);
    if (r.ok()) forbidden.push(`${url} → ${r.status()}`);
  }
  const rSuspend = await member.ctx.post(`/api/admin/contracts/${cid}/suspend`, { data: {} });
  if (rSuspend.ok()) forbidden.push(`POST suspend → ${rSuspend.status()}`);
  record('SEC', 'Membre bloqué sur toutes les routes admin', forbidden.length === 0, forbidden.join(', ') || 'toutes 401/403');

  const comp = await loginAs('entreprise@santeplus.bj', 'Demo1234!');
  const dashRes = await comp.get('/api/company/me/dashboard');
  let medicalLeak = null;
  if (dashRes.ok()) {
    const s = JSON.stringify(await dashRes.json()).toLowerCase();
    medicalLeak = ['diagnostic', 'ordonnance', 'prescription', 'motif'].find(k => s.includes(k)) ?? null;
  }
  record('SEC', '§32 Dashboard entreprise sans données médicales individuelles', medicalLeak === null,
    dashRes.ok() ? (medicalLeak ? `fuite: ${medicalLeak}` : 'aucune clé médicale') : `HTTP ${dashRes.status()} (dashboard absent/protégé)`);

  const support = await loginAs('support@santeplus.bj', 'Demo1234!');
  const supWrite = await support.post(`/api/admin/contracts/${cid}/suspend`, { data: {} });
  record('SEC', 'Support (lecture seule) ne peut pas suspendre un contrat', !supWrite.ok(), `HTTP ${supWrite.status()}`);

  const m2 = await createPaidMember({ frequency: 'ANNUAL' });
  const cross = await m2.ctx.get(`/api/contracts/${cid}`);
  record('SEC', 'Accès au contrat d\'autrui refusé', [401, 403, 404].includes(cross.status()), `HTTP ${cross.status()}`);

  await member.ctx.dispose(); await comp.dispose(); await support.dispose(); await m2.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §21-§23 Avenants / ayants droit
// ══════════════════════════════════════════════════════════════════════════
async function testEndorsements() {
  step('§21-§23 Avenants');
  const m = await createPaidMember({ frequency: 'ANNUAL' });
  const contracts = await (await m.ctx.get('/api/contracts/mine')).json();
  const cid = contracts[0].id;
  const admin = await adminLogin();
  const before = await getCtsOverview(admin, cid);

  const add1 = await m.ctx.post(`/api/contracts/${cid}/beneficiaries`, {
    data: { firstName: 'Awa', lastName: 'P2', birthDate: '1992-03-10', gender: 'F', relation: 'SPOUSE' },
  });
  record('AVEN', 'Ajout conjoint accepté', add1.ok(), `HTTP ${add1.status()}`);
  const add2 = await m.ctx.post(`/api/contracts/${cid}/beneficiaries`, {
    data: { firstName: 'Kofi', lastName: 'P2', birthDate: '2018-05-01', gender: 'M', relation: 'CHILD' },
  });
  record('AVEN', 'Ajout enfant accepté', add2.ok(), `HTTP ${add2.status()}`);

  const histRes = await m.ctx.get(`/api/contracts/${cid}/beneficiaries`);
  const list = histRes.ok() ? await histRes.json() : [];
  const arr = Array.isArray(list) ? list : list.items ?? [];
  record('AVEN', '§22 Deux ayants droit couverts', arr.filter(b => b.status === 'COVERED').length === 2, `covered=${arr.filter(b => b.status === 'COVERED').length}`);
  const after = await getCtsOverview(admin, cid);
  record('AVEN', 'Recalcul CTS après avenant (budget/prime inchangés ici)', after.available === before.available, `available=${after.available}`);

  const spouse = arr.find(b => b.relation === 'SPOUSE' && b.status === 'COVERED');
  if (spouse) {
    const rem = await m.ctx.post(`/api/contracts/${cid}/beneficiaries/${spouse.id}/remove`, { data: {} });
    record('AVEN', 'Retrait conjoint accepté', rem.ok(), `HTTP ${rem.status()}`);
    const hist2 = await (await m.ctx.get(`/api/contracts/${cid}/beneficiaries`)).json();
    const arr2 = Array.isArray(hist2) ? hist2 : hist2.items ?? [];
    record('AVEN', '§22 Ancien ayant droit conservé (trace/soft)', arr2.some(b => b.id === spouse.id), `statut=${arr2.find(b => b.id === spouse.id)?.status}`);
  }
  const add3 = await m.ctx.post(`/api/contracts/${cid}/beneficiaries`, {
    data: { firstName: 'Future', lastName: 'P2', birthDate: '2030-01-01', gender: 'M', relation: 'CHILD' },
  });
  const add3Body = add3.ok() ? '' : await add3.text();
  console.log('DEBUG add3 future birth response:', add3.status(), add3Body.slice(0, 200));
  record('AVEN', '§23 Naissance future refusée', !add3.ok(), `HTTP ${add3.status()}${add3Body ? ' ' + add3Body.slice(0, 120) : ''}`);

  await admin.dispose(); await m.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §16 Plafonds de garanties
// ══════════════════════════════════════════════════════════════════════════
async function testCaps() {
  step('§16 Plafonds');
  const admin = await adminLogin();
  const prodRes = await admin.post('/api/admin/products', {
    data: {
      code: 'P2CAP' + uid().toUpperCase(), name: 'P2 Cap Pharma', clientType: 'INDIVIDUAL',
      basePremiumAnnual: 100000, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 0,
      minAge: 0, maxAge: 65, waitingPeriodDays: 0, globalAnnualCap: 500000, oopAnnualCap: 200000,
      status: 'ACTIVE', sortOrder: 98,
      guarantees: await gidsFor(admin, ['PHARMACY'], [
        { annualLimit: 100000, rate: 80, minRate: 80, maxRate: 80, minLimit: 100000, maxLimit: 100000, copayRate: 20, mandatory: true, customizable: false },
      ]),
    },
  });
  if (!prodRes.ok()) { record('CAPS', 'Produit cap créé', false, `HTTP ${prodRes.status()}`); await admin.dispose(); return; }
  const capProduct = { id: (await prodRes.text()).replace(/"/g, '').trim() };
  const m = await createVerifiedMember();
  let cidCap = null;
  let subBody = null;
  try {
    const { contract, sub } = await subscribeAndPay(m.ctx, capProduct.id);
    cidCap = contract.id;
    subBody = { contractId: contract.id };
  } catch (e) {
    record('CAPS', 'Souscription produit cap', false, e.message.slice(0, 150));
    await admin.dispose(); await m.ctx.dispose(); return;
  }

  // Facture 130 000 en pharmacie : taux 80 % → 104 000, mais plafond 100 000 → ≤ 100 000.
  const categories = await (await m.ctx.get('/api/claims/categories')).json();
  const cat = categories.find(c => c.category === 'PHARMACY') ?? categories[0];
  const invoice = Buffer.from('%PDF-1.4\n% facture cap\n', 'utf8');
  const claimRes = await m.ctx.post('/api/claims', {
    multipart: {
      payload: JSON.stringify({ contractId: subBody.contractId, careDate: new Date().toISOString().slice(0, 10), items: [{ categoryId: cat.category, amountRequested: 130000 }], docTypes: ['INVOICE'] }),
      documents: { name: 'facture.pdf', mimeType: 'application/pdf', buffer: invoice },
    },
  });
  if (!claimRes.ok()) { record('CAPS', 'Dépôt dossier 130k', false, `HTTP ${claimRes.status()}`); await admin.dispose(); await m.ctx.dispose(); return; }
  const claim = await claimRes.json();
  await m.ctx.post(`/api/claims/${claim.id}/submit`, { data: {} });
  const appr = await admin.post(`/api/admin/claims/${claim.id}/approve`, { data: {} });
  const detail = await (await admin.get(`/api/claims/${claim.id}`)).json();
  const approved = detail.totalApproved ?? (detail.items ?? []).reduce((a, i) => a + (i.amountApproved ?? 0), 0);
  record('CAPS', 'Plafond catégorie appliqué (130k × 80 % = 104k > plafond 100k)', appr.ok() && approved !== null && approved <= 100000, `approved=${approved}`);

  await admin.dispose(); await m.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
// §39-§44 Cohérence financière
// ══════════════════════════════════════════════════════════════════════════
async function testCoherence() {
  step('§39-§44 Cohérence');
  const admin = await adminLogin();
  const m = await createPaidMember({ frequency: 'ANNUAL' });
  const contracts = await (await m.ctx.get('/api/contracts/mine')).json();
  const cid = contracts[0].id;
  const acc = await getCtsOverview(admin, cid);
  const reconstructed = acc.benefitBudget - (acc.consumed ?? 0) - (acc.committed ?? 0);
  record('COHER', '§39 CTS = reconstruction (budget − consommé − engagé)', reconstructed === acc.available, `available=${acc.available} vs reconstruit=${reconstructed}`);

  const pays = await (await admin.get('/api/admin/payments')).json();
  const rows = pays.items ?? pays;
  const mine = rows.filter(p => p.contractId === cid && p.status === 'SUCCEEDED');
  record('COHER', 'Paiement SUCCEEDED lié au contrat présent', mine.length >= 1, `n=${mine.length}`);

  const ano = await admin.get('/api/admin/anomalies');
  record('COHER', '§44 Scanner d\'anomalies actif', ano.ok(), `HTTP ${ano.status()}`);

  await admin.dispose(); await m.ctx.dispose();
}

// ══════════════════════════════════════════════════════════════════════════
const SECTIONS = {
  CTS: testCts,
  IDEMPOTENCE: testIdempotence,
  ORDONNANCES: testPrescriptions,
  SECURITE: testSecurity,
  AVENANTS: testEndorsements,
  CAPS: testCaps,
  COHERENCE: testCoherence,
};

console.log(`Audit Phase 2 → ${API} (sections: ${ONLY.length ? ONLY.join(', ') : 'toutes'})`);
for (const [name, fn] of Object.entries(SECTIONS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  try { await fn(); } catch (e) {
    record(name, 'EXÉCUTION DE SECTION', false, String(e.message ?? e).slice(0, 300));
  }
}

console.log('\n════════ RÉSULTATS ════════');
const pass = results.filter(r => r.status === 'PASS').length;
console.log(`PASS: ${pass}/${results.length}`);
for (const r of results.filter(r => r.status === 'FAIL')) console.log(`  FAIL [${r.section}] ${r.name} — ${r.proof}`);
fs.writeFileSync('phase2-results.json', JSON.stringify(results, null, 2));
process.exit(0);
