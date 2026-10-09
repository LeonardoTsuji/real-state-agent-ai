import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { cursorPage, cursorWhere, decodeCursor } from '../common/cursor.js';
import { writeAudit } from '../audit/audit.js';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskStatusDto,
} from './task.dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(brokerId: string, dto: CreateTaskDto, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: dto.leadId, brokerId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException();
      const task = await tx.task.create({
        data: {
          brokerId,
          leadId: dto.leadId,
          title: dto.title,
          dueAt: new Date(dto.dueAt),
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'task',
        entityId: task.id,
        action: 'CREATE',
        changedFields: ['leadId', 'title', 'dueAt'],
        requestId,
      });
      return task;
    });
  }

  async list(brokerId: string, query: ListTasksQueryDto) {
    const scope = `tasks:${brokerId}:${query.status ?? ''}:${query.leadId ?? ''}`;
    const position = decodeCursor(query.cursor, scope);
    const where = {
      brokerId,
      status: query.status,
      leadId: query.leadId,
      ...cursorWhere(position, 'dueAt', 'gt'),
    };
    const items = await this.prisma.task.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      include: { lead: { select: { id: true, name: true } } },
    });
    return cursorPage(items, query.limit, (item) => item.dueAt, scope);
  }

  async updateStatus(
    brokerId: string,
    id: string,
    dto: UpdateTaskStatusDto,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id, brokerId } });
      if (!task) throw new NotFoundException();
      if (task.status === dto.status) return task;
      if (task.status !== 'PENDING')
        throw new BadRequestException(
          'Completed or canceled tasks are terminal',
        );
      const changed = await tx.task.updateMany({
        where: { id, brokerId, status: 'PENDING' },
        data: { status: dto.status },
      });
      if (!changed.count)
        throw new ConflictException('Task status changed concurrently');
      const updated = await tx.task.findFirstOrThrow({
        where: { id, brokerId },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'task',
        entityId: id,
        action: 'UPDATE',
        changedFields: ['status'],
        requestId,
      });
      return updated;
    });
  }
}
