import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/client.js';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { cursorPage, cursorWhere, decodeCursor } from '../common/cursor.js';
import { isValidVisitInterval } from '../domain/visits/visit-interval.js';
import { prepareSchedule } from '../scheduling/schedule-transaction.js';
import { canTransitionLeadStage } from '../domain/leads/lead-stage.js';
import { writeAudit } from '../audit/audit.js';
import { AsyncWorkflowsService } from '../integrations/async-workflows.service.js';
import {
  CreateVisitDto,
  ListVisitsQueryDto,
  RescheduleVisitDto,
  CompleteVisitDto,
} from './visit.dto.js';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: AsyncWorkflowsService,
  ) {}

  async create(
    brokerId: string,
    dto: CreateVisitDto,
    requestId?: string,
    commandKey?: string,
  ) {
    const interval = {
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
    };
    if (!isValidVisitInterval(interval))
      throw new BadRequestException('Visit end must be after start');
    const key = commandKey?.trim() || randomUUID();
    if (key.length > 500)
      throw new BadRequestException('Idempotency key is too long');
    const idempotencyKey = `visit:${brokerId}:${createHash('sha256').update(key).digest('hex')}`;
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const previous = await tx.visit.findUnique({ where: { idempotencyKey } });
      if (previous) return previous;
      await this.requireOwnedEntities(tx, brokerId, dto.leadId, dto.propertyId);
      try {
        const visit = await tx.visit.create({
          data: {
            ...interval,
            brokerId,
            leadId: dto.leadId,
            propertyId: dto.propertyId,
            idempotencyKey,
            notes: dto.notes,
          },
        });
        await this.workflows.scheduleVisitReminder(tx, visit);
        await this.workflows.enqueue(tx, {
          type: 'CALENDAR_SYNC',
          idempotencyKey: `calendar:${visit.id}:${visit.startAt.toISOString()}:${visit.status}`,
          aggregateType: 'visit',
          aggregateId: visit.id,
          payload: { visitId: visit.id },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'visit',
          entityId: visit.id,
          action: 'CREATE',
          changedFields: ['leadId', 'propertyId', 'startAt', 'endAt'],
          requestId,
        });
        return visit;
      } catch (error) {
        this.throwIfScheduleConflict(error);
        throw error;
      }
    });
  }

  async list(brokerId: string, query: ListVisitsQueryDto) {
    const scope = `visits:${brokerId}:${query.status ?? ''}:${query.from ?? ''}:${query.to ?? ''}`;
    const position = decodeCursor(query.cursor, scope);
    const items = await this.prisma.visit.findMany({
      where: {
        brokerId,
        status: query.status,
        startAt:
          query.from || query.to
            ? {
                gte: query.from ? new Date(query.from) : undefined,
                lt: query.to ? new Date(query.to) : undefined,
              }
            : undefined,
        ...cursorWhere(position, 'startAt'),
      },
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        lead: { select: { id: true, name: true } },
        property: { select: { id: true, title: true } },
      },
    });
    return cursorPage(items, query.limit, (item) => item.startAt, scope);
  }

  async get(brokerId: string, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, brokerId },
      include: {
        lead: { select: { id: true, name: true } },
        property: {
          select: { id: true, title: true, address: true, neighborhood: true },
        },
      },
    });
    if (!visit) throw new NotFoundException();
    return visit;
  }

  async reschedule(
    brokerId: string,
    id: string,
    dto: RescheduleVisitDto,
    requestId?: string,
  ) {
    const interval = {
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
    };
    if (!isValidVisitInterval(interval))
      throw new BadRequestException('Visit end must be after start');
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const current = await tx.visit.findFirst({ where: { id, brokerId } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'SCHEDULED')
        throw new ConflictException('Only scheduled visits can be rescheduled');
      try {
        const changed = await tx.visit.updateMany({
          where: { id, brokerId, status: 'SCHEDULED' },
          data: { ...interval, notes: dto.notes, rescheduleReason: dto.reason },
        });
        if (!changed.count)
          throw new ConflictException('Visit status changed concurrently');
        const updated = await tx.visit.findFirstOrThrow({
          where: { id, brokerId },
        });
        await this.workflows.cancelPendingVisitJobs(tx, id);
        await this.workflows.scheduleVisitReminder(tx, updated);
        await this.workflows.enqueue(tx, {
          type: 'CALENDAR_SYNC',
          idempotencyKey: `calendar:${updated.id}:${updated.startAt.toISOString()}:${updated.status}`,
          aggregateType: 'visit',
          aggregateId: updated.id,
          payload: { visitId: updated.id },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'visit',
          entityId: id,
          action: 'UPDATE',
          changedFields: ['startAt', 'endAt'],
          requestId,
        });
        return updated;
      } catch (error) {
        this.throwIfScheduleConflict(error);
        throw error;
      }
    });
  }

  async cancel(
    brokerId: string,
    id: string,
    requestId?: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const current = await tx.visit.findFirst({ where: { id, brokerId } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'SCHEDULED')
        throw new ConflictException('Only scheduled visits can be canceled');
      const canceledAt = new Date();
      const changed = await tx.visit.updateMany({
        where: { id, brokerId, status: 'SCHEDULED' },
        data: {
          status: 'CANCELED',
          canceledAt,
          canceledById: brokerId,
          cancellationReason: reason,
        },
      });
      if (!changed.count)
        throw new ConflictException('Visit status changed concurrently');
      const visit = await tx.visit.findFirstOrThrow({
        where: { id, brokerId },
      });
      await this.workflows.cancelPendingVisitJobs(tx, id);
      await this.workflows.enqueue(tx, {
        type: 'CALENDAR_SYNC',
        idempotencyKey: `calendar:${visit.id}:${visit.startAt.toISOString()}:${visit.status}`,
        aggregateType: 'visit',
        aggregateId: visit.id,
        payload: { visitId: visit.id },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'visit',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['status', 'canceledAt', 'canceledById'],
        requestId,
      });
      return visit;
    });
  }

  async complete(
    brokerId: string,
    id: string,
    requestId?: string,
    dto: CompleteVisitDto = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const current = await tx.visit.findFirst({ where: { id, brokerId } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'SCHEDULED')
        throw new ConflictException('Only scheduled visits can be completed');
      const changed = await tx.visit.updateMany({
        where: { id, brokerId, status: 'SCHEDULED' },
        data: {
          status: 'COMPLETED',
          feedback: (dto.feedback ?? current.feedbackDraft ?? undefined) as
            Prisma.InputJsonValue | undefined,
          feedbackDraft: Prisma.DbNull,
        },
      });
      if (!changed.count)
        throw new ConflictException('Visit status changed concurrently');
      const visit = await tx.visit.findFirstOrThrow({
        where: { id, brokerId },
      });
      if (dto.nextStage) {
        const lead = await tx.lead.findFirstOrThrow({
          where: { id: current.leadId, brokerId, deletedAt: null },
        });
        if (!canTransitionLeadStage(lead.stage, dto.nextStage))
          throw new ConflictException('Invalid lead stage transition');
        if (lead.stage !== dto.nextStage) {
          const changedLead = await tx.lead.updateMany({
            where: { id: lead.id, brokerId, stage: lead.stage },
            data: { stage: dto.nextStage },
          });
          if (!changedLead.count)
            throw new ConflictException('Lead stage changed concurrently');
          await tx.leadStageHistory.create({
            data: {
              brokerId,
              leadId: lead.id,
              actorId: brokerId,
              fromStage: lead.stage,
              toStage: dto.nextStage,
            },
          });
        }
      }
      if (dto.task)
        await tx.task.create({
          data: {
            brokerId,
            leadId: current.leadId,
            title: dto.task.title,
            dueAt: new Date(dto.task.dueAt),
          },
        });
      await this.workflows.cancelPendingVisitJobs(tx, id);
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'visit',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['status'],
        requestId,
      });
      return visit;
    });
  }

  async updateVisitState(
    brokerId: string,
    id: string,
    kind: 'check-in' | 'checklist' | 'feedback-draft',
    value: Record<string, unknown> = {},
  ) {
    if (JSON.stringify(value).length > 16000)
      throw new BadRequestException('Visit feedback exceeds limit');
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const visit = await tx.visit.findFirst({ where: { id, brokerId } });
      if (!visit) throw new NotFoundException();
      if (visit.status !== 'SCHEDULED')
        throw new ConflictException('Visit is no longer scheduled');
      const data =
        kind === 'check-in'
          ? { checkedInAt: visit.checkedInAt ?? new Date() }
          : kind === 'checklist'
            ? { checklist: value as Prisma.InputJsonValue }
            : { feedbackDraft: value as Prisma.InputJsonValue };
      const changed = await tx.visit.updateMany({
        where: { id, brokerId, status: 'SCHEDULED' },
        data,
      });
      if (!changed.count)
        throw new ConflictException('Visit status changed concurrently');
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'visit',
        entityId: id,
        action: 'UPDATE',
        changedFields: Object.keys(data),
      });
      return tx.visit.findFirstOrThrow({ where: { id, brokerId } });
    });
  }

  private async requireOwnedEntities(
    tx: Prisma.TransactionClient,
    brokerId: string,
    leadId: string,
    propertyId: string,
  ) {
    const [lead, property] = await Promise.all([
      tx.lead.findFirst({
        where: { id: leadId, brokerId, deletedAt: null },
        select: { id: true },
      }),
      tx.property.findFirst({
        where: { id: propertyId, brokerId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!lead || !property) throw new NotFoundException();
  }

  private throwIfScheduleConflict(error: unknown): void {
    const details = error instanceof Error ? error.message : '';
    if (
      details.includes('calendar_occupancies_no_overlap') ||
      details.includes('visits_no_broker_overlap') ||
      details.includes('23P01') ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2004')
    ) {
      throw new ConflictException(
        'The selected time overlaps another scheduled visit',
      );
    }
  }
}
