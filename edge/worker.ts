/**
 * PROTOTYPE — API edge Cloudflare Workers (Hono).
 *
 * Non branchée sur le front et non déployée : l'API réelle du produit reste
 * l'application NestJS (apps/api/src — 27 modules, 29 contrôleurs, Prisma,
 * OCR, PDF, cron), qui ne peut pas s'exécuter telle quelle sur Workers.
 * Ce prototype démontre uniquement la partie edge : health + login réel
 * contre la base Supabase (PostgREST + bcrypt). Voir DEPLOY_FREE.md.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { verify as verifyPassword } from 'hono/bcrypt'

export interface Env {
  JWT_SECRET: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  WEB_ORIGIN?: string
}

interface UserRow {
  id: string
  email: string
  passwordHash: string
  firstName: string
  lastName: string
  role: string
  status: string
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

// ---------- JWT HS256 (Web Crypto, compatible edge) ----------

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const hmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

async function createToken(user: { sub: string; email: string; role: string }, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...user, iat: now, exp: now + 12 * 60 * 60 })))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`${header}.${body}`)))
  return `${header}.${body}.${b64url(signature)}`
}

async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [headerB64, bodyB64, signatureB64] = token.split('.')
    if (!headerB64 || !bodyB64 || !signatureB64) return null
    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, new TextEncoder().encode(`${headerB64}.${bodyB64}`))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(bodyB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

const authMiddleware = async (c: { env: Env; req: { header: (n: string) => string | undefined }; set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) throw new HTTPException(401, { message: 'Token manquant' })
  const payload = await verifyToken(header.slice(7), c.env.JWT_SECRET)
  if (!payload) throw new HTTPException(401, { message: 'Token invalide' })
  c.set('user', payload)
  await next()
}

// ---------- Application ----------

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: (c) => (c.env.WEB_ORIGIN ? [c.env.WEB_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'] : '*'),
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status)
  console.error(err)
  return c.json({ message: 'Erreur interne du serveur' }, 500)
})

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'santeplus-edge', timestamp: new Date().toISOString() }))

app.post('/api/auth/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')
  // Colonnes Prisma camelCase (pas de @map) — requête PostgREST directe.
  const url = `${c.env.SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,email,passwordHash,firstName,lastName,role,status&limit=1`
  const res = await fetch(url, {
    headers: { apikey: c.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${c.env.SUPABASE_SERVICE_KEY}` },
  })
  if (!res.ok) throw new HTTPException(502, { message: 'Base de données indisponible' })
  const rows = (await res.json()) as UserRow[]
  const user = rows[0]
  if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) {
    throw new HTTPException(401, { message: 'Identifiants invalides' })
  }
  const token = await createToken({ sub: user.id, email: user.email, role: user.role }, c.env.JWT_SECRET)
  return c.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }, token })
})

app.get('/api/auth/me', authMiddleware, (c) => {
  const user = c.get('user') as { sub: string; email: string; role: string }
  return c.json({ id: user.sub, email: user.email, role: user.role })
})

// Tout le reste de la surface métier (contrats, sinistres, soins, paiements…)
// reste porté par l'API NestJS — un stub ici créerait deux sources de vérité.
app.all('/api/*', (c) => c.json({ message: 'Non implémenté sur edge — API NestJS requise' }, 501))

export default app
