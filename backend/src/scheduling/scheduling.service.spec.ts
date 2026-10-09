import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AsyncWorkflowsService } from '../integrations/async-workflows.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { reservationExpiry, SchedulingService } from './scheduling.service.js';

describe('reservation expiry', () => {
  it('limits the hold to 45 minutes or the visit start', () => {
    const now = new Date('2030-01-01T10:00:00Z');
    expect(
      reservationExpiry(new Date('2030-01-01T12:00:00Z'), now).toISOString(),
    ).toBe('2030-01-01T10:45:00.000Z');
    expect(
      reservationExpiry(new Date('2030-01-01T10:20:00Z'), now).toISOString(),
    ).toBe('2030-01-01T10:20:00.000Z');
  });
});

// Run after applying migrations to the isolated scheduling_agent_test schema.
const integration =
  process.env.SCHEDULING_TEST_SCHEMA === 'scheduling_agent_test'
    ? describe
    : describe.skip;
integration('shared PostgreSQL calendar occupancy', () => {
  let prisma: PrismaService;
  let scheduling: SchedulingService;
  let visits: VisitsService;
  let brokerId: string, leadId: string, propertyId: string;
  const interval = (hour: number) => ({
    startAt: `2030-06-01T${String(hour).padStart(2, '0')}:00:00Z`,
    endAt: `2030-06-01T${String(hour + 1).padStart(2, '0')}:00:00Z`,
  });
  beforeAll(async () => {
    const connectionString =
      process.env.DATABASE_URL_TEST ??
      'postgresql://copilot:local_only_change_me@localhost:5432/corretor_copilot_test';
    const url = new URL(connectionString);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/corretor_copilot_test'
    )
      throw new Error(
        'Scheduling integration tests require dedicated local test database',
      );
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString },
        { schema: 'scheduling_agent_test' },
      ),
    }) as PrismaService;
    await prisma.$connect();
    const workflows = new AsyncWorkflowsService(
      prisma,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    scheduling = new SchedulingService(prisma, workflows);
    visits = new VisitsService(prisma, workflows);
  });
  beforeEach(async () => {
    const broker = await prisma.broker.create({
      data: {
        email: `${randomUUID()}@test.invalid`,
        name: 'Schedule Test',
        passwordHash: 'test',
      },
    });
    brokerId = broker.id;
    const lead = await prisma.lead.create({
      data: { brokerId, name: 'Juliana', stage: 'QUALIFIED' },
    });
    leadId = lead.id;
    const property = await prisma.property.create({
      data: {
        brokerId,
        title: 'Mirante',
        city: 'São Paulo',
        neighborhood: 'Vila Mariana',
        purpose: 'SALE',
        type: 'APARTMENT',
        priceCents: 62000000,
        bedrooms: 2,
        parkingSpaces: 1,
      },
    });
    propertyId = property.id;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('rejects visits conflicting with blocks and accepts adjacent intervals', async () => {
    await scheduling.block(
      brokerId,
      { ...interval(10), title: 'Pessoal' },
      randomUUID(),
    );
    await expect(
      visits.create(brokerId, { leadId, propertyId, ...interval(10) }),
    ).rejects.toThrow('overlaps');
    await expect(
      visits.create(brokerId, { leadId, propertyId, ...interval(11) }),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });
  });
  it('allows only one winner under concurrent reservation and visit creation', async () => {
    const commands = await Promise.allSettled([
      scheduling.reserve(
        brokerId,
        { leadId, propertyId, ...interval(12), strategy: 'ADD_PROPERTY' },
        randomUUID(),
      ),
      visits.create(brokerId, { leadId, propertyId, ...interval(12) }),
    ]);
    expect(commands.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(commands.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('confirms twice without duplicate visits, and persists invitation plus outbox', async () => {
    const key = randomUUID(),
      dto = {
        leadId,
        propertyId,
        ...interval(13),
        strategy: 'ADD_PROPERTY' as const,
      };
    const reservation = await scheduling.reserve(brokerId, dto, key);
    expect((await scheduling.reserve(brokerId, dto, key)).id).toBe(
      reservation.id,
    );
    expect(reservation.messageId).toBeTruthy();
    expect(
      await prisma.asyncJob.count({
        where: { aggregateId: reservation.messageId! },
      }),
    ).toBe(1);
    const decisions = await Promise.all([
      scheduling.decide(brokerId, reservation.id, true),
      scheduling.decide(brokerId, reservation.id, true),
    ]);
    expect(decisions[0].visitId).toBe(decisions[1].visitId);
    expect(await prisma.visit.count({ where: { brokerId } })).toBe(1);
    expect(await prisma.calendarOccupancy.count({ where: { brokerId } })).toBe(
      1,
    );
  });
  it('expires an old reservation before reusing its time', async () => {
    const reservation = await scheduling.reserve(
      brokerId,
      { leadId, propertyId, ...interval(14), strategy: 'ADD_PROPERTY' },
      randomUUID(),
    );
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await visits.create(brokerId, { leadId, propertyId, ...interval(14) });
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('EXPIRED');
    await expect(
      scheduling.decide(brokerId, reservation.id, true),
    ).rejects.toThrow('expired');
  });
  it('reschedules the original visit when an anticipation is confirmed', async () => {
    const visit = await visits.create(brokerId, {
      leadId,
      propertyId,
      ...interval(17),
    });
    const reservation = await scheduling.reserve(
      brokerId,
      {
        leadId,
        propertyId,
        visitId: visit.id,
        ...interval(15),
        strategy: 'RESCHEDULE',
      },
      randomUUID(),
    );
    const confirmed = await scheduling.decide(brokerId, reservation.id, true);
    expect(confirmed.visitId).toBe(visit.id);
    expect(await prisma.visit.count({ where: { brokerId } })).toBe(1);
    expect((await visits.get(brokerId, visit.id)).startAt.toISOString()).toBe(
      '2030-06-01T15:00:00.000Z',
    );
  });
  it('completes feedback, lead transition and next task atomically', async () => {
    const visit = await visits.create(brokerId, {
      leadId,
      propertyId,
      ...interval(16),
    });
    await visits.updateVisitState(brokerId, visit.id, 'feedback-draft', {
      interest: 'HIGH',
    });
    const completed = await visits.complete(brokerId, visit.id, undefined, {
      nextStage: 'NEGOTIATION',
      task: { title: 'Preparar proposta', dueAt: '2030-06-02T12:00:00Z' },
    });
    expect(completed.feedback).toEqual({ interest: 'HIGH' });
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).stage,
    ).toBe('NEGOTIATION');
    expect(await prisma.task.count({ where: { brokerId } })).toBe(1);
    expect(await prisma.calendarOccupancy.count({ where: { brokerId } })).toBe(
      0,
    );
    await expect(visits.complete(brokerId, visit.id)).rejects.toThrow(
      'Only scheduled',
    );
  });
  it('does not expose or mutate another broker reservation', async () => {
    const reservation = await scheduling.reserve(
      brokerId,
      { leadId, propertyId, ...interval(18), strategy: 'ADD_PROPERTY' },
      randomUUID(),
    );
    await expect(
      scheduling.decide(randomUUID(), reservation.id, true),
    ).rejects.toThrow();
    expect(await scheduling.listReservations(randomUUID())).toHaveLength(0);
  });
});
