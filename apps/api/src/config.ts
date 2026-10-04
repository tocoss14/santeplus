import * as path from 'path';

const env = (k: string, d: string = '') => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', '4000')),
  jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
  fieldEncryptionKey: env('FIELD_ENCRYPTION_KEY', ''),
  webOrigin: env('WEB_ORIGIN', 'http://localhost:5173'),
  appUrl: env('APP_URL', env('WEB_ORIGIN', 'http://localhost:5173')),
  // Origine PUBLIQUE DU FRONT, distincte d'appUrl (APP_URL = URL de l'API).
  // Sur Render le front est hébergé sur Cloudflare Pages : un lien d'e-mail
  // construit sur APP_URL (« /app/contrat », « /reinitialiser-mot-de-passe »)
  // vise une route inexistante de l'API et finit en 404 pour l'assuré. Les
  // callbacks PSP (/api/payments/webhook/…) restent, eux, sur appUrl.
  webPublicUrl: (env('WEB_ORIGIN', 'http://localhost:5173').split(',')[0] || 'http://localhost:5173')
    .trim()
    .replace(/\/+$/, ''),
  mockPayments: env('MOCK_PAYMENTS', 'true') === 'true',
  payProviders: (env('PAY_PROVIDERS', 'MOCK_MOMO') || 'MOCK_MOMO').split(',').map(s => s.trim()),
  fedapaySecretKey: env('FEDAPAY_SECRET_KEY'),
  fedapayMode: env('FEDAPAY_MODE', 'sandbox') === 'live' ? 'live' : 'sandbox',
  cinetpayApiKey: env('CINETPAY_API_KEY'),
  cinetpaySiteId: env('CINETPAY_SITE_ID'),
  uploadsDir: path.resolve(process.cwd(), 'uploads'),
  isProd: env('NODE_ENV') === 'production',
  emailApiUrl: env('EMAIL_API_URL'),
  emailApiKey: env('EMAIL_API_KEY'),
  emailFrom: env('EMAIL_FROM', 'no-reply@santeplus.bj'),
  smsApiUrl: env('SMS_API_URL'),
  smsApiKey: env('SMS_API_KEY'),
  smsSender: env('SMS_SENDER', 'SantePlus'),
  waToken: env('WA_TOKEN'),
  waPhoneId: env('WA_PHONE_ID'),
  notifyEmailTopics: env('NOTIFY_EMAIL_TOPICS'),
  notifySmsTopics: env('NOTIFY_SMS_TOPICS'),
  s3Endpoint: env('S3_ENDPOINT'),
  s3Region: env('S3_REGION', 'eu-west'),
  s3Bucket: env('S3_BUCKET'),
  s3AccessKeyId: env('S3_ACCESS_KEY_ID'),
  s3SecretAccessKey: env('S3_SECRET_ACCESS_KEY'),
  // Stockage objet (Cloudflare R2, API compatible S3) : c'est ce drapeau qui décide
  // si les téléversements — actes de naissance, photos de profil, pièces de
  // sinistre — survivent au redémarrage de l'API. Les 4 variables S3_* doivent
  // être présentes ensemble ; sinon le module files écrit dans `uploadsDir`, un
  // répertoire propre au conteneur, perdu à chaque redéploiement.
  storageRemote: Boolean(
    env('S3_ENDPOINT') && env('S3_BUCKET') && env('S3_ACCESS_KEY_ID') && env('S3_SECRET_ACCESS_KEY'),
  ),
};
