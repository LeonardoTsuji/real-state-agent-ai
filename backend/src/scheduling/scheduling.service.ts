import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma, Reservation } from '../prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AsyncWorkflowsService } from '../integrations/async-workflows.service.js';
import { writeAudit } from '../audit/audit.js';
import { prepareSchedule, scheduleConflict } from './schedule-transaction.js';
import {
  AgendaQueryDto,
  BlockDto,
  ReservationDto,
  ScheduleIntervalDto,
} from './scheduling.dto.js';

export function reservationExpiry(startAt: Date, now = new Date()) {
  return new Date(Math.min(now.getTime() + 45 * 60 * 1000, startAt.getTime()));
}
@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: AsyncWorkflowsService,
  ) {}
  private key(brokerId: string, kind: string, key?: string) {
    if (!key?.trim() || key.length > 120)
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );
    return `${kind}:${brokerId}:${createHash('sha256').update(key.trim()).digest('hex')}`;
  }
  private interval(dto: ScheduleIntervalDto) {
    const startAt = new Date(dto.startAt),
      endAt = new Date(dto.endAt);
    if (!Number.isFinite(startAt.getTime()) || !(endAt > startAt))
      throw new BadRequestException('Invalid interval');
    return { startAt, endAt };
  }
  async agenda(brokerId: string, query: AgendaQueryDto) {
    const interval = this.interval({ startAt: query.from, endAt: query.to });
    if (interval.endAt.getTime() - interval.startAt.getTime() > 93 * 86400000)
      throw new BadRequestException('Maximum agenda range is 93 days');
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const overlap = {
        startAt: { lt: interval.endAt },
        endAt: { gt: interval.startAt },
      };
      const [visits, reservations, blocks] = await Promise.all([
        tx.visit.findMany({
          where: { brokerId, ...overlap },
          include: {
            lead: { select: { id: true, name: true } },
            property: { select: { id: true, title: true, address: true } },
          },
          orderBy: { startAt: 'asc' },
        }),
        tx.reservation.findMany({
          where: { brokerId, ...overlap },
          orderBy: { startAt: 'asc' },
        }),
        tx.calendarBlock.findMany({
          where: { brokerId, ...overlap },
          orderBy: { startAt: 'asc' },
        }),
      ]);
      return {
        visits,
        reservations: await this.enrichReservations(tx, reservations),
        blocks,
      };
    });
  }
  async suggestions(brokerId: string, dto: ScheduleIntervalDto) {
    const interval = this.interval(dto);
    const [leads, properties, visits] = await Promise.all([
      this.prisma.lead.findMany({
        where: { brokerId, deletedAt: null, stage: { notIn: ['WON', 'LOST'] } },
        include: { preference: true },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.property.findMany({
        where: { brokerId, deletedAt: null },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.visit.findMany({
        where: {
          brokerId,
          status: 'SCHEDULED',
          startAt: { gte: interval.endAt },
        },
        take: 50,
        orderBy: { startAt: 'asc' },
      }),
    ]);
    return { leads, properties, visits, simulated: true };
  }
  async listReservations(brokerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const items = await tx.reservation.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return this.enrichReservations(tx, items);
    });
  }
  private async enrichReservations(
    tx: Prisma.TransactionClient,
    items: Reservation[],
  ) {
    if (!items.length) return [];
    const brokerId = items[0]!.brokerId;
    const [leads, properties, messages] = await Promise.all([
      tx.lead.findMany({
        where: { brokerId, id: { in: items.map((item) => item.leadId) } },
        select: { id: true, name: true },
      }),
      tx.property.findMany({
        where: { brokerId, id: { in: items.map((item) => item.propertyId) } },
        select: { id: true, title: true, address: true, neighborhood: true },
      }),
      tx.message.findMany({
        where: {
          brokerId,
          id: {
            in: items.flatMap((item) =>
              item.messageId ? [item.messageId] : [],
            ),
          },
        },
        select: { id: true, status: true },
      }),
    ]);
    const leadMap = new Map(leads.map((item) => [item.id, item]));
    const propertyMap = new Map(properties.map((item) => [item.id, item]));
    const messageMap = new Map(messages.map((item) => [item.id, item.status]));
    return items.map((item) => ({
      ...item,
      lead: leadMap.get(item.leadId) ?? null,
      property: propertyMap.get(item.propertyId) ?? null,
      messageStatus: item.messageId
        ? (messageMap.get(item.messageId) ?? null)
        : null,
    }));
  }

  async reserve(brokerId: string, dto: ReservationDto, key?: string) {
    const idempotencyKey = this.key(brokerId, 'reservation', key);
    const interval = this.interval(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await prepareSchedule(tx, brokerId);
        const previous = await tx.reservation.findUnique({
          where: { idempotencyKey },
        });
        if (previous) return previous;
        if (interval.startAt <= new Date())
          throw new BadRequestException('Reservation must start in the future');
        const [lead, property] = await Promise.all([
          tx.lead.findFirst({
            where: { id: dto.leadId, brokerId, deletedAt: null },
          }),
          tx.property.findFirst({
            where: { id: dto.propertyId, brokerId, deletedAt: null },
          }),
        ]);
        if (!lead || !property) throw new NotFoundException();
        if (dto.strategy === 'RESCHEDULE') {
          if (!dto.visitId)
            throw new BadRequestException('RESCHEDULE requires visitId');
          const visit = await tx.visit.findFirst({
            where: {
              id: dto.visitId,
              brokerId,
              leadId: dto.leadId,
              propertyId: dto.propertyId,
              status: 'SCHEDULED',
            },
          });
          if (!visit) throw new NotFoundException();
        } else if (dto.visitId)
          throw new BadRequestException(
            'ADD_PROPERTY does not accept an existing visit',
          );
        const reservation = await tx.reservation.create({
          data: {
            brokerId,
            leadId: dto.leadId,
            propertyId: dto.propertyId,
            visitId: dto.visitId,
            strategy: dto.strategy,
            ...interval,
            expiresAt: reservationExpiry(interval.startAt),
            idempotencyKey,
          },
        });
        const message = await this.workflows.createMessageInTransaction(
          tx,
          brokerId,
          dto.leadId,
          `reservation-invite:${reservation.id}`,
          dto.message?.trim() ||
            `Convite simulado: visita a ${property.title} em ${interval.startAt.toISOString()}. Confirme antes de ${reservation.expiresAt.toISOString()}.`,
        );
        await this.workflows.enqueue(tx, {
          type: 'RESERVATION_EXPIRE',
          aggregateType: 'reservation',
          aggregateId: reservation.id,
          idempotencyKey: `reservation-expire:${reservation.id}`,
          payload: { reservationId: reservation.id },
          runAt: reservation.expiresAt,
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'reservation',
          entityId: reservation.id,
          action: 'CREATE',
          changedFields: [
            'leadId',
            'propertyId',
            'startAt',
            'endAt',
            'expiresAt',
          ],
        });
        return tx.reservation.update({
          where: { id: reservation.id },
          data: { messageId: message.id },
        });
      });
    } catch (error) {
      scheduleConflict(error);
    }
  }
  async decide(brokerId: string, id: string, confirmed: boolean) {
    try {
      const decided = await this.prisma.$transaction(async (tx) => {
        await prepareSchedule(tx, brokerId);
        const reservation = await tx.reservation.findFirst({
          where: { id, brokerId },
        });
        if (!reservation) throw new NotFoundException();
        if (reservation.status === (confirmed ? 'CONFIRMED' : 'CANCELED'))
          return reservation;
        if (reservation.status === 'EXPIRED') return reservation;
        if (reservation.status !== 'PENDING')
          throw new ConflictException('Reservation is no longer pending');
        await tx.reservation.update({
          where: { id },
          data: { status: confirmed ? 'CONFIRMED' : 'CANCELED' },
        });
        if (!confirmed)
          return tx.reservation.findUniqueOrThrow({ where: { id } });
        const [lead, property] = await Promise.all([
          tx.lead.findFirst({
            where: { id: reservation.leadId, brokerId, deletedAt: null },
          }),
          tx.property.findFirst({
            where: { id: reservation.propertyId, brokerId, deletedAt: null },
          }),
        ]);
        if (!lead || !property) throw new NotFoundException();
        let visit;
        if (reservation.strategy === 'RESCHEDULE') {
          const changed = await tx.visit.updateMany({
            where: { id: reservation.visitId!, brokerId, status: 'SCHEDULED' },
            data: { startAt: reservation.startAt, endAt: reservation.endAt },
          });
          if (!changed.count)
            throw new ConflictException(
              'Original visit is no longer scheduled',
            );
          visit = await tx.visit.findUniqueOrThrow({
            where: { id: reservation.visitId! },
          });
          await this.workflows.cancelPendingVisitJobs(tx, visit.id);
        } else {
          visit = await tx.visit.create({
            data: {
              brokerId,
              leadId: reservation.leadId,
              propertyId: reservation.propertyId,
              startAt: reservation.startAt,
              endAt: reservation.endAt,
              idempotencyKey: `reservation-visit:${id}`,
            },
          });
        }
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
          entityType: 'reservation',
          entityId: id,
          action: 'UPDATE',
          changedFields: ['status', 'visitId'],
        });
        return tx.reservation.update({
          where: { id },
          data: { visitId: visit.id },
        });
      });
      if (decided.status === 'EXPIRED')
        throw new ConflictException('Reservation has expired');
      return decided;
    } catch (error) {
      scheduleConflict(error);
    }
  }
  async simulateEvent(
    brokerId: string,
    id: string,
    event: 'NO_RESPONSE' | 'SEND_FAILED',
  ) {
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const reservation = await tx.reservation.findFirst({
        where: { id, brokerId },
      });
      if (!reservation) throw new NotFoundException();
      if (reservation.status !== 'PENDING')
        throw new ConflictException('Reservation is no longer pending');
      if (event === 'NO_RESPONSE') {
        const updated = await tx.reservation.update({
          where: { id },
          data: { status: 'EXPIRED', expiresAt: new Date() },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'reservation',
          entityId: id,
          action: 'UPDATE',
          changedFields: ['status', 'expiresAt'],
        });
        return { ...updated, simulatedEvent: event };
      }
      const message = reservation.messageId
        ? await tx.message.findFirst({
            where: { id: reservation.messageId, brokerId },
          })
        : null;
      if (!message?.jobId)
        throw new ConflictException('No invitation message is associated');
      await tx.message.update({
        where: { id: message.id },
        data: {
          status: 'FAILED',
          sentAt: null,
          failureMessage: 'Simulated invitation delivery failure',
        },
      });
      await tx.asyncJob.update({
        where: { id: message.jobId },
        data: {
          status: 'FAILED',
          failureCode: 'SIMULATED_DELIVERY_FAILED',
          failureMessage: 'Simulated invitation delivery failure',
          finishedAt: new Date(),
        },
      });
      await tx.outboxEvent.updateMany({
        where: { jobId: message.jobId, status: 'PENDING' },
        data: { status: 'CANCELED', leaseUntil: null },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'reservation',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['message.status'],
      });
      return { ...reservation, simulatedEvent: event, messageStatus: 'FAILED' };
    });
  }

  async block(brokerId: string, dto: BlockDto, key?: string) {
    const idempotencyKey = this.key(brokerId, 'calendar-block', key),
      interval = this.interval(dto);
    if (!dto.title.trim())
      throw new BadRequestException('Block title is required');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await prepareSchedule(tx, brokerId);
        const previous = await tx.calendarBlock.findUnique({
          where: { idempotencyKey },
        });
        if (previous) return previous;
        return tx.calendarBlock.create({
          data: { brokerId, title: dto.title, ...interval, idempotencyKey },
        });
      });
    } catch (error) {
      scheduleConflict(error);
    }
  }
  async removeBlock(brokerId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await prepareSchedule(tx, brokerId);
      const block = await tx.calendarBlock.findFirst({
        where: { id, brokerId },
      });
      if (!block) throw new NotFoundException();
      await tx.calendarBlock.delete({ where: { id } });
      return { id, deleted: true };
    });
  }
}
