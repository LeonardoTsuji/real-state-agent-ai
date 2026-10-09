import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/client.js';
import { SearchLeadsQueryDto, ImportLeadsDto } from './search-leads.dto.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Page } from '../common/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../audit/audit.js';
import { decodeCursor, cursorWhere, cursorPage } from '../common/cursor.js';
import { ChangeLeadStageUseCase } from '../application/use-cases/change-lead-stage.use-case.js';
import {
  LEAD_STAGE_PORT,
  type LeadStagePort,
} from '../application/ports/lead-stage.port.js';
import {
  CreateInteractionDto,
  CreateMatchDto,
  CursorQueryDto,
  PatchLeadPreferenceDto,
  PatchLeadStageDto,
  PatchMatchDto,
} from './crm.dto.js';
import { CreateLeadDto, UpdateLeadDto } from './lead.dto.js';

const leadResponseSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  notes: true,
  stage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
  private readonly changeLeadStage: ChangeLeadStageUseCase;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEAD_STAGE_PORT) stagePort: LeadStagePort,
  ) {
    this.changeLeadStage = new ChangeLeadStageUseCase(stagePort);
  }

  async importRows(
    brokerId: string,
    dto: ImportLeadsDto,
    clientKey?: string,
    requestId?: string,
  ) {
    const input = JSON.parse(JSON.stringify(dto.rows)) as Prisma.InputJsonValue;
    const key = createHash('sha256')
      .update(`${brokerId}:lead-import:${clientKey ?? 'preview'}`)
      .digest('hex');
    const existing = dto.preview
      ? null
      : await this.prisma.leadImportBatch.findUnique({
          where: { idempotencyKey: key },
        });
    if (existing) {
      if (!isDeepStrictEqual(existing.input, input))
        throw new ConflictException(
          'Import key already used for different rows',
        );
      return existing.report;
    }
    const validated = await Promise.all(
      dto.rows.map(async (row, index) => {
        if (typeof row !== 'object' || row === null || Array.isArray(row))
          return {
            line: index + 1,
            dto: null,
            errors: ['Row must be an object'],
          };
        const value = plainToInstance(CreateLeadDto, row);
        const errors = (
          await validate(value, { whitelist: true, forbidNonWhitelisted: true })
        ).flatMap((error) => Object.values(error.constraints ?? {}));
        if (!value.email && !value.phone)
          errors.push('At least one contact is required');
        return { line: index + 1, dto: value, errors };
      }),
    );
    return this.prisma.$transaction(async (tx) => {
      if (!dto.preview) {
        await tx.$queryRaw(
          Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
        );
        const replay = await tx.leadImportBatch.findUnique({
          where: { idempotencyKey: key },
        });
        if (replay) {
          if (!isDeepStrictEqual(replay.input, input))
            throw new ConflictException(
              'Import key already used for different rows',
            );
          return replay.report;
        }
        await tx.leadImportBatch.create({
          data: { brokerId, idempotencyKey: key, input },
        });
      }
      const items: Array<{
        line: number;
        status: string;
        id?: string;
        errors?: string[];
      }> = [];
      for (const row of validated) {
        if (!row.dto || row.errors.length) {
          items.push({ line: row.line, status: 'INVALID', errors: row.errors });
          continue;
        }
        if (dto.preview) {
          items.push({ line: row.line, status: 'VALID' });
          continue;
        }
        const lead = await tx.lead.create({ data: { ...row.dto, brokerId } });
        await tx.leadStageHistory.create({
          data: {
            brokerId,
            leadId: lead.id,
            actorId: brokerId,
            toStage: 'NEW',
          },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead',
          entityId: lead.id,
          action: 'CREATE',
          changedFields: ['import'],
          requestId,
        });
        items.push({ line: row.line, status: 'CREATED', id: lead.id });
      }
      const report = {
        items,
        total: items.length,
        created: items.filter((i) => i.status === 'CREATED').length,
        failed: items.filter((i) => i.status === 'INVALID').length,
        preview: !!dto.preview,
      };
      if (!dto.preview)
        await tx.leadImportBatch.update({
          where: { idempotencyKey: key },
          data: { report },
        });
      return report;
    });
  }

  async create(brokerId: string, dto: CreateLeadDto, requestId?: string) {
    this.assertHasContact(dto.email, dto.phone);
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: { ...dto, brokerId },
        select: leadResponseSelect,
      });
      await tx.leadStageHistory.create({
        data: {
          brokerId,
          leadId: lead.id,
          actorId: brokerId,
          fromStage: null,
          toStage: 'NEW',
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead',
        entityId: lead.id,
        action: 'CREATE',
        changedFields: ['name', 'email', 'phone', 'notes'],
        requestId,
      });
      return lead;
    });
  }

  async list(
    brokerId: string,
    query: SearchLeadsQueryDto,
  ): Promise<Page<unknown>> {
    if (
      query.minPriceCents != null &&
      query.maxPriceCents != null &&
      query.minPriceCents > query.maxPriceCents
    )
      throw new BadRequestException('Invalid budget range');
    if (
      query.lastInteractionFrom &&
      query.lastInteractionTo &&
      new Date(query.lastInteractionFrom) > new Date(query.lastInteractionTo)
    )
      throw new BadRequestException('Invalid interaction range');
    const interactionRange =
      query.lastInteractionFrom || query.lastInteractionTo
        ? {
            gte: query.lastInteractionFrom
              ? new Date(query.lastInteractionFrom)
              : undefined,
            lte: query.lastInteractionTo
              ? new Date(query.lastInteractionTo)
              : undefined,
          }
        : undefined;
    const lastInteractions = interactionRange
      ? await this.prisma.interaction.groupBy({
          by: ['leadId'],
          where: { brokerId },
          _max: { occurredAt: true },
          having: { occurredAt: { _max: interactionRange } },
        })
      : undefined;
    const where: Prisma.LeadWhereInput = {
      brokerId,
      deletedAt: null,
      stage: query.stage,
      ...(query.q
        ? {
            OR: ['name', 'email', 'phone'].map((field) => ({
              [field]: { contains: query.q!.trim(), mode: 'insensitive' },
            })),
          }
        : {}),
      ...(query.minPriceCents != null || query.maxPriceCents != null
        ? {
            preference: {
              is: {
                maxPriceCents: {
                  gte: query.minPriceCents,
                  lte: query.maxPriceCents,
                },
              },
            },
          }
        : {}),
      ...(lastInteractions
        ? { id: { in: lastInteractions.map((item) => item.leadId) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          ...leadResponseSelect,
          preference: true,
          interactions: {
            take: 1,
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items: items.map(({ interactions, ...lead }) => ({
        ...lead,
        lastInteraction: interactions[0] ?? null,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async get(brokerId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, brokerId, deletedAt: null },
      select: leadResponseSelect,
    });
    if (!lead) throw new NotFoundException();
    return lead;
  }

  async update(
    brokerId: string,
    id: string,
    dto: UpdateLeadDto,
    requestId?: string,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    const current = await this.prisma.lead.findFirst({
      where: { id, brokerId, deletedAt: null },
    });
    if (!current) throw new NotFoundException();
    const email = dto.email !== undefined ? dto.email : current.email;
    const phone = dto.phone !== undefined ? dto.phone : current.phone;
    this.assertHasContact(email, phone);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.lead.update({
          where: { id, brokerId, deletedAt: null },
          data: dto,
          select: leadResponseSelect,
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead',
          entityId: id,
          action: 'UPDATE',
          changedFields: Object.keys(dto),
          requestId,
        });
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  async remove(
    brokerId: string,
    id: string,
    requestId?: string,
  ): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.lead.updateMany({
        where: { id, brokerId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (deleted.count > 0)
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead',
          entityId: id,
          action: 'DELETE',
          changedFields: ['deletedAt'],
          requestId,
        });
      return deleted;
    });
    if (result.count === 0) throw new NotFoundException();
  }

  async patchPreference(
    brokerId: string,
    leadId: string,
    dto: PatchLeadPreferenceDto,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireLead(tx, brokerId, leadId);
      const current = await tx.leadPreference.findUnique({ where: { leadId } });
      const next: Record<string, unknown> = { ...current };
      for (const [field, value] of Object.entries(dto)) {
        if (value !== undefined) next[field] = value;
      }
      for (const [min, max] of [
        ['minPriceCents', 'maxPriceCents'],
        ['minBedrooms', 'maxBedrooms'],
        ['minParkingSpaces', 'maxParkingSpaces'],
      ] as const) {
        const minValue = next[min];
        const maxValue = next[max];
        if (
          typeof minValue === 'number' &&
          typeof maxValue === 'number' &&
          minValue > maxValue
        ) {
          throw new BadRequestException(`${min} cannot exceed ${max}`);
        }
      }
      const preference = await tx.leadPreference.upsert({
        where: { leadId },
        create: {
          brokerId,
          leadId,
          purposes: dto.purposes ?? [],
          types: dto.types ?? [],
          neighborhoods: dto.neighborhoods ?? [],
          notes: dto.notes,
          minPriceCents: dto.minPriceCents,
          maxPriceCents: dto.maxPriceCents,
          minBedrooms: dto.minBedrooms,
          maxBedrooms: dto.maxBedrooms,
          minParkingSpaces: dto.minParkingSpaces,
          maxParkingSpaces: dto.maxParkingSpaces,
        },
        update: dto,
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead_preference',
        entityId: preference.id,
        action: current ? 'UPDATE' : 'CREATE',
        changedFields: Object.keys(dto),
        requestId,
      });
      return preference;
    });
  }

  async getPreference(brokerId: string, leadId: string) {
    await this.requireLead(this.prisma, brokerId, leadId);
    return this.prisma.leadPreference.findUnique({ where: { leadId } });
  }

  async createMatch(
    brokerId: string,
    leadId: string,
    dto: CreateMatchDto,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireLead(tx, brokerId, leadId);
      const propertyId = dto.propertyId;
      const status = dto.status ?? 'SUGGESTED';
      if (status !== 'REJECTED' && dto.rejectionReason != null) {
        throw new BadRequestException(
          'Only rejected matches may include a reason',
        );
      }
      const property = await tx.property.findFirst({
        where: { id: propertyId, brokerId, deletedAt: null },
        select: { id: true },
      });
      if (!property) throw new NotFoundException();
      try {
        const match = await tx.leadPropertyMatch.create({
          data: {
            brokerId,
            leadId,
            propertyId,
            score: dto.score,
            status,
            rejectionReason: status === 'REJECTED' ? dto.rejectionReason : null,
          },
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead_property_match',
          entityId: match.id,
          action: 'CREATE',
          changedFields: ['score', 'status', 'rejectionReason'],
          requestId,
        });
        return match;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'This lead and property are already associated',
          );
        }
        throw error;
      }
    });
  }

  async listMatches(brokerId: string, leadId: string, query: CursorQueryDto) {
    await this.requireLead(this.prisma, brokerId, leadId);
    const scope = `matches:${brokerId}:${leadId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const items = await this.prisma.leadPropertyMatch.findMany({
      where: { brokerId, leadId, ...cursorWhere(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        property: {
          select: {
            id: true,
            title: true,
            priceCents: true,
            neighborhood: true,
          },
        },
      },
    });
    return cursorPage(items, query.limit, (item) => item.createdAt, scope);
  }

  async updateMatch(
    brokerId: string,
    leadId: string,
    propertyId: string,
    dto: PatchMatchDto,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.leadPropertyMatch.findFirst({
        where: { brokerId, leadId, propertyId },
      });
      if (!current) throw new NotFoundException();
      const status = dto.status ?? current.status;
      const reason =
        dto.rejectionReason === undefined
          ? current.rejectionReason
          : dto.rejectionReason;
      if (status !== 'REJECTED' && dto.rejectionReason != null)
        throw new BadRequestException(
          'Only rejected matches may include a reason',
        );
      const updated = await tx.leadPropertyMatch.update({
        where: { id: current.id },
        data: {
          ...dto,
          rejectionReason: status === 'REJECTED' ? reason : null,
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead_property_match',
        entityId: current.id,
        action: 'UPDATE',
        changedFields: [
          ...new Set([
            ...Object.keys(dto),
            ...(status !== 'REJECTED' && current.rejectionReason
              ? ['rejectionReason']
              : []),
          ]),
        ],
        requestId,
      });
      return updated;
    });
  }

  async createInteraction(
    brokerId: string,
    leadId: string,
    dto: CreateInteractionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireLead(tx, brokerId, leadId);
      return tx.interaction.create({
        data: {
          brokerId,
          leadId,
          ...dto,
          occurredAt: new Date(dto.occurredAt),
        },
      });
    });
  }

  async listInteractions(
    brokerId: string,
    leadId: string,
    query: CursorQueryDto,
  ) {
    await this.requireLead(this.prisma, brokerId, leadId);
    const scope = `interactions:${brokerId}:${leadId}`;
    const cursor = decodeCursor(query.cursor, scope);
    const items = await this.prisma.interaction.findMany({
      where: { brokerId, leadId, ...cursorWhere(cursor, 'occurredAt') },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(items, query.limit, (item) => item.occurredAt, scope);
  }

  async updateStage(
    brokerId: string,
    leadId: string,
    dto: PatchLeadStageDto,
    requestId?: string,
  ) {
    const result = await this.changeLeadStage.execute({
      brokerId,
      leadId,
      stage: dto.stage,
      requestId,
    });
    if (result.kind === 'not-found') throw new NotFoundException();
    if (result.kind === 'invalid-transition') {
      throw new BadRequestException(
        `Transition ${result.from} -> ${result.to} is not allowed`,
      );
    }
    if (result.kind === 'conflict')
      throw new ConflictException('Lead stage changed concurrently');
    if (result.kind === 'unchanged') return this.get(brokerId, leadId);
    return {
      id: leadId,
      stage: result.stage,
      stageHistoryId: result.historyId,
    };
  }

  async funnel(brokerId: string) {
    const counts = await this.prisma.lead.groupBy({
      by: ['stage'],
      where: { brokerId, deletedAt: null },
      _count: { _all: true },
    });
    const values = new Map(
      counts.map((item) => [item.stage, item._count._all]),
    );
    return [
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'VISIT_SCHEDULED',
      'NEGOTIATION',
      'WON',
      'LOST',
    ].map((stage) => ({
      stage,
      count: values.get(stage as (typeof counts)[number]['stage']) ?? 0,
    }));
  }

  private async requireLead(
    tx: Prisma.TransactionClient | PrismaService,
    brokerId: string,
    leadId: string,
  ) {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException();
    return lead;
  }

  private assertHasContact(
    email: string | null | undefined,
    phone: string | null | undefined,
  ): void {
    if (!email && !phone) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'A lead must have an email address or phone number',
        details: [
          { field: 'email,phone', message: 'At least one contact is required' },
        ],
      });
    }
  }
}
