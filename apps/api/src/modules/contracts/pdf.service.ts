import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../common/prisma.module';
import { config } from '../../config';

// Colors as hex strings for PDFKit compatibility
const BRAND = '#1D6A4C';
const INK = '#0F1E2E';
const LATERITE = '#C2512F';
const SAND = '#F5F0E6';
const WHITE = '#FFFFFF';
const STONE = '#78716C';
const LIGHT_GREEN = '#C8E6DC';
const BLACK = '#000000';

function fcfa(n: number | null | undefined): string {
  return n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

@Injectable()
export class PdfService {
  constructor(private prisma: PrismaService) {}

  /**
   * Génère le PDF du certificat d'adhésion / contrat d'assurance
   */
  async generateContractPdf(contractId: string): Promise<Buffer> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        product: {
          include: {
            guarantees: { include: { guarantee: true } },
            exclusions: true,
            insurerPartner: { select: { name: true } },
          },
        },
        beneficiaries: true,
        principalUser: {
          select: {
            firstName: true, lastName: true, email: true,
            phone: true, address: true, city: true,
            memberNumber: true, birthDate: true,
          },
        },
        distributor: {
          select: { referralCode: true },
        },
      },
    });
    if (!contract) throw new Error('Contrat introuvable');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ── Header ──────────────────────────────────────────
      this.drawHeader(doc, "CERTIFICAT D'ADHÉSION", contract.number);

      // ── Infos assuré ────────────────────────────────────
      const y0 = 130;
      doc.fontSize(10).fillColor(INK).font('Helvetica-Bold');
      doc.text("INFORMATIONS DE L'ASSURÉ", 50, y0);
      doc.font('Helvetica').fontSize(9).fillColor(STONE);

      const user = contract.principalUser;
      const fields: [string, string][] = [
        ['Nom complet', `${user.firstName} ${user.lastName}`],
        ['N° adhérent', user.memberNumber ?? '—'],
        ['Email', user.email],
        ['Téléphone', user.phone ?? '—'],
        ['Adresse', [user.address, user.city].filter(Boolean).join(', ') || '—'],
        ['Date de naissance', fmtDate(user.birthDate)],
      ];

      let y = y0 + 18;
      for (const [label, value] of fields) {
        doc.font('Helvetica-Bold').fillColor(INK).text(label, 50, y, { width: 130 });
        doc.font('Helvetica').fillColor(STONE).text(value ?? '—', 190, y, { width: 350 });
        y += 16;
      }

      // ── Infos contrat ───────────────────────────────────
      y += 10;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(INK);
      doc.text('DÉTAILS DU CONTRAT', 50, y);
      doc.font('Helvetica').fontSize(9).fillColor(STONE);

      const contractFields: [string, string][] = [
        ['Formule', contract.product.name],
        ['N° contrat', contract.number],
        ['Assureur', contract.product.insurerPartner?.name ?? 'SantéPlus'],
        ['Statut', contract.status === 'ACTIVE' ? 'Actif' : contract.status === 'SUSPENDED' ? 'Suspendu' : contract.status],
        ['Date de début', fmtDate(contract.startDate)],
        ['Date de fin', fmtDate(contract.endDate)],
        ['Cotisation annuelle', fcfa(contract.premiumAnnual)],
        ['Fréquence de paiement', contract.frequency === 'MONTHLY' ? 'Mensuelle' : contract.frequency === 'QUARTERLY' ? 'Trimestrielle' : 'Annuelle'],
        ...(((contract as any).adhesionFee > 0) ? [['Frais d\'adhésion', `${fcfa((contract as any).adhesionFee)} — une fois, réglés le ${fmtDate((contract as any).adhesionPaidAt) || 'avec 1ère cotisation'}`] as [string, string]] : []),
      ];

      y += 18;
      for (const [label, value] of contractFields) {
        doc.font('Helvetica-Bold').fillColor(INK).text(label, 50, y, { width: 130 });
        doc.font('Helvetica').fillColor(STONE).text(value ?? '—', 190, y, { width: 350 });
        y += 16;
      }

      // ── Garanties ───────────────────────────────────────
      y += 15;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(INK);
      doc.text('GARANTIES INCLUSES', 50, y);
      y += 18;

      // Table header
      doc.fontSize(8).font('Helvetica-Bold').fillColor(WHITE);
      doc.rect(50, y, 500, 16).fill(BRAND);
      doc.fillColor(WHITE);
      doc.text('Garantie', 55, y + 3, { width: 160 });
      doc.text('Taux', 220, y + 3, { width: 50 });
      doc.text('Plafond/an', 275, y + 3, { width: 100 });
      doc.text('Copay', 380, y + 3, { width: 50 });
      doc.text('Franchise', 435, y + 3, { width: 60 });
      y += 18;

      doc.font('Helvetica').fontSize(8).fillColor(INK);
      for (let i = 0; i < contract.product.guarantees.length; i++) {
        const pg = contract.product.guarantees[i];
        doc.text(pg.guarantee.name, 55, y, { width: 160 });
        doc.text(`${pg.rate ?? 0}%`, 220, y, { width: 50 });
        doc.text(pg.annualLimit ? fcfa(pg.annualLimit) : 'Illimité', 275, y, { width: 100 });
        doc.text(`${pg.copayRate ?? 0}%`, 380, y, { width: 50 });
        doc.text(pg.deductibleValue ? fcfa(pg.deductibleValue) : '—', 435, y, { width: 60 });
        y += 14;

        // Alternating row background
        if (i % 2 === 0) {
          doc.rect(50, y - 14, 500, 14).fill(SAND);
          doc.fillColor(INK);
        }
      }

      // ── Exclusions ──────────────────────────────────────
      y += 10;
      if (contract.product.exclusions.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(LATERITE);
        doc.text('EXCLUSIONS', 50, y);
        y += 16;
        doc.fontSize(8).font('Helvetica').fillColor(STONE);
        for (const ex of contract.product.exclusions) {
          doc.text(`• ${ex.description}`, 60, y, { width: 440 });
          y += 12;
        }
      }

      // ── Ayants droit ────────────────────────────────────
      if (contract.beneficiaries.length > 0) {
        y += 10;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(INK);
        doc.text(`AYANTS DROIT (${contract.beneficiaries.length})`, 50, y);
        y += 16;
        doc.fontSize(8).font('Helvetica').fillColor(STONE);
        for (const b of contract.beneficiaries) {
          const rel = b.relation === 'SPOUSE' ? 'Conjoint(e)' : b.relation === 'CHILD' ? 'Enfant' : 'Autre';
          doc.text(`• ${b.firstName} ${b.lastName} — ${rel} — N° ${b.memberNumber}`, 60, y, { width: 440 });
          y += 12;
        }
      }

      // ── Conditions générales ────────────────────────────
      y += 15;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
      doc.text('CONDITIONS GÉNÉRALES', 50, y);
      y += 14;
      doc.fontSize(7).font('Helvetica').fillColor(STONE);
      const cga = [
        "Le présent certificat atteste de l'adhésion de l'assuré à la formule d'assurance santé décrite ci-dessus.",
        `Les conditions générales d'assurance (CGA) sont disponibles sur ${config.appUrl}/cga.`,
        "Un délai de carence s'applique selon les garanties : soins externes 30 jours, hospitalisation 90 jours, maternité 10 mois.",
        "Les tickets modérateurs et franchises sont applicables conformément au barème de la formule souscrite.",
        "Toute fausse déclaration entraîne l'annulation du contrat conformément aux articles applicables du Code CIMA.",
        `Ce document a été généré le ${fmtDate(new Date())}. Il fait foi de l'existence du contrat.`,
      ];
      for (const line of cga) {
        doc.text(line, 50, y, { width: 500 });
        y += 10;
      }

      // ── Footer ──────────────────────────────────────────
      this.drawFooter(doc);

      doc.end();
    });
  }

  /**
   * Génère le PDF de la carte d'assuré
   */
  async generateCardPdf(contractId: string): Promise<Buffer> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        product: { select: { name: true } },
        principalUser: {
          select: {
            firstName: true, lastName: true, memberNumber: true,
            photoFileId: true,
          },
        },
      },
    });
    if (!contract) throw new Error('Contrat introuvable');

    const user = contract.principalUser;
    const cardW = 500;
    const cardH = 300;
    const doc = new PDFDocument({ size: [cardW + 100, cardH + 150], margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ── Title ──────────────────────────────────────────
      doc.fontSize(14).font('Helvetica-Bold').fillColor(INK);
      doc.text("Carte d'Assuré SantéPlus", 50, 30, { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor(STONE);
      doc.text(`Document officiel — ${fmtDate(new Date())}`, 50, 50, { align: 'center' });

      // ── Card background ────────────────────────────────
      const cardX = 50;
      const cardY = 70;

      // Card background
      doc.rect(cardX, cardY, cardW, cardH).fill(BRAND);

      // Decorative circles
      doc.circle(cardX + cardW - 30, cardY + 30, 80).fill('#FFFFFF08');
      doc.circle(cardX + 30, cardY + cardH - 30, 70).fill('#00000014');

      // ── Card content ───────────────────────────────────
      const cx = cardX + 25;
      let cy = cardY + 25;

      // Brand
      doc.fontSize(8).font('Helvetica-Bold').fillColor(LIGHT_GREEN);
      doc.text('SANTÉPLUS · MUTUELLE SANTÉ DIGITALE', cx, cy);
      cy += 20;

      // Holder name
      doc.fontSize(22).font('Helvetica-Bold').fillColor(WHITE);
      doc.text(`${user.firstName} ${user.lastName}`, cx, cy);
      cy += 30;

      // Product name
      doc.fontSize(10).font('Helvetica').fillColor(LIGHT_GREEN);
      doc.text(contract.product.name, cx, cy);
      cy += 20;

      // Info grid
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GREEN);
      const col1 = cx;
      const col2 = cx + 160;
      const col3 = cx + 320;

      doc.text('N° ADHÉRENT', col1, cy);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE);
      doc.text(user.memberNumber ?? '—', col1, cy + 12);

      doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GREEN);
      doc.text('N° CONTRAT', col2, cy);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE);
      doc.text(contract.number, col2, cy + 12);

      doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GREEN);
      doc.text("VALABLE JUSQU'AU", col3, cy);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE);
      doc.text(fmtDate(contract.endDate), col3, cy + 12);

      cy += 40;

      // Status badge
      const statusText = contract.status === 'ACTIVE' ? 'ACTIF' : contract.status === 'SUSPENDED' ? 'SUSPENDU' : contract.status;
      const statusColor = contract.status === 'ACTIVE' ? '#4ADE80' : '#FBBF24';
      doc.roundedRect(cx, cy, 60, 16, 4).fill(statusColor);
      doc.fontSize(7).font('Helvetica-Bold').fillColor(BLACK);
      doc.text(statusText, cx + 5, cy + 4, { width: 50 });

      // ── QR Code area (placeholder) ─────────────────────
      const qrX = cardX + cardW - 100;
      const qrY = cardY + cardH - 90;
      doc.roundedRect(qrX, qrY, 80, 80, 6).fill(WHITE);
      doc.fontSize(6).font('Helvetica').fillColor(STONE);
      doc.text('QR CODE', qrX + 20, qrY + 30);
      doc.text('VÉRIFICATION', qrX + 12, qrY + 42);
      doc.text(contract.cardToken.slice(0, 8), qrX + 16, qrY + 54, { width: 60 });

      // ── Instructions below card ────────────────────────
      cy = cardY + cardH + 25;
      doc.fontSize(8).font('Helvetica').fillColor(STONE);
      doc.text('PRÉSENTEZ CETTE CARTE CHEZ UN PRESTATAIRE PARTENAIRE', 50, cy, { align: 'center', width: cardW });
      cy += 14;
      doc.text('Le prestataire vérifie vos droits et plafonds en temps réel via le QR code.', 50, cy, { align: 'center', width: cardW });
      cy += 14;
      doc.text(`Ce document a été généré le ${fmtDate(new Date())} — ${config.appUrl}`, 50, cy, { align: 'center', width: cardW });

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
    // Brand bar
    doc.rect(0, 0, 595, 80).fill(BRAND);

    // Logo text
    doc.fontSize(20).font('Helvetica-Bold').fillColor(WHITE);
    doc.text('SantéPlus', 50, 18, { continued: true });
    doc.fontSize(10).font('Helvetica').fillColor(LIGHT_GREEN);
    doc.text('  Mutuelle Santé Digitale — Bénin', { baseline: 'alphabetic' });

    // Title
    doc.fontSize(16).font('Helvetica-Bold').fillColor(WHITE);
    doc.text(title, 50, 48);

    // Subtitle
    doc.fontSize(9).font('Helvetica').fillColor(LIGHT_GREEN);
    doc.text(`Réf: ${subtitle}`, 50, 68);

    // Wax pattern decorative line
    doc.rect(0, 80, 595, 3).fill(LATERITE);
  }

  private drawFooter(doc: PDFKit.PDFDocument) {
    const footerY = 780;
    doc.fontSize(7).font('Helvetica').fillColor(STONE);
    doc.text(
      `SantéPlus — Plateforme de mutuelle santé digitale du Bénin — ${config.appUrl}`,
      50, footerY, { align: 'center', width: 500 },
    );
    doc.text(
      "Ce document est un certificat d'adhésion. Les conditions générales complètes sont disponibles en ligne.",
      50, footerY + 10, { align: 'center', width: 500 },
    );
  }
}
