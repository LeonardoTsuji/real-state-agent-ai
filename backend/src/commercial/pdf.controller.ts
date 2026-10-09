import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import { CommercialService } from './commercial.service.js';

type PublicSnapshot = {
  broker?: { name?: string; email?: string; creci?: string };
  lead?: { name?: string; email?: string; phone?: string };
  property?: {
    title?: string;
    address?: string;
    city?: string;
    neighborhood?: string;
    priceCents?: number;
    areaM2?: number;
    bedrooms?: number;
    parkingSpaces?: number;
    description?: string;
  };
  opportunity?: {
    estimatedValueCents?: number;
    commissionBps?: number;
    proposal?: {
      sellerName?: string;
      paymentTerms?: string;
      validUntil?: string;
      clauses?: string[];
    };
    acceptance?: { acceptedAt?: string };
  };
  commissionCents?: number;
  installment?: { amountCents?: number; paidAt?: string };
  installments?: Array<{
    amountCents: number;
    status: string;
    dueAt?: string;
    paidAt?: string;
  }>;
  visit?: {
    startAt: string;
    endAt: string;
    feedback?: { notes?: string; rating?: number; interest?: string };
  };
  issuedAt?: string;
};
const brl = (value: number | undefined) =>
  value == null
    ? 'Não informado'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value / 100);
const date = (value: string | undefined) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Não informado';

