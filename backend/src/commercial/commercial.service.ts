import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type Opportunity } from '../prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../audit/audit.js';
import { canTransitionLeadStage } from '../domain/leads/lead-stage.js';
import {
  AcceptDto,
  COMMERCIAL_STAGES,
  CreateDocumentDto,
  CreateOpportunityDto,
  InstallmentInputDto,
  OpportunitiesQueryDto,
  PatchOpportunityDto,
  ProposalDto,
  SimulatePaymentDto,
} from './commercial.dto.js';

type SavedProposal = ProposalDto & {
  idempotencyKey: string;
  createdAt: string;
  history?: Prisma.JsonValue[];
};
export function commissionCents(valueCents: number, bps: number) {
  return Math.round((valueCents * bps) / 10000);
}
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class CommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private simulation() {
    if (
      this.config.get<boolean>('DEMO_MODE', false) !== true ||
      this.config.get<string>('NODE_ENV') === 'production'
    )
      throw new ForbiddenException(
        'Commercial simulations are only available in demonstration environments',
      );
  }
  private key(brokerId: string, id: string, key: string) {
    return createHash('sha256')
      .update(`${brokerId}:${id}:${key}`)
      .digest('hex');
  }
  private where(
    brokerId: string,
    query: OpportunitiesQueryDto,
  ): Prisma.OpportunityWhereInput {
    return {
      brokerId,
      stage: query.stage,
      leadId: query.leadId,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
  }
  async list(brokerId: string, query: OpportunitiesQueryDto) {
    const where = this.where(brokerId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }
  async pipeline(brokerId: string, query: OpportunitiesQueryDto) {
    const items = await this.prisma.opportunity.findMany({
      where: this.where(brokerId, query),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const broker = await this.prisma.broker.findUniqueOrThrow({
      where: { id: brokerId },
      select: { monthlyGoalCents: true },
    });
    const byStage = COMMERCIAL_STAGES.map((stage) => {
      const records = items.filter((item) => item.stage === stage);
      return {
        stage,
        count: records.length,
        valueCents: records.reduce(
          (total, item) => total + item.estimatedValueCents,
          0,
        ),
        commissionCents: records.reduce(
          (total, item) =>
            total +
            commissionCents(item.estimatedValueCents, item.commissionBps),
          0,
        ),
      };
    });
    const won = items.filter((item) => item.stage === 'WON');
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date());
    const monthlyWon = won.filter((item) => {
      const accepted = (
        item.acceptance as Record<string, Prisma.JsonValue> | null
      )?.acceptedAt;
      return (
        typeof accepted === 'string' &&
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
        }).format(new Date(accepted)) === month
      );
    });
    const closed =
      won.length + items.filter((item) => item.stage === 'LOST').length;
    const wonCommissionCents = monthlyWon.reduce(
      (sum, item) =>
        sum + commissionCents(item.estimatedValueCents, item.commissionBps),
      0,
    );
    return {
      items,
      metrics: {
        byStage,
        total: items.length,
        vgvCents: items
          .filter((i) => i.stage !== 'LOST')
          .reduce((sum, item) => sum + item.estimatedValueCents, 0),
        expectedCommissionCents: items
          .filter((i) => i.stage !== 'LOST')
          .reduce(
            (sum, item) =>
              sum +
              commissionCents(item.estimatedValueCents, item.commissionBps),
            0,
          ),
        conversionPercent: closed ? Math.round((won.length * 100) / closed) : 0,
        monthlyGoalCents: broker.monthlyGoalCents,
        wonCommissionCents,
        goalProgressPercent: broker.monthlyGoalCents
          ? Math.round((wonCommissionCents * 100) / broker.monthlyGoalCents)
          : 0,
      },
    };
  }
  async get(brokerId: string, id: string) {
    const item = await this.prisma.opportunity.findFirst({
      where: { id, brokerId },
    });
    if (!item) throw new NotFoundException();
    return item;
  }
  private async lock(
    tx: Prisma.TransactionClient,
    brokerId: string,
    id: string,
  ) {
    const rows = await tx.$queryRaw<Opportunity[]>(
      Prisma.sql`SELECT * FROM opportunities WHERE id=${id}::uuid AND "brokerId"=${brokerId}::uuid FOR UPDATE`,
    );
    if (!rows.length) throw new NotFoundException();
    return rows[0]!;
  }
  private async refs(
    tx: Prisma.TransactionClient,
    brokerId: string,
    leadId: string,
    propertyIds: Array<string | null | undefined>,
  ) {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException();
    for (const id of propertyIds)
      if (
        id &&
        !(await tx.property.findFirst({
          where: { id, brokerId, deletedAt: null },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
    if (propertyIds[0] && propertyIds[0] === propertyIds[1])
      throw new BadRequestException(
        'Alternative property must differ from the primary property',
      );
    return lead;
  }
  async create(
    brokerId: string,
    dto: CreateOpportunityDto,
    requestId?: string,
  ) {
    if (['WON', 'PROPOSAL_SENT'].includes(dto.stage ?? ''))
      throw new BadRequestException(
        'Use the proposal and explicit acceptance actions',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.refs(tx, brokerId, dto.leadId, [
        dto.propertyId,
        dto.alternativePropertyId,
      ]);
      const item = await tx.opportunity.create({ data: { ...dto, brokerId } });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'opportunity',
        entityId: item.id,
        action: 'CREATE',
        changedFields: Object.keys(dto),
        requestId,
      });
      return item;
    });
  }
  async patch(
    brokerId: string,
    id: string,
    dto: PatchOpportunityDto,
    requestId?: string,
  ) {
    if (!Object.values(dto).some((v) => v !== undefined))
      throw new BadRequestException('At least one field is required');
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, brokerId, id);
      if (current.stage === 'WON')
        throw new ConflictException('Accepted opportunities cannot be edited');
      if (dto.stage === 'WON' || dto.stage === 'PROPOSAL_SENT')
        throw new BadRequestException('Use proposal and acceptance actions');
      if (
        current.proposal &&
        (dto.estimatedValueCents !== undefined ||
          dto.commissionBps !== undefined ||
          dto.propertyId !== undefined ||
          dto.alternativePropertyId !== undefined)
      )
        throw new ConflictException(
          'Commercial terms are fixed after a proposal; issue a counterproposal',
        );
      await this.refs(tx, brokerId, current.leadId, [
        dto.propertyId === undefined ? current.propertyId : dto.propertyId,
        dto.alternativePropertyId === undefined
          ? current.alternativePropertyId
          : dto.alternativePropertyId,
      ]);
      const item = await tx.opportunity.update({
        where: { id, brokerId },
        data: dto,
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'opportunity',
        entityId: id,
        action: dto.stage ? 'TRANSITION' : 'UPDATE',
        changedFields: Object.keys(dto),
        requestId,
      });
      return item;
    });
  }
  async proposal(
    brokerId: string,
    id: string,
    dto: ProposalDto,
    clientKey: string,
    requestId?: string,
  ) {
    const idempotencyKey = this.key(brokerId, id, clientKey);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, brokerId, id);
      const previous = current.proposal as unknown as SavedProposal | null;
      if (previous?.idempotencyKey === idempotencyKey) {
        const {
          idempotencyKey: unusedKey,
          createdAt: unusedDate,
          history: unusedHistory,
          ...input
        } = previous;
        void unusedKey;
        void unusedDate;
        void unusedHistory;
        if (!isDeepStrictEqual(input, json(dto)))
          throw new ConflictException(
            'Proposal key reused with different terms',
          );
        return current;
      }
      if (['WON', 'LOST'].includes(current.stage))
        throw new ConflictException('This opportunity is closed');
      if (!current.propertyId)
        throw new BadRequestException('A primary property is required');
      if (new Date(dto.validUntil) <= new Date())
        throw new BadRequestException(
          'Proposal validity must be in the future',
        );
      const lead = await this.refs(tx, brokerId, current.leadId, [
        current.propertyId,
        current.alternativePropertyId,
      ]);
      if (!canTransitionLeadStage(lead.stage, 'NEGOTIATION'))
        throw new BadRequestException(
          'Lead must be qualified before a commercial proposal',
        );
      const commission = commissionCents(dto.valueCents, current.commissionBps);
      if (
        dto.installments &&
        dto.installments.reduce((sum, item) => sum + item.amountCents, 0) !==
          commission
      )
        throw new BadRequestException(
          'Honorary installments must total the commission',
        );
      const history = previous
        ? [
            ...(previous.history ?? []),
            json({ ...previous, history: undefined }),
          ].slice(-30)
        : [];
      const item = await tx.opportunity.update({
        where: { id, brokerId },
        data: {
          stage: 'PROPOSAL_SENT',
          estimatedValueCents: dto.valueCents,
          proposal: json({
            ...dto,
            idempotencyKey,
            createdAt: new Date().toISOString(),
            history,
          }),
        },
      });
      if (lead.stage !== 'NEGOTIATION') {
        const updated = await tx.lead.updateMany({
          where: { id: lead.id, brokerId, stage: lead.stage, deletedAt: null },
          data: { stage: 'NEGOTIATION' },
        });
        if (!updated.count)
          throw new ConflictException('Lead changed concurrently');
        await tx.leadStageHistory.create({
          data: {
            brokerId,
            leadId: lead.id,
            actorId: brokerId,
            fromStage: lead.stage,
            toStage: 'NEGOTIATION',
          },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead',
          entityId: lead.id,
          action: 'TRANSITION',
          changedFields: ['stage'],
          requestId,
        });
      }
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'opportunity',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['proposal', 'stage', 'estimatedValueCents'],
        requestId,
      });
      return item;
    });
  }
  async accept(
    brokerId: string,
    id: string,
    dto: AcceptDto,
    clientKey: string,
    requestId?: string,
  ) {
    this.simulation();
    if (!dto.confirmed || !dto.simulated)
      throw new BadRequestException('Explicit simulated acceptance required');
    const key = this.key(brokerId, id, clientKey);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, brokerId, id);
      const acceptance = current.acceptance as Record<
        string,
        Prisma.JsonValue
      > | null;
      if (acceptance) {
        if (acceptance.idempotencyKey !== key)
          throw new ConflictException('Opportunity already accepted');
        return current;
      }
      const proposal = current.proposal as unknown as SavedProposal | null;
      if (
        current.stage !== 'PROPOSAL_SENT' ||
        !proposal ||
        new Date(proposal.validUntil) <= new Date()
      )
        throw new ConflictException('A valid active proposal is required');
      const lead = await this.refs(tx, brokerId, current.leadId, [
        current.propertyId,
        current.alternativePropertyId,
      ]);
      if (!canTransitionLeadStage(lead.stage, 'WON'))
        throw new ConflictException(
          'Lead is no longer eligible for acceptance',
        );
      const acceptedAt = new Date();
      const updated = await tx.lead.updateMany({
        where: { id: lead.id, brokerId, stage: lead.stage, deletedAt: null },
        data: { stage: 'WON' },
      });
      if (!updated.count)
        throw new ConflictException('Lead changed concurrently');
      if (lead.stage !== 'WON')
        await tx.leadStageHistory.create({
          data: {
            brokerId,
            leadId: lead.id,
            actorId: brokerId,
            fromStage: lead.stage,
            toStage: 'WON',
          },
        });
      const amount = commissionCents(
        current.estimatedValueCents,
        current.commissionBps,
      );
      const installments: InstallmentInputDto[] =
        proposal.installments ??
        (amount > 0
          ? [
              { amountCents: Math.ceil(amount / 2) },
              { amountCents: Math.floor(amount / 2) },
            ].filter((i) => i.amountCents > 0)
          : []);
      for (const [index, installment] of installments.entries())
        await tx.installment.create({
          data: {
            brokerId,
            opportunityId: id,
            amountCents: installment.amountCents,
            dueAt: installment.dueAt ? new Date(installment.dueAt) : null,
            idempotencyKey: this.key(
              brokerId,
              id,
              `${key}:installment:${index}`,
            ),
          },
        });
      const item = await tx.opportunity.update({
        where: { id, brokerId },
        data: {
          stage: 'WON',
          acceptance: json({
            idempotencyKey: key,
            acceptedAt,
            simulated: true,
            signatureStatus: 'SIMULATED_ACCEPTED',
            depositStatus: 'SIMULATED_CONFIRMED',
            commissionCents: amount,
          }),
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'opportunity',
        entityId: id,
        action: 'TRANSITION',
        changedFields: ['stage', 'acceptance', 'installments'],
        requestId,
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead',
        entityId: lead.id,
        action: 'TRANSITION',
        changedFields: ['stage'],
        requestId,
      });
      return item;
    });
  }
  async installments(brokerId: string, id: string) {
    await this.get(brokerId, id);
    return this.prisma.installment.findMany({
      where: { brokerId, opportunityId: id },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }
  async pay(
    brokerId: string,
    id: string,
    dto: SimulatePaymentDto,
    clientKey: string,
    requestId?: string,
  ) {
    this.simulation();
    if (!dto.simulated)
      throw new BadRequestException('Explicit simulation required');
    void clientKey;
    return this.prisma.$transaction(async (tx) => {
      const installment = await tx.installment.findFirst({
        where: { id, brokerId },
      });
      if (!installment) throw new NotFoundException();
      await this.lock(tx, brokerId, installment.opportunityId);
      const current = await tx.installment.findFirstOrThrow({
        where: { id, brokerId },
      });
      if (current.status === 'PAID') return { ...current, simulated: true };
      const paid = await tx.installment.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'installment',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['status', 'paidAt', 'simulated'],
        requestId,
      });
      return { ...paid, simulated: true };
    });
  }
  async documents(brokerId: string, query: OpportunitiesQueryDto) {
    const where = { brokerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commercialDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          opportunityId: true,
          kind: true,
          title: true,
          createdAt: true,
        },
      }),
      this.prisma.commercialDocument.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async document(brokerId: string, id: string) {
    const doc = await this.prisma.commercialDocument.findFirst({
      where: { id, brokerId },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }
  async createDocument(
    brokerId: string,
    dto: CreateDocumentDto,
    requestId?: string,
  ) {
    if (!dto.opportunityId) {
      if (dto.kind === 'DOSSIER' && dto.propertyId)
        return this.propertyDocument(brokerId, dto, requestId);
      if (['REPORT', 'VISIT_REPORT'].includes(dto.kind) && dto.visitId)
        return this.propertyDocument(brokerId, dto, requestId);
      throw new BadRequestException(
        'An opportunity, property dossier or visit report context is required',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const opportunity = await this.lock(tx, brokerId, dto.opportunityId!);
      const lead = await this.refs(tx, brokerId, opportunity.leadId, [
        opportunity.propertyId,
        opportunity.alternativePropertyId,
      ]);
      const installments = await tx.installment.findMany({
        where: { brokerId, opportunityId: opportunity.id },
      });
      let installment = dto.installmentId
        ? installments.find((i) => i.id === dto.installmentId)
        : undefined;
      if (dto.installmentId && !installment) throw new NotFoundException();
      if (dto.kind === 'RECEIPT') {
        installment ??= installments.find((i) => i.status === 'PAID');
        if (!installment || installment.status !== 'PAID')
          throw new BadRequestException(
            'A paid installment is required for a receipt',
          );
        const existing = await tx.commercialDocument.findFirst({
          where: {
            brokerId,
            opportunityId: opportunity.id,
            kind: 'RECEIPT',
            snapshot: { path: ['installment', 'id'], equals: installment.id },
          },
        });
        if (existing) return existing;
      }
      if (dto.kind === 'ACCEPTANCE' && !opportunity.acceptance)
        throw new BadRequestException('Opportunity must be accepted');
      if (dto.kind === 'DRAFT' && !opportunity.proposal)
        throw new BadRequestException('A proposal is required');
      const property = opportunity.propertyId
        ? await tx.property.findFirst({
            where: { id: opportunity.propertyId, brokerId, deletedAt: null },
          })
        : null;
      const broker = await tx.broker.findUniqueOrThrow({
        where: { id: brokerId },
        select: { id: true, name: true, email: true, creci: true },
      });
      const snapshot = json({
        version: 1,
        simulated: true,
        notice:
          'Documento de demonstração; assinaturas e liquidações simuladas.',
        issuedAt: new Date(),
        broker,
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        },
        property,
        opportunity,
        installments,
        installment: installment ?? null,
        commissionCents: commissionCents(
          opportunity.estimatedValueCents,
          opportunity.commissionBps,
        ),
      });
      const document = await tx.commercialDocument.create({
        data: {
          brokerId,
          opportunityId: opportunity.id,
          kind: dto.kind,
          title: dto.title,
          snapshot,
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'commercial_document',
        entityId: document.id,
        action: 'CREATE',
        changedFields: ['snapshot', 'kind'],
        requestId,
      });
      return document;
    });
  }
  private async propertyDocument(
    brokerId: string,
    dto: CreateDocumentDto,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const visit = dto.visitId
        ? await tx.visit.findFirst({ where: { id: dto.visitId, brokerId } })
        : null;
      if (dto.visitId && !visit) throw new NotFoundException();
      const propertyId = visit?.propertyId ?? dto.propertyId;
      const property = await tx.property.findFirst({
        where: { id: propertyId, brokerId, deletedAt: null },
      });
      if (!property) throw new NotFoundException();
      if (dto.propertyId && visit && dto.propertyId !== visit.propertyId)
        throw new BadRequestException('Property does not match the visit');
      const lead = visit
        ? await tx.lead.findFirst({
            where: { id: visit.leadId, brokerId, deletedAt: null },
            select: { id: true, name: true, email: true, phone: true },
          })
        : null;
      if (visit && !lead) throw new NotFoundException();
      const broker = await tx.broker.findUniqueOrThrow({
        where: { id: brokerId },
        select: { id: true, name: true, email: true, creci: true },
      });
      const document = await tx.commercialDocument.create({
        data: {
          brokerId,
          kind: dto.kind,
          title: dto.title,
          snapshot: json({
            version: 1,
            simulated: true,
            notice: 'Documento de demonstração.',
            issuedAt: new Date(),
            broker,
            property,
            lead,
            visit,
          }),
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'commercial_document',
        entityId: document.id,
        action: 'CREATE',
        changedFields: ['snapshot', 'kind'],
        requestId,
      });
      return document;
    });
  }
}
