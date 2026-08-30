/**
 * Templates HTML pour les emails SantéPlus.
 * Chaque fonction retourne un HTML complet prêt à être envoyé.
 */

const BRAND = '#1D6A4C';
const INK = '#0F1E2E';
const STONE = '#78716C';
const SAND = '#F5F0E6';
const LATERITE = '#C2512F';
const WHITE = '#FFFFFF';

function baseLayout(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND};padding:20px 30px;border-radius:12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:bold;color:${WHITE};">SantéPlus</span>
                    <span style="font-size:12px;color:#C8E6DC;margin-left:8px;">Mutuelle Santé Digitale — Bénin</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background:${WHITE};padding:30px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 30px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:${STONE};text-align:center;">
                SantéPlus — Plateforme de mutuelle santé digitale du Bénin<br/>
                <a href="https://santeplus.bj/cga" style="color:${BRAND};">Conditions Générales</a> ·
                <a href="https://santeplus.bj" style="color:${BRAND};">santeplus.bj</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// 1. Bienvenue / Inscription
// ─────────────────────────────────────────────
export function welcomeEmail(firstName: string, loginUrl: string): string {
  return baseLayout('Bienvenue sur SantéPlus', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">Bienvenue ${firstName} ! 🎉</h1>
    <p style="margin:0 0 12px;font-size:14px;color:${STONE};">
      Votre compte SantéPlus a été créé avec succès. Vous êtes maintenant prêt(e) à souscrire une formule d'assurance santé.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:${SAND};border-radius:12px;padding:20px;">
          <p style="margin:0;font-size:13px;color:${STONE};">Prochaines étapes :</p>
          <ol style="margin:10px 0 0;padding-left:20px;font-size:13px;color:${INK};">
            <li style="margin-bottom:6px;">Choisissez votre formule d'assurance</li>
            <li style="margin-bottom:6px;">Ajoutez vos ayants droit</li>
            <li style="margin-bottom:6px;">Payez par mobile money (MTN MoMo, Moov Money)</li>
            <li>Recevez votre carte d'assuré numérique instantanément</li>
          </ol>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:20px 0;">
          <a href="${loginUrl}" style="background:${BRAND};color:${WHITE};padding:12px 32px;border-radius:24px;text-decoration:none;font-weight:bold;font-size:14px;">
            Souscrire maintenant →
          </a>
        </td>
      </tr>
    </table>
  `);
}

// ─────────────────────────────────────────────
// 2. Contrat activé
// ─────────────────────────────────────────────
export function contractActivatedEmail(
  firstName: string,
  contractNumber: string,
  productName: string,
  premiumAnnual: number,
  cardUrl: string,
): string {
  return baseLayout('Votre contrat est actif', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">Votre contrat est actif ✅</h1>
    <p style="margin:0 0 12px;font-size:14px;color:${STONE};">
      Félicitations ${firstName} ! Votre assurance santé SantéPlus est désormais active.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:${SAND};border-radius:12px;padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Formule</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${productName}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">N° contrat</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${contractNumber}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Cotisation annuelle</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${new Intl.NumberFormat('fr-FR').format(premiumAnnual)} FCFA</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:${STONE};">
      📱 Votre carte d'assuré numérique est disponible. Présentez-la chez un prestataire partenaire.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:16px 0;">
          <a href="${cardUrl}" style="background:${BRAND};color:${WHITE};padding:12px 32px;border-radius:24px;text-decoration:none;font-weight:bold;font-size:14px;">
            Voir ma carte →
          </a>
        </td>
      </tr>
    </table>
  `);
}

// ─────────────────────────────────────────────
// 3. Paiement confirmé
// ─────────────────────────────────────────────
export function paymentConfirmedEmail(
  firstName: string,
  amount: number,
  contractNumber: string,
  method: string,
): string {
  return baseLayout('Paiement confirmé', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">Paiement reçu ✅</h1>
    <p style="margin:0 0 12px;font-size:14px;color:${STONE};">
      Bonjour ${firstName}, votre paiement a bien été enregistré.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:${SAND};border-radius:12px;padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Montant</td>
              <td style="padding:4px 0;font-size:18px;color:${BRAND};font-weight:bold;text-align:right;">${new Intl.NumberFormat('fr-FR').format(amount)} FCFA</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Contrat</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};text-align:right;">${contractNumber}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Méthode</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};text-align:right;">${method}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:${STONE};">
      Merci de votre confiance. Votre couverture reste active.
    </p>
  `);
}

// ─────────────────────────────────────────────
// 4. Rappel de paiement (3 jours avant échéance)
// ─────────────────────────────────────────────
export function paymentReminderEmail(
  firstName: string,
  amount: number,
  contractNumber: string,
  dueDate: string,
  payUrl: string,
): string {
  return baseLayout('Rappel de cotisation', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">📅 Rappel de cotisation</h1>
    <p style="margin:0 0 12px;font-size:14px;color:${STONE};">
      Bonjour ${firstName}, une cotisation arrive à échéance dans quelques jours.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Montant dû</td>
              <td style="padding:4px 0;font-size:18px;color:${LATERITE};font-weight:bold;text-align:right;">${new Intl.NumberFormat('fr-FR').format(amount)} FCFA</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Échéance</td>
              <td style="padding:4px 0;font-size:14px;color:${INK};font-weight:bold;text-align:right;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Contrat</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};text-align:right;">${contractNumber}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:${STONE};">
      ⚠️ En cas de retard de paiement de plus de 45 jours, votre contrat sera suspendu.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:16px 0;">
          <a href="${payUrl}" style="background:${LATERITE};color:${WHITE};padding:12px 32px;border-radius:24px;text-decoration:none;font-weight:bold;font-size:14px;">
            Payer maintenant →
          </a>
        </td>
      </tr>
    </table>
  `);
}

