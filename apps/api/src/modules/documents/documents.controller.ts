import { Controller, Get, Injectable, Module, NotFoundException, Param, Res } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.module';
import { ContractsModule, ContractsService } from '../contracts/contracts.controller';

const BRAND = '#0f766e';
const DARK = '#1e293b';

@Injectable()
export class PdfService {
  build(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise(resolve => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Creator: 'SantePlus Benin' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      draw(doc);
      doc.end();
    });
  }
}

function header(doc: PDFKit.PDFDocument, title: string) {
  doc.rect(0, 0, 595, 90).fill(BRAND);
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(20).text('SantéPlus Bénin', 50, 28);
  doc.font('Helvetica').fontSize(10).fill('#ccfbf1').text('Votre santé. Votre couverture. Simplement.', 50, 56);
  doc.fill(DARK).font('Helvetica-Bold').fontSize(16).text(title, 50, 118);
}

function footer(doc: PDFKit.PDFDocument, reference: string) {
  const y = doc.page.height - 92;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#cbd5e1').stroke();
  doc.font('Helvetica').fontSize(7.5).fill('#64748b')
    .text(
      'SantéPlus agit en qualité d’intermédiaire technologique. Les garanties sont portées par l’assureur / la mutuelle partenaire désigné(e). ' +
      'Ce document est informatif et ne remplace pas les Conditions Générales du contrat.',
      50, y + 8, { width: 495 },
    );
  doc.fontSize(7).fill('#94a3b8')
    .text(`Réf. document : ${reference} — généré le ${new Date().toLocaleString('fr-FR')}`, 50, y + 54);
}

function keyValue(doc: PDFKit.PDFDocument, y: number, label: string, value: string): number {
  doc.font('Helvetica').fontSize(9).fill('#64748b').text(label.toUpperCase(), 50, y + 2);
  doc.font('Helvetica-Bold').fontSize(11).fill(DARK).text(value || '—', 210, y, { width: 330 });
  return y + Math.max(22, doc.heightOfString(value || '—', { width: 330 }) + 10);
}

const fmtFcfa = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
const fmtDateFr = (x: Date | null | undefined) =>
  x ? new Date(x).toLocaleDateString('fr-FR') : '—';

@Controller()
export class DocumentsController {
  constructor(
    private prisma: PrismaService,
    private contractsSvc: ContractsService,
    private pdf: PdfService,
  ) {}

