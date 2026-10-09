import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { createHash } from 'node:crypto';
import { Prisma } from '../prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentCorrelationId } from '../shared/http/correlation-context.js';
import { writeAudit } from '../audit/audit.js';

const QUEUE = process.env.WORKFLOW_QUEUE_NAME ?? 'real-state-workflows';
type JobPayload = { jobId: string; version: number };
type ImportRow = Record<string, unknown>;

@Injectable()
export class AsyncWorkflowsService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<JobPayload>;
  private worker?: Worker<JobPayload>;
  private dispatcher?: NodeJS.Timeout;
  private dispatching = false;
  private readonly connection: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: number;
    tls?: object;
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = new URL(this.config.getOrThrow<string>('REDIS_URL'));
    this.connection = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      db:
        redisUrl.pathname.length > 1
          ? Number(redisUrl.pathname.slice(1))
          : undefined,
      tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    };
  }

  async onModuleInit() {
    this.queue = new Queue<JobPayload>(QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.config.get<number>('QUEUE_MAX_ATTEMPTS', 5),
        backoff: {
          type: 'exponential',
          delay: this.config.get<number>('QUEUE_RETRY_DELAY_MS', 1000),
          jitter: 0.5,
        },
        removeOnComplete: { age: 7 * 24 * 3600, count: 10000 },
        removeOnFail: false,
      },
    });
    const processRole = this.config.get<string>('PROCESS_ROLE', 'all');
    if (processRole !== 'api') {
      this.worker = new Worker<JobPayload>(QUEUE, (job) => this.process(job), {
        connection: this.connection,
        concurrency: this.config.get<number>('QUEUE_CONCURRENCY', 5),
        limiter: {
          max: this.config.get<number>('QUEUE_RATE_MAX', 30),
          duration: this.config.get<number>('QUEUE_RATE_DURATION_MS', 1000),
        },
      });
    }
    this.queue.on('error', () => this.writeLog('warn', 'queue_unavailable'));
    this.worker?.on('error', () => this.writeLog('warn', 'worker_unavailable'));
    this.worker?.on('failed', (job, error) => {
      if (job) void this.recordFailure(job, error);
    });
    this.dispatcher = setInterval(() => void this.dispatchOutbox(), 1000);
    this.dispatcher.unref();
    await this.dispatchOutbox();
  }

  async onModuleDestroy() {
    if (this.dispatcher) clearInterval(this.dispatcher);
    await this.worker?.close();
    await this.queue?.close();
  }

  async checkQueueReady(): Promise<void> {
    if (!this.queue) throw new Error('Queue has not initialized');
    await this.withTimeout(
      this.queue.client.then((client) =>
        (client as unknown as { ping: () => Promise<string> }).ping(),
      ),
      2_000,
    );
  }

  private writeLog(
    level: 'info' | 'warn' | 'error',
    event: string,
    fields = {},
  ) {
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'workflow-worker', event, ...fields })}\n`,
    );
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    input: {
      type: string;
      idempotencyKey: string;
      aggregateType: string;
      aggregateId: string;
      payload: Prisma.InputJsonValue;
      runAt?: Date;
    },
  ) {
    const previous = await tx.asyncJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (previous) return previous;
    const job = await tx.asyncJob.create({
      data: {
        type: input.type,
        payloadVersion: 1,
        idempotencyKey: input.idempotencyKey,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        correlationId: currentCorrelationId() ?? null,
        runAt: input.runAt ?? new Date(),
        maxAttempts: this.config.get<number>('QUEUE_MAX_ATTEMPTS', 5),
      },
    });
    await tx.outboxEvent.create({ data: { jobId: job.id } });
    return job;
  }

  async listJobs(limit = 50) {
    return this.prisma.asyncJob.findMany({
      take: Math.min(limit, 100),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextRetryAt: true,
        failureCode: true,
        failureMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.asyncJob.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextRetryAt: true,
        failureCode: true,
        failureMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    if (!job) throw new NotFoundException();
    return job;
  }

  async replay(id: string) {
    const current = await this.prisma.asyncJob.findUnique({ where: { id } });
    if (!current) throw new NotFoundException();
    if (current.status !== 'FAILED')
      throw new BadRequestException('Only failed jobs can be replayed');
    const queued = await this.queue?.getJob(id);
    if (queued) await queued.remove();
    await this.prisma.$transaction(async (tx) => {
      if (current.type === 'SEND_MESSAGE') {
        await tx.message.updateMany({
          where: {
            id: current.aggregateId,
            jobId: current.id,
            status: 'FAILED',
          },
          data: { status: 'QUEUED', failureMessage: null },
        });
      }
      await tx.asyncJob.update({
        where: { id },
        data: {
          status: 'WAITING',
          attempts: 0,
          failureCode: null,
          failureMessage: null,
          finishedAt: null,
          nextRetryAt: null,
          runAt: new Date(),
        },
      });
      await tx.outboxEvent.upsert({
        where: { jobId: id },
        create: { jobId: id },
        update: { status: 'PENDING', leaseUntil: null, publishedAt: null },
      });
    });
    return this.getJob(id);
  }

  async metrics() {
    return this.prisma
      .$queryRaw<
        Array<{
          type: string;
          status: string;
          count: bigint;
          attempts: bigint;
          average_duration_ms: number | null;
        }>
      >(
        Prisma.sql`
      SELECT type, status, count(*) AS count,
        coalesce(sum(attempts), 0) AS attempts,
        (avg(extract(epoch FROM (finished_at - started_at)) * 1000)
          FILTER (WHERE finished_at IS NOT NULL AND started_at IS NOT NULL))::double precision AS average_duration_ms
      FROM async_jobs GROUP BY type, status ORDER BY type, status
    `,
      )
      .then((rows) =>
        rows.map((row) => ({
          queue: QUEUE,
          type: row.type,
          status: row.status,
          count: Number(row.count),
          attempts: Number(row.attempts),
          averageDurationMs: row.average_duration_ms,
        })),
      );
  }

  async aiMetrics() {
    return this.prisma
      .$queryRaw<
        Array<{
          tool_name: string;
          status: string;
          result_code: string | null;
          model_version: string | null;
          prompt_version: string | null;
          calls: bigint;
          tokens: bigint;
          average_duration_ms: number | null;
        }>
      >(
        Prisma.sql`
        SELECT tool_name, status, result_code, model_version, prompt_version,
          count(*) AS calls, coalesce(sum(token_count), 0) AS tokens,
          avg(duration_ms)::double precision AS average_duration_ms
        FROM tool_executions
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY tool_name, status, result_code, model_version, prompt_version
        ORDER BY tool_name, status, result_code, model_version, prompt_version
      `,
      )
      .then((rows) =>
        rows.map((row) => ({
          operation: row.tool_name,
          status: row.status,
          resultCode: row.result_code,
          modelVersion: row.model_version,
          promptVersion: row.prompt_version,
          calls: Number(row.calls),
          tokens: Number(row.tokens),
          averageDurationMs: row.average_duration_ms,
        })),
      );
  }

  async createFollowUp(
    brokerId: string,
    input: {
      idempotencyKey: string;
      leadId: string;
      title: string;
      dueAt: string;
      timezone: string;
    },
  ) {
    if (input.idempotencyKey.length > 500)
      throw new BadRequestException('Idempotency key is too long');
    this.validateTimezone(input.timezone);
    const dueAt = new Date(input.dueAt);
    if (!Number.isFinite(dueAt.getTime()))
      throw new BadRequestException('Invalid dueAt');
    return this.prisma.$transaction(async (tx) => {
      const commandHash = createHash('sha256')
        .update(input.idempotencyKey.trim())
        .digest('hex');
      const idempotencyKey = `follow-up:${brokerId}:${commandHash}`;
      const previous = await tx.followUp.findUnique({
        where: { idempotencyKey },
      });
      if (previous) return previous;
      const lead = await tx.lead.findFirst({
        where: { id: input.leadId, brokerId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException();
      const followUp = await tx.followUp.create({
        data: {
          brokerId,
          leadId: input.leadId,
          title: input.title,
          idempotencyKey,
          dueAt,
          timezone: input.timezone,
        },
      });
      const job = await this.enqueue(tx, {
        type: 'FOLLOW_UP',
        idempotencyKey: `follow-up:${followUp.id}:v1`,
        aggregateType: 'follow-up',
        aggregateId: followUp.id,
        payload: { followUpId: followUp.id },
        runAt: this.nextBusinessTime(dueAt, input.timezone),
      });
      await tx.followUp.update({
        where: { id: followUp.id },
        data: { jobId: job.id },
      });
      return followUp;
    });
  }

  async changeFollowUp(
    brokerId: string,
    id: string,
    status: 'COMPLETED' | 'CANCELED',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.followUp.findFirst({ where: { id, brokerId } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'SCHEDULED') return current;
      const updated = await tx.followUp.update({
        where: { id },
        data: { status },
      });
      if (current.jobId)
        await tx.asyncJob.updateMany({
          where: { id: current.jobId, status: 'WAITING' },
          data: { status: 'CANCELED', finishedAt: new Date() },
        });
      return updated;
    });
  }

  async createImport(brokerId: string, key: string, rows: ImportRow[]) {
    if (!rows.length || rows.length > 1000)
      throw new BadRequestException('Import must contain 1 to 1000 rows');
    if (key.length > 500)
      throw new BadRequestException('Idempotency key is too long');
    const commandKey = createHash('sha256').update(key.trim()).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.propertyImportBatch.findUnique({
        where: { idempotencyKey: `${brokerId}:${commandKey}` },
      });
      if (existing) return existing;
      const batch = await tx.propertyImportBatch.create({
        data: {
          brokerId,
          idempotencyKey: `${brokerId}:${commandKey}`,
          input: rows as Prisma.InputJsonValue,
        },
      });
      const job = await this.enqueue(tx, {
        type: 'PROPERTY_IMPORT',
        idempotencyKey: `property-import:${brokerId}:${commandKey}`,
        aggregateType: 'property-import',
        aggregateId: batch.id,
        payload: { batchId: batch.id },
      });
      await tx.propertyImportBatch.update({
        where: { id: batch.id },
        data: { jobId: job.id },
      });
      return batch;
    });
  }

  async getImport(brokerId: string, id: string) {
    const batch = await this.prisma.propertyImportBatch.findFirst({
      where: { id, brokerId },
    });
    if (!batch) throw new NotFoundException();
    return batch;
  }

  async createMessage(
    brokerId: string,
    leadId: string,
    key: string,
    body: string,
  ) {
    if (key.length > 500)
      throw new BadRequestException('Idempotency key is too long');
    const commandKey = createHash('sha256').update(key.trim()).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      return this.createMessageInTransaction(
        tx,
        brokerId,
        leadId,
        commandKey,
        body,
      );
    });
  }

  async createMessageInTransaction(
    tx: Prisma.TransactionClient,
    brokerId: string,
    leadId: string,
    commandKey: string,
    body: string,
  ) {
    const prior = await tx.message.findUnique({
      where: { idempotencyKey: `${brokerId}:${commandKey}` },
    });
    if (prior) return prior;
    const lead = await tx.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException();
    let conversation = await tx.conversation.findFirst({
      where: { brokerId, leadId },
    });
    if (!conversation)
      conversation = await tx.conversation.create({
        data: { brokerId, leadId },
      });
    const message = await tx.message.create({
      data: {
        brokerId,
        conversationId: conversation.id,
        idempotencyKey: `${brokerId}:${commandKey}`,
        body,
      },
    });
    const job = await this.enqueue(tx, {
      type: 'SEND_MESSAGE',
      idempotencyKey: `send-message:${brokerId}:${commandKey}`,
      aggregateType: 'message',
      aggregateId: message.id,
      payload: { messageId: message.id },
    });
    await tx.message.update({
      where: { id: message.id },
      data: { jobId: job.id },
    });
    return message;
  }

  async listMessages(brokerId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) {
      await this.prisma.$transaction((tx) =>
        writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'lead',
          entityId: leadId,
          action: 'ACCESS_DENIED',
          changedFields: ['authorization'],
          requestId: currentCorrelationId(),
        }),
      );
      throw new NotFoundException();
    }
    await this.prisma.$transaction((tx) =>
      writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead',
        entityId: leadId,
        action: 'READ_CONTENT',
        changedFields: ['messages.body'],
        requestId: currentCorrelationId(),
      }),
    );
    return this.prisma.message.findMany({
      where: { brokerId, conversation: { leadId } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async scheduleCalendar(brokerId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, brokerId },
    });
    if (!visit) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) =>
      this.enqueue(tx, {
        type: 'CALENDAR_SYNC',
        idempotencyKey: `calendar:${visitId}:${visit.startAt.toISOString()}:${visit.status}`,
        aggregateType: 'visit',
        aggregateId: visitId,
        payload: { visitId },
        runAt: new Date(),
      }),
    );
  }

  async calendarEvent(brokerId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, brokerId },
      select: { id: true },
    });
    if (!visit) throw new NotFoundException();
    return this.prisma.simulatedCalendarEvent.findUnique({
      where: { idempotencyKey: `calendar:${visitId}` },
    });
  }

  private async dispatchOutbox() {
    if (this.dispatching || !this.queue) return;
    this.dispatching = true;
    try {
      const events = await this.prisma.$queryRaw<
        Array<{ id: string; job_id: string }>
      >(Prisma.sql`
        WITH candidates AS (
          SELECT id FROM outbox_events
          WHERE status = 'PENDING' AND (lease_until IS NULL OR lease_until < now())
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 50
        )
        UPDATE outbox_events AS event
        SET lease_until = now() + interval '30 seconds', attempts = attempts + 1
        FROM candidates WHERE event.id = candidates.id
        RETURNING event.id, event.job_id
      `);
      for (const event of events) {
        try {
          const job = await this.prisma.asyncJob.findUnique({
            where: { id: event.job_id },
          });
          if (!job || job.status === 'CANCELED') {
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'CANCELED', leaseUntil: null },
            });
            continue;
          }
          await this.queue.add(
            job.type,
            { jobId: job.id, version: job.payloadVersion },
            {
              jobId: job.id,
              delay: Math.max(0, job.runAt.getTime() - Date.now()),
              attempts: job.maxAttempts,
            },
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              leaseUntil: null,
              lastError: null,
            },
          });
        } catch {
          await this.prisma.outboxEvent
            .update({
              where: { id: event.id },
              data: { leaseUntil: null, lastError: 'REDIS_UNAVAILABLE' },
            })
            .catch(() => undefined);
        }
      }
    } catch {
      // A later tick retries the durable outbox row; database and Redis details are not logged.
    } finally {
      this.dispatching = false;
    }
  }

  private async process(job: Job<JobPayload>) {
    const record = await this.prisma.asyncJob.findUnique({
      where: { id: job.data.jobId },
    });
    if (!record) throw new UnrecoverableError('Job record not found');
    if (job.data.version !== 1 || record.payloadVersion !== job.data.version)
      throw new UnrecoverableError('Unsupported payload version');
    if (
      record.status === 'CANCELED' ||
      record.status === 'COMPLETED' ||
      record.failureCode === 'SIMULATED_DELIVERY_FAILED'
    )
      return;
    const payload = record.payload as Record<string, string>;
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'workflow-worker', event: 'job_started', jobId: record.id, type: record.type, correlationId: record.correlationId ?? undefined })}\n`,
    );
    const claimed = await this.prisma.asyncJob.updateMany({
      where: {
        id: record.id,
        OR: [
          { failureCode: null },
          { failureCode: { not: 'SIMULATED_DELIVERY_FAILED' } },
        ],
      },
      data: {
        status: 'ACTIVE',
        attempts: job.attemptsMade + 1,
        startedAt: new Date(),
      },
    });
    if (!claimed.count) return;
    try {
      await this.withTimeout(
        this.execute(record.type, payload, record.id),
        this.config.get<number>('QUEUE_JOB_TIMEOUT_MS', 15000),
      );
      await this.prisma.asyncJob.updateMany({
        where: { id: record.id, status: 'ACTIVE' },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          nextRetryAt: null,
          failureCode: null,
          failureMessage: null,
        },
      });
      process.stdout.write(
        `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'workflow-worker', event: 'job_completed', jobId: record.id, type: record.type, correlationId: record.correlationId ?? undefined })}\n`,
      );
    } catch (error) {
      if (error instanceof UnrecoverableError) throw error;
      throw error;
    }
  }

  private async execute(
    type: string,
    payload: Record<string, string>,
    jobId: string,
  ) {
    if (type === 'VISIT_REMINDER') {
      const visit = await this.prisma.visit.findUnique({
        where: { id: payload.visitId },
      });
      if (!visit || visit.status !== 'SCHEDULED' || visit.startAt <= new Date())
        return;
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.visit.findUnique({ where: { id: visit.id } });
        if (
          !current ||
          current.status !== 'SCHEDULED' ||
          current.startAt.getTime() !== visit.startAt.getTime() ||
          current.startAt <= new Date()
        )
          return;
        const key = `visit-reminder:${visit.id}:${visit.startAt.toISOString()}`;
        const receipt = await tx.jobReceipt.findUnique({
          where: { idempotencyKey: key },
        });
        if (!receipt) {
          await tx.jobReceipt.create({
            data: { idempotencyKey: key, jobId },
          });
          let conversation = await tx.conversation.findFirst({
            where: { brokerId: visit.brokerId, leadId: visit.leadId },
          });
          if (!conversation) {
            conversation = await tx.conversation.create({
              data: { brokerId: visit.brokerId, leadId: visit.leadId },
            });
          }
          const message = await tx.message.create({
            data: {
              brokerId: visit.brokerId,
              conversationId: conversation.id,
              idempotencyKey: `${visit.brokerId}:${key}`,
              body: 'Lembrete: você tem uma visita agendada em breve.',
            },
          });
          const sendJob = await this.enqueue(tx, {
            type: 'SEND_MESSAGE',
            idempotencyKey: `send-message:${visit.brokerId}:${key}`,
            aggregateType: 'message',
            aggregateId: message.id,
            payload: { messageId: message.id },
          });
          await tx.message.update({
            where: { id: message.id },
            data: { jobId: sendJob.id },
          });
        }
      });
      return;
    }
    if (type === 'FOLLOW_UP') {
      const followUp = await this.prisma.followUp.findUnique({
        where: { id: payload.followUpId },
      });
      if (!followUp || followUp.status !== 'SCHEDULED') return;
      await this.prisma.followUp.updateMany({
        where: { id: followUp.id, status: 'SCHEDULED' },
        data: { executedAt: new Date() },
      });
      return;
    }
    if (type === 'RESERVATION_EXPIRE') {
      const id = this.requirePayload(payload, 'reservationId');
      const reservation = await this.prisma.reservation.findUnique({
        where: { id },
      });
      if (!reservation) return;
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservation.brokerId}, 0))`;
        await tx.reservation.updateMany({
          where: { id, status: 'PENDING', expiresAt: { lte: new Date() } },
          data: { status: 'EXPIRED' },
        });
      });
      return;
    }
    if (type === 'PROPERTY_IMPORT')
      return this.processImport(this.requirePayload(payload, 'batchId'));
    if (type === 'SEND_MESSAGE')
      return this.processMessage(this.requirePayload(payload, 'messageId'));
    if (type === 'CALENDAR_SYNC')
      return this.processCalendar(this.requirePayload(payload, 'visitId'));
    throw new UnrecoverableError('Unsupported job type');
  }

  private async processImport(batchId: string) {
    const batch = await this.prisma.propertyImportBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new UnrecoverableError('Import batch not found');
    if (batch.report) return;
    const rows = batch.input as ImportRow[];
    let accepted = 0;
    const results = await Promise.all(
      rows.map(async (row, index) => {
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        const city = typeof row.city === 'string' ? row.city.trim() : '';
        const neighborhood =
          typeof row.neighborhood === 'string' ? row.neighborhood.trim() : '';
        const purpose =
          row.purpose === 'RENT'
            ? 'RENT'
            : row.purpose === 'SALE'
              ? 'SALE'
              : null;
        const type = ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'].includes(
          String(row.type),
        )
          ? (String(row.type) as 'APARTMENT' | 'HOUSE' | 'LAND' | 'COMMERCIAL')
          : null;
        const priceCents = Number(row.priceCents);
        const bedrooms = Number(row.bedrooms ?? 0);
        const parkingSpaces = Number(row.parkingSpaces ?? 0);
        const errors = [
          !title && 'title is required',
          !city && 'city is required',
          !neighborhood && 'neighborhood is required',
          !purpose && 'purpose must be SALE or RENT',
          !type && 'type is invalid',
          (!Number.isInteger(priceCents) || priceCents <= 0) &&
            'priceCents must be positive',
          (!Number.isInteger(bedrooms) || bedrooms < 0) &&
            'bedrooms must be non-negative',
          (!Number.isInteger(parkingSpaces) || parkingSpaces < 0) &&
            'parkingSpaces must be non-negative',
        ].filter(Boolean);
        if (errors.length)
          return { line: index + 1, accepted: false, reasons: errors };
        const externalKey =
          typeof row.externalKey === 'string' && row.externalKey.trim()
            ? row.externalKey.trim().slice(0, 160)
            : `${batch.id}:${index + 1}`;
        await this.prisma.property.upsert({
          where: {
            brokerId_externalKey: { brokerId: batch.brokerId, externalKey },
          },
          create: {
            brokerId: batch.brokerId,
            externalKey,
            title,
            city,
            neighborhood,
            purpose: purpose!,
            type: type!,
            priceCents,
            bedrooms,
            parkingSpaces,
          },
          update: {
            title,
            city,
            neighborhood,
            purpose: purpose!,
            type: type!,
            priceCents,
            bedrooms,
            parkingSpaces,
          },
        });
        accepted += 1;
        return { line: index + 1, accepted: true, reasons: [] };
      }),
    );
    await this.prisma.propertyImportBatch.update({
      where: { id: batchId },
      data: {
        report: {
          read: rows.length,
          accepted,
          rejected: rows.length - accepted,
          rows: results,
        },
        completedAt: new Date(),
      },
    });
  }

  private async processMessage(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message || message.status !== 'QUEUED') return;
    const mode = this.config.get<string>('SIMULATED_MESSAGING_MODE', 'success');
    if (mode === 'permanent_failure')
      throw new UnrecoverableError('Simulated message delivery failure');
    if (mode === 'timeout') {
      await this.delay(
        this.config.get<number>('QUEUE_JOB_TIMEOUT_MS', 15000) + 1,
      );
      throw new Error('timeout');
    }
    if (mode === 'transient_failure')
      throw new Error('Temporary adapter failure');
    await this.prisma.message.updateMany({
      where: { id: message.id, status: 'QUEUED' },
      data: { status: 'SENT', sentAt: new Date(), failureMessage: null },
    });
  }

  async cancelCalendar(visitId: string) {
    return this.prisma.$transaction(async (tx) =>
      this.enqueue(tx, {
        type: 'CALENDAR_SYNC',
        idempotencyKey: `calendar:${visitId}:cancel`,
        aggregateType: 'visit',
        aggregateId: visitId,
        payload: { visitId },
      }),
    );
  }

  private async processCalendar(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new UnrecoverableError('Visit not found');
    const mode = this.config.get<string>('SIMULATED_CALENDAR_MODE', 'success');
    if (mode === 'permanent_failure')
      throw new UnrecoverableError('Simulated calendar rejection');
    if (mode === 'timeout') {
      await this.delay(
        this.config.get<number>('QUEUE_JOB_TIMEOUT_MS', 15000) + 1,
      );
      throw new Error('timeout');
    }
    if (mode === 'transient_failure')
      throw new Error('Temporary calendar adapter failure');
    await this.prisma.simulatedCalendarEvent.upsert({
      where: { idempotencyKey: `calendar:${visitId}` },
      create: {
        idempotencyKey: `calendar:${visitId}`,
        visitId,
        remoteId: `sim-${visitId}`,
        state: visit.status === 'CANCELED' ? 'CANCELED' : 'RESERVED',
        startAt: visit.startAt,
      },
      update: {
        state: visit.status === 'CANCELED' ? 'CANCELED' : 'RESERVED',
        startAt: visit.startAt,
      },
    });
  }

  scheduleVisitReminder(
    tx: Prisma.TransactionClient,
    visit: { id: string; startAt: Date },
  ) {
    const reminderAt = new Date(visit.startAt.getTime() - 24 * 60 * 60 * 1000);
    return this.enqueue(tx, {
      type: 'VISIT_REMINDER',
      idempotencyKey: `visit-reminder:${visit.id}:${visit.startAt.toISOString()}`,
      aggregateType: 'visit',
      aggregateId: visit.id,
      payload: { visitId: visit.id },
      runAt: reminderAt > new Date() ? reminderAt : new Date(),
    });
  }

  async cancelPendingVisitJobs(tx: Prisma.TransactionClient, visitId: string) {
    const pending = await tx.asyncJob.findMany({
      where: {
        aggregateType: 'visit',
        aggregateId: visitId,
        type: 'VISIT_REMINDER',
        status: 'WAITING',
      },
      select: { id: true },
    });
    if (!pending.length) return;
    await tx.asyncJob.updateMany({
      where: { id: { in: pending.map((job) => job.id) }, status: 'WAITING' },
      data: { status: 'CANCELED', finishedAt: new Date() },
    });
    await tx.outboxEvent.updateMany({
      where: { jobId: { in: pending.map((job) => job.id) }, status: 'PENDING' },
      data: { status: 'CANCELED', leaseUntil: null },
    });
  }

  private async recordFailure(job: Job<JobPayload>, error: Error) {
    const record = await this.prisma.asyncJob
      .findUnique({ where: { id: job.data.jobId } })
      .catch(() => null);
    if (
      !record ||
      record.status === 'CANCELED' ||
      record.failureCode === 'SIMULATED_DELIVERY_FAILED'
    )
      return;
    const permanent =
      error instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    const safeCode =
      error instanceof UnrecoverableError
        ? 'PERMANENT_FAILURE'
        : error.message.includes('timeout')
          ? 'TIMEOUT'
          : 'TRANSIENT_FAILURE';
    await this.prisma.asyncJob
      .update({
        where: { id: record.id },
        data: {
          status: permanent ? 'FAILED' : 'WAITING',
          failureCode: safeCode,
          failureMessage:
            safeCode === 'PERMANENT_FAILURE'
              ? 'Integration permanently rejected the operation'
              : safeCode === 'TIMEOUT'
                ? 'Integration timed out'
                : 'Temporary integration failure',
          nextRetryAt: permanent
            ? null
            : new Date(
                Date.now() + Math.min(60000, 1000 * 2 ** job.attemptsMade),
              ),
          finishedAt: permanent ? new Date() : null,
        },
      })
      .catch(() => undefined);
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: permanent ? 'error' : 'warn',
        service: 'workflow-worker',
        event: 'job_failed',
        jobId: record.id,
        type: record.type,
        correlationId: record.correlationId ?? undefined,
        resultCode: safeCode,
        attempt: job.attemptsMade,
      })}\n`,
    );
    if (permanent && record.type === 'SEND_MESSAGE') {
      const messageId = (record.payload as Record<string, string>).messageId;
      await this.prisma.message
        .updateMany({
          where: { id: messageId, status: 'QUEUED' },
          data: {
            status: 'FAILED',
            failureMessage: 'Delivery failed after retries',
          },
        })
        .catch(() => undefined);
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeout);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private requirePayload(payload: Record<string, string>, key: string): string {
    const value = payload[key];
    if (!value) throw new UnrecoverableError(`Missing ${key} in job payload`);
    return value;
  }

  private validateTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
  }

  private nextBusinessTime(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const hour = Number(values.hour);
    const weekday = values.weekday;
    if (weekday !== 'Sat' && weekday !== 'Sun' && hour >= 9 && hour < 18)
      return date;
    const dayOffset =
      weekday === 'Sat'
        ? 2
        : weekday === 'Sun'
          ? 1
          : weekday === 'Fri' && hour >= 18
            ? 3
            : hour >= 18
              ? 1
              : 0;
    const localDate = new Date(
      Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day) + dayOffset,
        9,
      ),
    );
    const desiredLocalAsUtc = localDate.getTime();
    const localAtDesired = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(desiredLocalAsUtc));
    const localValues = Object.fromEntries(
      localAtDesired.map((part) => [part.type, part.value]),
    );
    const interpretedAsUtc = Date.UTC(
      Number(localValues.year),
      Number(localValues.month) - 1,
      Number(localValues.day),
      Number(localValues.hour) % 24,
      Number(localValues.minute),
      Number(localValues.second),
    );
    let result = desiredLocalAsUtc - (interpretedAsUtc - desiredLocalAsUtc);
    const adjusted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(result));
    const adjustedValues = Object.fromEntries(
      adjusted.map((part) => [part.type, part.value]),
    );
    const adjustedAsUtc = Date.UTC(
      Number(adjustedValues.year),
      Number(adjustedValues.month) - 1,
      Number(adjustedValues.day),
      Number(adjustedValues.hour) % 24,
      Number(adjustedValues.minute),
      Number(adjustedValues.second),
    );
    result -= adjustedAsUtc - desiredLocalAsUtc;
    return new Date(result);
  }
}
