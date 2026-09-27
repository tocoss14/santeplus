/**
 * Recette staging : le fix photo de profil est-il déployé et fonctionnel ?
 * Parcours réel d'un assuré : inscription avec photo → login → upload → view.
 *
 * Usage (depuis la racine du dépôt) :
 *   node scripts/staging-photo-check.mjs https://santeplus.runsite.app
 *
 * Appelée aussi par le job « Recette staging » de deploy.yml (workflow_dispatch)
 * : dans ce contexte CI, la fixture .freebuff/acte-test.png (ignorée par git)
 * est absente — le script génère alors un PNG 1×1 embarqué, suffisant pour
 * valider la chaîne d'autorisation et le content-type de la réponse.
 *
 * ⚠️ Crée un compte jetable (photo_stg_*@test.bj) sur la base CIBLÉE.
 *    Ne JAMAIS pointer sur production sans y être invité explicitement.
 */
import { readFileSync } from 'fs';

// PNG 1×1 transparent (signature PNG valide, mime image/png accepté par l'API).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const BASE = process.argv[2] || '';
if (!/^https?:\/\/.+/.test(BASE)) {
  console.error('Usage : node scripts/staging-photo-check.mjs https://<staging>');
  process.exit(2);
}
if (!BASE.startsWith('https://')) console.log('⚠️  Cible non-HTTPS : réservé aux tests locaux (dry-run).');
const O = { Origin: BASE };
const uid = Math.random().toString(36).slice(2, 8);
const email = `photo_stg_${uid}@test.bj`;

const j = async (res, label) => {
  const text = await res.text();
  console.log(`--- ${label} [${res.status}] ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { return null; }
};

// Photo : fixture locale si présente, sinon PNG embarqué (contexte CI).
let png = PNG_1x1;
let photoLabel = 'PNG 1x1 embarqué';
try {
  png = readFileSync('.freebuff/acte-test.png');
  photoLabel = 'fixture .freebuff/acte-test.png';
} catch { /* fixture absente — fallback embarqué */ }
console.log(`Photo utilisée : ${photoLabel} (${png.length} octets)`);

// 0. Sonde de version : 404 = image antérieure à b2466b3 (fix non embarqué) ;
//    builtAt récent = image reconstruite même si version est vide (build Runsite).
const ver = await fetch(`${BASE}/api/version`).then(r => r.json()).catch(() => null);
console.log('--- version', JSON.stringify(ver));
if (!ver || !ver.time) console.log('⚠️  /api/version absente : image antérieure au commit b2466b3');

// 1. Register
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { ...O, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Photo', lastName: 'Staging', email, password: 'Test1234!',
    phone: '+229 9' + Math.floor(10000000 + Math.random() * 90000000),
    birthDate: '1992-03-10', gender: 'M',
  }),
});
await j(reg, 'register');

// 2. Login (cookie httpOnly)
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { ...O, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Test1234!' }),
});
const cookies = login.headers.getSetCookie?.() ?? [];
const access = cookies.find(c => c.startsWith('sp_access='))?.split(';')[0];
console.log('--- login', login.status, access ? 'cookie ok' : 'PAS DE COOKIE');
if (!access) process.exit(1);

// 3. Upload photo (multipart artisanal)
const boundary = '----stg' + uid;
const parts = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),
  png,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const up = await fetch(`${BASE}/api/users/me/photo`, {
  method: 'POST',
  headers: { ...O, Cookie: access, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body: parts,
});
const upBody = await j(up, 'upload photo');

// 4. Le fileId est-il bien persisté sur le compte ?
const me = await fetch(`${BASE}/api/users/me/photo`, { headers: { ...O, Cookie: access } });
const meBody = await j(me, 'users/me/photo');

// 5. View — le point qui cassait (403) : cookie d'abord, puis Bearer
if (!upBody?.fileId) { console.log('❌ Pas de fileId — vérification impossible'); process.exit(1); }
const viewCookie = await fetch(`${BASE}/api/files/${upBody.fileId}/view`, { headers: { ...O, Cookie: access } });
const bufC = Buffer.from(await viewCookie.arrayBuffer());
console.log(`--- view (cookie)  [${viewCookie.status}] type=${viewCookie.headers.get('content-type')} bytes=${bufC.length}`);
const viewBearer = await fetch(`${BASE}/api/files/${upBody.fileId}/view`, { headers: { ...O, Authorization: `Bearer ${access.split('=')[1]}` } });
const bufB = Buffer.from(await viewBearer.arrayBuffer());
console.log(`--- view (Bearer)  [${viewBearer.status}] type=${viewBearer.headers.get('content-type')} bytes=${bufB.length}`);

// 6. Verdict
const ok = (s, t, b) => s === 200 && /^image\//.test(t ?? '') && b > 0;
if (ok(viewCookie.status, viewCookie.headers.get('content-type'), bufC.length)) {
  console.log(`\n✅ FIX VISIBLE : la photo s'affiche sur le profil (view 200, ${bufC.length} octets, fichier ${upBody.fileId})`);
} else if (viewCookie.status === 403 || viewBearer.status === 403) {
  console.log('\n❌ STAGING PÉRIMÉ : view 403 — le bug « photo invisible » est toujours en place');
  process.exit(1);
} else {
  console.log(`\n❌ ÉCHEC INATTENDU : view cookie=${viewCookie.status} bearer=${viewBearer.status}`);
  process.exit(1);
}