  @Get('contracts/:id/certificate')
  async certificate(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Res() res: Response) {
    await this.contractsSvc.canAccess(auth, id);
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        principalUser: true,
        company: true,
        product: { include: { guarantees: { include: { guarantee: true } }, insurerPartner: true } },
        beneficiaries: { where: { status: 'COVERED' }, orderBy: { birthDate: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException();

    const buffer = await this.pdf.build(doc => {
      header(doc, 'CERTIFICAT D’ADHÉSION');
      let y = 152;
      doc.font('Helvetica').fontSize(10).fill('#475569')
        .text(`Délivré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 50, y);
      y += 32;
      doc.rect(50, y, 495, 96).fill('#f0fdfa');
      doc.fill(DARK).font('Helvetica-Bold').fontSize(14)
        .text(`${contract.principalUser.lastName} ${contract.principalUser.firstName}`, 66, y + 14);
      doc.fill('#334155').font('Helvetica').fontSize(10);
      doc.text(`N° assuré : ${contract.principalUser.memberNumber ?? '—'}`, 66, y + 38);
      doc.text(`Contrat : ${contract.number}   ·   Statut : ${contract.status}`, 66, y + 54);
      const partner = contract.product.insurerPartner ? ` — portée par ${contract.product.insurerPartner.name}` : '';
      doc.text(`Formule : ${contract.product.name}${partner}`, 66, y + 70);
      y += 116;

      y = keyValue(doc, y, 'Validité', `du ${fmtDateFr(contract.startDate)} au ${fmtDateFr(contract.endDate)}`);
      if (contract.company) y = keyValue(doc, y, 'Entreprise', contract.company.name);
      y = keyValue(doc, y, 'Cotisation annuelle', fmtFcfa(contract.premiumAnnual));
      const freqLabel = contract.frequency === 'MONTHLY' ? 'Mensuelle' : contract.frequency === 'QUARTERLY' ? 'Trimestrielle' : 'Annuelle';
      y = keyValue(doc, y, 'Fractionnement', freqLabel);

      if (contract.beneficiaries.length) {
        y += 12;
        doc.font('Helvetica-Bold').fontSize(11).fill(BRAND).text('AYANTS DROIT COUVERTS', 50, y);
        y += 20;
        for (const b of contract.beneficiaries) {
          const rel = b.relation === 'SPOUSE' ? 'Conjoint(e)' : b.relation === 'CHILD' ? 'Enfant' : 'Autre';
          doc.font('Helvetica').fontSize(10).fill(DARK)
            .text(`•  ${b.lastName} ${b.firstName} — ${rel} — né(e) le ${fmtDateFr(b.birthDate)} — ${b.memberNumber}`, 58, y);
          y += 17;
        }
      }

      y += 12;
      doc.font('Helvetica-Bold').fontSize(11).fill(BRAND).text('GARANTIES SUBSCRITES', 50, y);
      y += 20;
      doc.font('Helvetica-Bold').fontSize(9).fill('#64748b');
      doc.text('GARANTIE', 58, y);
      doc.text('TAUX', 340, y);
      doc.text('PLAFOND ANNUEL', 415, y);
      y += 15;
      for (const pg of contract.product.guarantees) {
        doc.font('Helvetica').fontSize(10).fill(DARK);
        doc.text(pg.guarantee.name, 58, y);
        doc.text(`${pg.rate} %`, 340, y);
        doc.text(pg.annualLimit == null ? 'Illimité' : fmtFcfa(pg.annualLimit), 415, y);
        y += 16;
      }
      footer(doc, `CERT-${contract.number}-${Date.now()}`);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificat-${contract.number}.pdf"`);
    res.send(buffer);
  }

  @Get('company/me/attestation')
  async companyAttestation(@CurrentUser() auth: AuthUser, @Res() res: Response) {
    if (!auth.companyId) throw new NotFoundException('Compte entreprise requis');
    const group = await this.prisma.contract.findFirst({
      where: { companyId: auth.companyId, kind: 'GROUP', status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      include: { product: { select: { name: true } }, company: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!group) throw new NotFoundException('Aucun contrat collectif actif');

    const employees = await this.prisma.contract.findMany({
      where: { companyId: auth.companyId, kind: 'INDIVIDUAL', groupContractId: group.id },
      include: { principalUser: { select: { firstName: true, lastName: true, memberNumber: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 180,
    });
    const activeCount = employees.filter(e => e.status === 'ACTIVE').length;

    const buffer = await this.pdf.build(doc => {
      header(doc, 'ATTESTATION DE COUVERTURE COLLECTIVE');
      let y = 152;
      doc.font('Helvetica').fontSize(10).fill('#475569')
        .text(`Attestation délivrée le ${new Date().toLocaleDateString('fr-FR')} à la demande de l’employeur.`, 50, y);
      y += 30;
      doc.rect(50, y, 495, 84).fill('#f0fdfa');
      doc.fill(DARK).font('Helvetica-Bold').fontSize(13).text(group.company?.name ?? '', 66, y + 12);
      doc.fill('#334155').font('Helvetica').fontSize(10);
      doc.text(`Contrat collectif : ${group.number}   ·   Formule : ${group.product.name}`, 66, y + 34);
      doc.text(
        `Validité : du ${fmtDateFr(group.startDate)} au ${fmtDateFr(group.endDate)}   ·   Salariés actifs : ${activeCount}`,
        66, y + 52,
      );
      y += 102;

      doc.font('Helvetica-Bold').fontSize(11).fill(BRAND).text('BÉNÉFICIAIRES DE LA COUVERTURE', 50, y);
      y += 20;
      doc.font('Helvetica-Bold').fontSize(9).fill('#64748b');
      doc.text('SALARIÉ', 58, y);
      doc.text('N° ASSURÉ', 290, y);
      doc.text('STATUT', 430, y);
      y += 14;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
      y += 8;
      for (const e of employees) {
        if (y > doc.page.height - 140) {
          doc.addPage();
          y = 60;
        }
        doc.font('Helvetica').fontSize(9.5);
        doc.fill(DARK).text(`${e.principalUser.lastName} ${e.principalUser.firstName}`, 58, y);
        doc.text(e.principalUser.memberNumber ?? '—', 290, y);
        doc.fill(e.status === 'ACTIVE' ? '#047857' : '#b45309')
          .text(e.status === 'ACTIVE' ? 'Actif' : e.status === 'TERMINATED' ? 'Sorti' : e.status, 430, y);
        y += 16;
      }
      footer(doc, `ATT-${group.number}-${Date.now()}`);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="attestation-collective.pdf"');
    res.send(buffer);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [PdfService],
  imports: [ContractsModule],
})
export class DocumentsModule {}
