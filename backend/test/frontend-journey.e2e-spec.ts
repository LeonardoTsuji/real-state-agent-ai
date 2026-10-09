import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { configureHttpApp } from '../src/http-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type Entity = {
  id: string;
  stage?: string;
  status?: string;
  visitId?: string;
  feedback?: unknown;
  snapshot?: Record<string, unknown>;
};
type Session = { id: string; authorization: string };
const parsed = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

describe('Prototype journey API with real PostgreSQL', () => {
  let app: INestApplication<Server>, prisma: PrismaService;
  let owner: Session, outsider: Session, lead: Entity, property: Entity;
  const interval = {
    startAt: '2030-06-01T14:00:00Z',
    endAt: '2030-06-01T15:00:00Z',
  };
  beforeAll(async () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.DEMO_MODE = 'true';
    process.env.AI_PROVIDER = 'mock';
    process.env.RATE_LIMIT_IP_MAX = '10000';
    process.env.RATE_LIMIT_USER_MAX = '10000';
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureHttpApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  async function session(name: string): Promise<Session> {
    const email = `${randomUUID()}@journey.test`,
      password = 'long-enough-test-password';
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name, email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: parsed<Entity>(registration).id,
      authorization: `Bearer ${parsed<{ accessToken: string }>(login).accessToken}`,
    };
  }
  beforeEach(async () => {
    owner = await session('Marina Costa');
    outsider = await session('Outra carteira');
    lead = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', owner.authorization)
        .send({
          name: 'Juliana Rios',
          email: `${randomUUID()}@lead.test`,
          phone: '11971234567',
        })
        .expect(201),
    );
    property = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/properties')
        .set('Authorization', owner.authorization)
        .send({
          title: 'Cobertura Duplex Moema',
          code: 'MOE-142',
          address: 'Alameda dos Arapanés, 950',
          purpose: 'SALE',
          type: 'APARTMENT',
          subtype: 'PENTHOUSE',
          availability: 'AVAILABLE',
          priceCents: 145000000,
          areaM2: 142,
          city: 'São Paulo',
          neighborhood: 'Moema',
          bedrooms: 3,
          parkingSpaces: 2,
          suites: 2,
          bathrooms: 3,
          amenities: ['Varanda', 'Piscina'],
        })
        .expect(201),
    );
  });
  afterAll(async () => {
    await app?.close();
  });
  async function qualify() {
    for (const stage of ['CONTACTED', 'QUALIFIED'])
      await request(app.getHttpServer())
        .patch(`/api/leads/${lead.id}/stage`)
        .set('Authorization', owner.authorization)
        .send({ stage })
        .expect(200);
  }
  it('completes lead, reservation, visit, proposal, simulated acceptance and receipt', async () => {
    await qualify();
    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/preferences`)
      .set('Authorization', owner.authorization)
      .send({
        maxPriceCents: 150000000,
        minBedrooms: 3,
        neighborhoods: ['Moema'],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/matches`)
      .set('Authorization', owner.authorization)
      .send({ propertyId: property.id, score: 95 })
      .expect(201);
    const initial = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/visits')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', randomUUID())
        .send({ leadId: lead.id, propertyId: property.id, ...interval })
        .expect(201),
    );
    await request(app.getHttpServer())
      .post(`/api/visits/${initial.id}/cancel`)
      .set('Authorization', owner.authorization)
      .send({ reason: 'Imprevisto pessoal, preservar afinidade' })
      .expect(201);
    const reserveDto = {
        leadId: lead.id,
        propertyId: property.id,
        strategy: 'ADD_PROPERTY',
        ...interval,
      },
      reserveKey = randomUUID();
    const reservation = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/scheduling/reservations')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', reserveKey)
        .send(reserveDto)
        .expect(201),
    );
    const duplicateReservation = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/scheduling/reservations')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', reserveKey)
        .send(reserveDto)
        .expect(201),
    );
    expect(duplicateReservation.id).toBe(reservation.id);
    const confirmed = parsed<Entity>(
      await request(app.getHttpServer())
        .post(
          `/api/scheduling/reservations/${reservation.id}/simulate-response`,
        )
        .set('Authorization', owner.authorization)
        .send({ confirmed: true })
        .expect(201),
    );
    const visitId = confirmed.visitId!;
    await request(app.getHttpServer())
      .post(`/api/visits/${visitId}/check-in`)
      .set('Authorization', owner.authorization)
      .send({ mode: 'MANUAL' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/visits/${visitId}/checklist`)
      .set('Authorization', owner.authorization)
      .send({ items: { keys: true, tour: true } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/visits/${visitId}/feedback-draft`)
      .set('Authorization', owner.authorization)
      .send({ feedback: { interest: 'HIGH', objection: 'Valor' } })
      .expect(200);
    const completed = parsed<Entity>(
      await request(app.getHttpServer())
        .post(`/api/visits/${visitId}/complete`)
        .set('Authorization', owner.authorization)
        .send({
          nextStage: 'NEGOTIATION',
          task: { title: 'Preparar proposta', dueAt: '2030-06-02T12:00:00Z' },
        })
        .expect(201),
    );
    expect(completed.feedback).toEqual({
      interest: 'HIGH',
      objection: 'Valor',
    });
    const opportunity = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/commercial/opportunities')
        .set('Authorization', owner.authorization)
        .send({
          leadId: lead.id,
          propertyId: property.id,
          estimatedValueCents: 138000000,
          commissionBps: 600,
        })
        .expect(201),
    );
    const proposal = {
      valueCents: 138000000,
      validUntil: '2030-06-15T12:00:00Z',
      paymentTerms: 'Entrada e financiamento',
      sellerName: 'Carlos Mendonça',
      installments: [{ amountCents: 4140000 }, { amountCents: 4140000 }],
    };
    await request(app.getHttpServer())
      .post(`/api/commercial/opportunities/${opportunity.id}/proposal`)
      .set('Authorization', owner.authorization)
      .set('Idempotency-Key', randomUUID())
      .send(proposal)
      .expect(201);
    const acceptKey = randomUUID();
    for (let retry = 0; retry < 2; retry++) {
      const accepted = parsed<Entity>(
        await request(app.getHttpServer())
          .post(`/api/commercial/opportunities/${opportunity.id}/accept`)
          .set('Authorization', owner.authorization)
          .set('Idempotency-Key', acceptKey)
          .send({ confirmed: true, simulated: true })
          .expect(201),
      );
      expect(accepted.stage).toBe('WON');
    }
    const installments = parsed<Array<Entity & { amountCents: number }>>(
      await request(app.getHttpServer())
        .get(`/api/commercial/opportunities/${opportunity.id}/installments`)
        .set('Authorization', owner.authorization)
        .expect(200),
    );
    expect(installments).toHaveLength(2);
    expect(installments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(
      8280000,
    );
    const installmentId = installments[0]!.id;
    await request(app.getHttpServer())
      .post('/api/commercial/documents')
      .set('Authorization', owner.authorization)
      .send({
        opportunityId: opportunity.id,
        installmentId,
        kind: 'RECEIPT',
        title: 'Recibo demonstração',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/commercial/installments/${installmentId}/pay`)
      .set('Authorization', owner.authorization)
      .set('Idempotency-Key', randomUUID())
      .send({ simulated: true })
      .expect(201);
    const receiptDto = {
      opportunityId: opportunity.id,
      installmentId,
      kind: 'RECEIPT',
      title: 'Recibo de honorários — demonstração',
    };
    const receipt = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/commercial/documents')
        .set('Authorization', owner.authorization)
        .send(receiptDto)
        .expect(201),
    );
    const receiptAgain = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/commercial/documents')
        .set('Authorization', owner.authorization)
        .send(receiptDto)
        .expect(201),
    );
    expect(receiptAgain.id).toBe(receipt.id);
    expect(receipt.snapshot).toMatchObject({
      simulated: true,
      commissionCents: 8280000,
    });
    await request(app.getHttpServer())
      .patch(`/api/properties/${property.id}`)
      .set('Authorization', owner.authorization)
      .send({ title: 'Nome alterado após emissão' })
      .expect(200);
    const persisted = parsed<Entity>(
      await request(app.getHttpServer())
        .get(`/api/commercial/documents/${receipt.id}`)
        .set('Authorization', owner.authorization)
        .expect(200),
    );
    expect(persisted.snapshot).toEqual(receipt.snapshot);
    expect(persisted.snapshot).toMatchObject({
      property: { title: 'Cobertura Duplex Moema' },
    });
    const pipeline = parsed<{
      metrics: { vgvCents: number; expectedCommissionCents: number };
    }>(
      await request(app.getHttpServer())
        .get('/api/commercial/pipeline')
        .set('Authorization', owner.authorization)
        .expect(200),
    );
    expect(pipeline.metrics.vgvCents).toBe(138000000);
    expect(pipeline.metrics.expectedCommissionCents).toBe(8280000);
    await request(app.getHttpServer())
      .get(`/api/commercial/documents/${receipt.id}`)
      .set('Authorization', outsider.authorization)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/commercial/opportunities/${opportunity.id}`)
      .set('Authorization', outsider.authorization)
      .expect(404);
  });
  it('restores conversation history and pending proposals after a new login', async () => {
    const conversation = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/conversations')
        .set('Authorization', owner.authorization)
        .send({ leadId: lead.id })
        .expect(201),
    );
    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', owner.authorization)
      .set('Idempotency-Key', randomUUID())
      .send({ content: 'Gostaria de conhecer as opções de Moema.' })
      .expect(201);
    const argumentsValue = {
      leadId: lead.id,
      propertyId: property.id,
      ...interval,
    };
    const proposal = await prisma.actionProposal.create({
      data: {
        brokerId: owner.id,
        conversationId: conversation.id,
        actionType: 'schedule_visit',
        arguments: argumentsValue,
        argumentsHash: createHash('sha256')
          .update(JSON.stringify(argumentsValue))
          .digest('hex'),
        summary: 'Agendar visita',
        expiresAt: new Date(Date.now() + 60000),
        idempotencyKey: randomUUID(),
      },
    });
    const ownerBroker = await prisma.broker.findUniqueOrThrow({
      where: { id: owner.id },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ownerBroker.email, password: 'long-enough-test-password' })
      .expect(200);
    const authorization = `Bearer ${parsed<{ accessToken: string }>(login).accessToken}`;
    const conversations = parsed<Entity[]>(
      await request(app.getHttpServer())
        .get('/api/conversations')
        .query({ leadId: lead.id })
        .set('Authorization', authorization)
        .expect(200),
    );
    expect(conversations.map((c) => c.id)).toContain(conversation.id);
    const messages = parsed<Array<{ body: string }>>(
      await request(app.getHttpServer())
        .get(`/api/conversations/${conversation.id}/messages`)
        .set('Authorization', authorization)
        .expect(200),
    );
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const proposals = parsed<Entity[]>(
      await request(app.getHttpServer())
        .get(`/api/conversations/${conversation.id}/proposals`)
        .set('Authorization', authorization)
        .expect(200),
    );
    expect(proposals.map((p) => p.id)).toContain(proposal.id);
    await request(app.getHttpServer())
      .get(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', outsider.authorization)
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `/api/conversations/${conversation.id}/proposals/${proposal.id}/decision`,
      )
      .set('Authorization', authorization)
      .send({ confirmed: true })
      .expect(201);
    const pending = parsed<Entity[]>(
      await request(app.getHttpServer())
        .get(`/api/conversations/${conversation.id}/proposals`)
        .set('Authorization', authorization)
        .expect(200),
    );
    expect(pending).toHaveLength(0);
  });
  it('revalidates operational role while preserving business ownership and personal session', async () => {
    await prisma.broker.update({
      where: { id: outsider.id },
      data: { role: 'OPERATOR' },
    });
    const me = parsed<{ role: string; permissions: string[] }>(
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', outsider.authorization)
        .expect(200),
    );
    expect(me.role).toBe('OPERATOR');
    expect(me.permissions).toContain('operations:read');
    await request(app.getHttpServer())
      .get('/api/operations/jobs')
      .set('Authorization', outsider.authorization)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}`)
      .set('Authorization', outsider.authorization)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/properties/${property.id}`)
      .set('Authorization', outsider.authorization)
      .expect(404);
    await prisma.broker.update({
      where: { id: outsider.id },
      data: { role: 'BROKER' },
    });
    await request(app.getHttpServer())
      .get('/api/operations/jobs')
      .set('Authorization', outsider.authorization)
      .expect(403);
    const revoked = parsed<{ role: string }>(
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', outsider.authorization)
        .expect(200),
    );
    expect(revoked.role).toBe('BROKER');
  });
  it('simulates missing responses and failed invitations only with demo enabled', async () => {
    const reservation = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/scheduling/reservations')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', randomUUID())
        .send({
          leadId: lead.id,
          propertyId: property.id,
          strategy: 'ADD_PROPERTY',
          ...interval,
        })
        .expect(201),
    );
    const config = app.get(ConfigService);
    config.set('DEMO_MODE', false);
    await request(app.getHttpServer())
      .post(`/api/scheduling/reservations/${reservation.id}/simulate-response`)
      .set('Authorization', owner.authorization)
      .send({ event: 'SEND_FAILED' })
      .expect(403);
    config.set('DEMO_MODE', true);
    const failed = parsed<Entity & { messageStatus: string }>(
      await request(app.getHttpServer())
        .post(
          `/api/scheduling/reservations/${reservation.id}/simulate-response`,
        )
        .set('Authorization', owner.authorization)
        .send({ event: 'SEND_FAILED' })
        .expect(201),
    );
    expect(failed.messageStatus).toBe('FAILED');
    const pending = parsed<
      Array<Entity & { messageStatus: string; lead: { name: string } }>
    >(
      await request(app.getHttpServer())
        .get('/api/scheduling/reservations')
        .set('Authorization', owner.authorization)
        .expect(200),
    );
    expect(pending.find((item) => item.id === reservation.id)).toMatchObject({
      messageStatus: 'FAILED',
      lead: { name: 'Juliana Rios' },
    });
    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: stored.messageId! },
    });
    expect(message.status).toBe('FAILED');
    expect(
      (
        await prisma.asyncJob.findUniqueOrThrow({
          where: { id: message.jobId! },
        })
      ).failureCode,
    ).toBe('SIMULATED_DELIVERY_FAILED');
    const expired = parsed<Entity>(
      await request(app.getHttpServer())
        .post(
          `/api/scheduling/reservations/${reservation.id}/simulate-response`,
        )
        .set('Authorization', owner.authorization)
        .send({ event: 'NO_RESPONSE' })
        .expect(201),
    );
    expect(expired.status).toBe('EXPIRED');
    const visit = parsed<Entity>(
      await request(app.getHttpServer())
        .post('/api/visits')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', randomUUID())
        .send({ leadId: lead.id, propertyId: property.id, ...interval })
        .expect(201),
    );
    expect(visit.id).toBeTruthy();
  });
});