@Controller('commercial/documents')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class PdfController {
  constructor(private readonly commercial: CommercialService) {}
  @Get(':id/pdf')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const document = await this.commercial.document(req.user.id, id);
    const snapshot = document.snapshot as PublicSnapshot;
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: document.title,
        Author: snapshot.broker?.name ?? 'Corretor Copilot',
        Subject: 'Documento de demonstração',
      },
    });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="copilot-${document.kind.toLowerCase()}-${id}.pdf"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    pdf.pipe(response);
    pdf.rect(0, 0, pdf.page.width, 92).fill('#004ac6');
    pdf
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('Corretor Copilot', 48, 30);
    pdf
      .font('Helvetica')
      .fontSize(9)
      .text('INTELIGÊNCIA IMOBILIÁRIA · DOCUMENTOS', 48, 58);
    pdf.y = 115;
    pdf
      .fillColor('#784b00')
      .fontSize(9)
      .text('DEMONSTRAÇÃO — ASSINATURAS E LIQUIDAÇÕES SIMULADAS', {
        align: 'center',
      });
    pdf.moveDown(1.5);
    pdf
      .fillColor('#131b2e')
      .font('Helvetica-Bold')
      .fontSize(21)
      .text(document.title, { align: 'center' });
    pdf.moveDown(0.5);
    pdf
      .fillColor('#737686')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Registro ${id} · Emitido em ${date(snapshot.issuedAt ?? document.createdAt.toISOString())}`,
        { align: 'center' },
      );
    pdf.moveDown(2);
    const section = (title: string) => {
      if (pdf.y > 700) pdf.addPage();
      pdf.fillColor('#004ac6').font('Helvetica-Bold').fontSize(12).text(title);
      pdf.moveDown(0.6);
    };
    const line = (label: string, value: string | number | null | undefined) => {
      if (pdf.y > 730) pdf.addPage();
      pdf.fillColor('#737686').font('Helvetica').fontSize(9).text(label);
      pdf
        .fillColor('#131b2e')
        .fontSize(11)
        .text(String(value ?? 'Não informado'));
      pdf.moveDown(0.55);
    };
    section('1. PROFISSIONAL INTERMEDIADOR');
    line('Nome completo', snapshot.broker?.name);
    line('Contato', snapshot.broker?.email);
    line('CRECI declarado', snapshot.broker?.creci);
    if (snapshot.lead) {
      section('2. CLIENTE / COMPRADOR');
      line('Nome completo', snapshot.lead.name);
      line('Contato', snapshot.lead.email ?? snapshot.lead.phone);
    }
    if (snapshot.opportunity?.proposal) {
      section('3. VENDEDOR / PROPONENTE');
      line('Nome completo', snapshot.opportunity.proposal.sellerName);
    }
    if (snapshot.property) {
      section('4. OBJETO DA INTERMEDIAÇÃO');
      line('Imóvel', snapshot.property.title);
      line(
        'Endereço',
        [
          snapshot.property.address,
          snapshot.property.neighborhood,
          snapshot.property.city,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      line(
        'Características',
        `${snapshot.property.areaM2 ?? '—'} m² · ${snapshot.property.bedrooms ?? '—'} quartos · ${snapshot.property.parkingSpaces ?? '—'} vagas`,
      );
      line('Valor anunciado', brl(snapshot.property.priceCents));
      if (document.kind === 'DOSSIER')
        line('Apresentação', snapshot.property.description);
    }
    if (snapshot.opportunity) {
      section('5. CONDIÇÕES COMERCIAIS E HONORÁRIOS');
      line('Valor negociado', brl(snapshot.opportunity.estimatedValueCents));
      line(
        'Comissão acordada',
        `${(snapshot.opportunity.commissionBps ?? 600) / 100}% · ${brl(snapshot.commissionCents)}`,
      );
      if (snapshot.opportunity.proposal) {
        line(
          'Condições de pagamento',
          snapshot.opportunity.proposal.paymentTerms,
        );
        line(
          'Validade da proposta',
          date(snapshot.opportunity.proposal.validUntil),
        );
        for (const clause of snapshot.opportunity.proposal.clauses ?? [])
          line('Cláusula acordada', clause);
      }
      if (snapshot.opportunity.acceptance)
        line(
          'Aceite simulado registrado',
          date(snapshot.opportunity.acceptance.acceptedAt),
        );
    }
    if (snapshot.installment) {
      section('6. QUITAÇÃO PARCIAL SIMULADA');
      line('Parcela liquidada', brl(snapshot.installment.amountCents));
      line('Liquidação registrada', date(snapshot.installment.paidAt));
      pdf
        .fillColor('#434655')
        .fontSize(10)
        .text(
          'Este registro representa exclusivamente a parcela indicada. As demais parcelas permanecem sujeitas aos seus respectivos vencimentos.',
        );
      pdf.moveDown();
    }
    if (snapshot.installments?.length) {
      section('CRONOGRAMA DE HONORÁRIOS');
      for (const [i, item] of snapshot.installments.entries())
        line(
          `Parcela ${i + 1} · ${item.status === 'PAID' ? 'Liquidada (simulação)' : 'Pendente'}`,
          `${brl(item.amountCents)} · ${date(item.paidAt ?? item.dueAt)}`,
        );
    }
    if (snapshot.visit) {
      section('RELATÓRIO DA VISITA');
      line(
        'Período',
        `${date(snapshot.visit.startAt)} até ${date(snapshot.visit.endAt)}`,
      );
      line(
        'Interesse do cliente',
        snapshot.visit.feedback?.interest
          ? ({
              HIGH: 'Alto',
              MODERATE: 'Moderado',
              MEDIUM: 'Moderado',
              LOW: 'Baixo',
              NONE: 'Sem interesse',
            }[snapshot.visit.feedback.interest] ??
              snapshot.visit.feedback.interest)
          : snapshot.visit.feedback?.rating,
      );
      line(
        'Parecer do corretor',
        snapshot.visit.feedback?.notes ?? 'Sem feedback informado',
      );
    }
    pdf.moveDown(2);
    if (pdf.y > pdf.page.height - pdf.page.margins.bottom - 60) pdf.addPage();
    pdf
      .fillColor('#737686')
      .fontSize(9)
      .text('Registro demonstrativo de assinatura', { align: 'center' });
    pdf.moveDown();
    pdf
      .fillColor('#131b2e')
      .font('Helvetica-Bold')
      .text(snapshot.broker?.name ?? 'Corretor responsável', {
        align: 'center',
      });
    const pages = pdf.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      pdf.switchToPage(index);
      const bottomMargin = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      pdf
        .fillColor('#737686')
        .font('Helvetica')
        .fontSize(7)
        .text(
          `Corretor Copilot · Demonstração · ${index + 1}/${pages.count}`,
          48,
          pdf.page.height - 35,
          { width: pdf.page.width - 96, align: 'center', lineBreak: false },
        );
      pdf.page.margins.bottom = bottomMargin;
    }
    pdf.end();
  }
}
