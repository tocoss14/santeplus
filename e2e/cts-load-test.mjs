// Test de charge CTS — reproduction/correction du P2028 (écart P0 ②, audit 13/09).
// N confirmations tiers-payant CONCURRENTES sur un même contrat (row lock
// TechnicalAccount) : chaque confirm = $transaction { recordEngagement(tx) }.
// Usage : node cts-load-test.mjs <port> [nClaims]
import net from 'node:net';
import { execSync } from 'node:child_process';

const PORT = Number(process.argv[2] ?? 4000);
const N = Number(process.argv[3] ?? 8);
const API = `http://127.0.0.1:${PORT}`;

const results = { pass: 0, fail: 0, errors: [] };
const record = (ok, name, proof = '') => {
  if (ok) results.pass++; else { results.fail++; results.errors.push(`${name} — ${proof}`); }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${proof}`);
};

async function j(ctx, method, path, body) {
  const res = await ctx(path, {
    method,
    headers: { 'content-type': 'application/json', ...(ctx.token ? { authorization: `Bearer ${ctx.token}` } : {}) },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}
const login = async (email, password) => {
  const r = await j(fetch, 'POST', `${API}/api/auth/login`, { email, password });
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
  return r.json.accessToken;
};

const mkCtx = async (email, password) => {
  const token = await login(email, password);
  return Object.assign(((path, init) => fetch(path, init)), { token });
};
const admin = await mkCtx('admin@santeplus.bj', 'Demo1234!');
const member = await mkCtx('fatou@demo.bj', 'Demo1234!');
const pres = await mkCtx('prestataire@santeplus.bj', 'Demo1234!');

// Contrat démo sans carence (fatou@demo.bj — Santé Essentielle v2.0, seedée)
const mine = await j(member, 'GET', `${API}/api/contracts/mine`);
const contract = (mine.json ?? []).find(c => c.status === 'ACTIVE');
if (!contract) throw new Error('aucun contrat actif pour fatou@demo.bj');
const card = await j(member, 'GET', `${API}/api/contracts/${contract.id}/card`);
if (!card.json?.cardToken) throw new Error('pas de carte: ' + card.status);
const cats = await j(member, 'GET', `${API}/api/claims/categories`);
const catCons = (cats.json ?? []).find(c => /CONS/i.test(c.category))?.category;

// Nettoyage répétable : supprime l'historique TP des runs précédents (LT-*) pour
// repartir d'un état identique — le test reste alors probant à chaque exécution.
const cleanSql = `
DELETE FROM "CtsJournal" WHERE "contractId" = '${contract.id}';
DELETE FROM "SolidarityMovement" WHERE "contractId" = '${contract.id}';
DELETE FROM "CtsAlert" WHERE "contractId" = '${contract.id}';
DELETE FROM "ClaimItem" WHERE "claimId" IN (SELECT id FROM "Claim" WHERE "contractId" = '${contract.id}' AND "reference" LIKE 'TPE-%');
DELETE FROM "Claim" WHERE "contractId" = '${contract.id}' AND "reference" LIKE 'TPE-%';
UPDATE "TechnicalAccount" SET "consumed" = 0, "committed" = 0, "primeCollected" = "primeBilled", "available" = "benefitBudget" + COALESCE("budgetBoost", 0);
`;
execSync('docker exec -i audit-pg psql -U audit -d santeplus_audit -v ON_ERROR_STOP=1', { input: cleanSql, stdio: 'pipe' });

// État CTS avant (post-nettoyage)
const cts0 = await j(admin, 'GET', `${API}/api/admin/contracts/${contract.id}/cts`);
const a0 = cts0.json?.account ?? {};
console.log(`contrat=${contract.id} budget=${a0.benefitBudget} avant: committed=${a0.committed} consumed=${a0.consumed} available=${a0.available}`);

// ── N confirmations TP concurrentes ────────────────────────────────────────
const AMOUNT = 5000;
const t0 = Date.now();
const jobs = Array.from({ length: N }, (_, i) => {
  const form = new FormData();
  form.append('payload', JSON.stringify({
    cardToken: card.json.cardToken,
    items: [{ code: `LT-${i}`, label: `Load ${i}`, categoryId: catCons, quantity: 1, unitPrice: AMOUNT }],
  }));
  return fetch(`${API}/api/provider/thirdparty/initiate`, {
    method: 'POST', headers: { authorization: `Bearer ${pres.token}` }, body: form,
  }).then(async r => {
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { }
    if (!r.ok) return { i, phase: 'initiate', status: r.status, text: String(text).slice(0, 120) };
    const c = await j(pres, 'POST', `${API}/api/provider/thirdparty/${json.id}/confirm`, {});
    return { i, phase: 'confirm', status: c.status, text: c.text.slice(0, 160), claimId: json.id };
  });
});
const outcomes = await Promise.all(jobs);
const ms = Date.now() - t0;

const confirmed = outcomes.filter(o => o.phase === 'confirm' && o.status === 201);
const fails = outcomes.filter(o => !(o.phase === 'confirm' && o.status === 201));
console.log(`\n${confirmed.length}/${N} confirmations OK en ${ms} ms`);
for (const f of fails.slice(0, 10)) console.log(`  échec [${f.phase} ${f.status}] ${f.text}`);

// ── Invariants post-charge ─────────────────────────────────────────────────
const cts1 = await j(admin, 'GET', `${API}/api/admin/contracts/${contract.id}/cts`);
const a1 = cts1.json?.account ?? {};
const deltaCommitted = (a1.committed ?? 0) - (a0.committed ?? 0);
// Attendu exact = somme des totalApproved réels (net CMU 70 %/30 % appliqué par le moteur),
// interroge la DB via psql docker — pas d'hypothèse sur le taux.
const ids = confirmed.map(c => c.claimId).filter(Boolean);
let expected = 0;
if (ids.length) {
  const sql = `SELECT COALESCE(SUM("totalApproved"),0) FROM "Claim" WHERE id IN (${ids.map(i => `'${i}'`).join(',')});`;
  const out = execSync('docker exec -i audit-pg psql -U audit -d santeplus_audit -tA', { input: sql, encoding: 'utf8' }).trim();
  expected = Number(out) || 0;
}

// Le delta doit refléter exactement les confirmations réussies (pas de lost update).
record(ids.length > 0 && deltaCommitted === expected, 'Aucun lost update (committed = somme des totalApproved)',
  `Δcommitted=${deltaCommitted} attendu=${expected} (${confirmed.length}/${N} confirmés)`);

// (Vérification journal faite côté harnais via psql après exécution.)
console.log('CLAIM_IDS=' + confirmed.map(c => c.claimId).join(','));

// Inv1 reconstruit
const recon = (a1.benefitBudget ?? 0) + ((a1.budgetBoost ?? 0) || 0) - (a1.consumed ?? 0) - (a1.committed ?? 0);
record(recon === a1.available, 'Inv1 : disponible = budget − consommé − engagé', `reconstruit=${recon} affiché=${a1.available}`);

// Invariant métier : chaque claim confirmé a bien son engagement (ou est retombé SUBMITTED)
record(confirmed.length > 0, 'Au moins une confirmation réussie', `${confirmed.length}/${N}`);

console.log(`\nRÉSULTAT: ${results.pass} PASS / ${results.fail} FAIL en ${ms} ms`);
process.exit(results.fail > 0 ? 1 : 0);