// ─────────────────────────────────────────────
// 5. Demande de remboursement reçue
// ─────────────────────────────────────────────
export function claimReceivedEmail(
  firstName: string,
  claimRef: string,
  amountRequested: number,
): string {
  return baseLayout('Demande de remboursement reçue', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">Demande reçue 📋</h1>
    <p style="margin:0 0 12px;font-size:14px;color:${STONE};">
      Bonjour ${firstName}, nous avons bien reçu votre demande de remboursement.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:${SAND};border-radius:12px;padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Référence</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${claimRef}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Montant demandé</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${new Intl.NumberFormat('fr-FR').format(amountRequested)} FCFA</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:${STONE};">
      Notre équipe examinera votre demande dans un délai de 48 à 72 heures. Vous serez notifié(e) de l'avancement.
    </p>
  `);
}

// ─────────────────────────────────────────────
// 6. Statut remboursement mis à jour
// ─────────────────────────────────────────────
export function claimStatusEmail(
  firstName: string,
  claimRef: string,
  status: string,
  amountApproved: number | null,
  note: string | null,
): string {
  const statusLabels: Record<string, string> = {
    APPROVED: 'Approuvée ✅',
    PARTIALLY_APPROVED: 'Partiellement approuvée ⚠️',
    REJECTED: 'Refusée ❌',
    UNDER_REVIEW: 'En cours d\'analyse 🔍',
    INFO_REQUESTED: 'Informations requises 📎',
    PAID: 'Payée 💰',
  };
  const statusColor = status === 'APPROVED' || status === 'PAID' ? BRAND
    : status === 'REJECTED' ? '#DC2626'
    : status === 'PARTIALLY_APPROVED' ? LATERITE
    : INK;

  return baseLayout('Statut de votre remboursement', `
    <h1 style="margin:0 0 16px;font-size:22px;color:${INK};">Statut de votre demande</h1>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:${SAND};border-radius:12px;padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Référence</td>
              <td style="padding:4px 0;font-size:13px;color:${INK};font-weight:bold;text-align:right;">${claimRef}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Statut</td>
              <td style="padding:4px 0;font-size:14px;color:${statusColor};font-weight:bold;text-align:right;">${statusLabels[status] ?? status}</td>
            </tr>
            ${amountApproved != null ? `
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${STONE};">Montant approuvé</td>
              <td style="padding:4px 0;font-size:14px;color:${BRAND};font-weight:bold;text-align:right;">${new Intl.NumberFormat('fr-FR').format(amountApproved)} FCFA</td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
    ${note ? `<p style="margin:0;font-size:12px;color:${STONE};font-style:italic;">📝 ${note}</p>` : ''}
  `);
}

// ─────────────────────────────────────────────
// 7. SMS templates (texte court)
// ─────────────────────────────────────────────
export const smsTemplates = {
  welcome: (firstName: string) =>
    `SantéPlus: Bienvenue ${firstName} ! Créez votre compte sur santeplus.bj`,

  contractActivated: (contractNumber: string, productName: string) =>
    `SantéPlus: Votre contrat ${contractNumber} (${productName}) est actif. Carte disponible sur votre espace.`,

  paymentConfirmed: (amount: number, contractNumber: string) =>
    `SantéPlus: Paiement de ${new Intl.NumberFormat('fr-FR').format(amount)} FCFA reçu pour contrat ${contractNumber}. Merci !`,

  paymentReminder: (amount: number, dueDate: string) =>
    `SantéPlus: Rappel — cotisation de ${new Intl.NumberFormat('fr-FR').format(amount)} FCFA due le ${dueDate}. Payez via santeplus.bj`,

  claimReceived: (claimRef: string) =>
    `SantéPlus: Votre demande ${claimRef} est bien enregistrée. Traitement sous 48-72h.`,

  claimStatus: (claimRef: string, status: string) =>
    `SantéPlus: Demande ${claimRef} — ${status === 'APPROVED' ? 'Approuvée' : status === 'REJECTED' ? 'Refusée' : 'Statut mis à jour'}.`,

  contractSuspended: (contractNumber: string) =>
    `SantéPlus: ATTENTION — Contrat ${contractNumber} suspendu pour cotisation impayée. Régularisez sur santeplus.bj`,

  contractExpiring: (contractNumber: string, daysLeft: number) =>
    `SantéPlus: Votre contrat ${contractNumber} expire dans ${daysLeft} jours. Renouvelez sur santeplus.bj`,
};
