/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module.js';
import { AsyncWorkflowsService } from '../src/integrations/async-workflows.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureHttpApp } from '../src/http-app.js';
import * as argon2 from 'argon2';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type BrokerResponse = { id: string; name: string; email: string };
type LoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};
type LeadResponse = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};
type PropertyResponse = { id: string; title: string; createdAt: string };
type PageResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
type ErrorResponse = {
  code: string;
  details?: Array<{ field: string; message: string }>;
};

function responseBody<T>(response: { text: string }): T {
  return JSON.parse(response.text) as T;
}

describe('Corretor Copilot API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await clearData();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await clearData();
      await app.close();
    }
  });

  it('registers brokers, normalizes email and issues access tokens', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: ' Ada Lovelace ',
        email: ' ADA@EXAMPLE.COM ',
        password: 'a-long-enough-password',
      })
      .expect(201);

    const registeredBroker = responseBody<BrokerResponse>(registration);
    expect(registeredBroker.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(registeredBroker.name).toBe('Ada Lovelace');
    expect(registeredBroker.email).toBe('ada@example.com');
    expect(registration.text).not.toContain('passwordHash');
    const storedBroker = await app.get(PrismaService).broker.findUniqueOrThrow({
      where: { id: registeredBroker.id },
      select: { passwordHash: true, role: true },
    });
    expect(storedBroker.role).toBe('BROKER');
    expect(registration.text).not.toContain('role');
    expect(storedBroker.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(
      argon2.verify(storedBroker.passwordHash, 'a-long-enough-password'),
    ).resolves.toBe(true);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: 'ada@example.com',
        password: 'a-long-enough-password',
      })
      .expect(409)
      .expect((response) => {
        expect(responseBody<ErrorResponse>(response).code).toBe(
          'EMAIL_ALREADY_REGISTERED',
        );
      });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ' ADA@example.com ', password: 'a-long-enough-password' })
      .expect(200);
    const loginResult = responseBody<LoginResponse>(login);
    expect(loginResult.accessToken.length).toBeGreaterThan(20);
    expect(loginResult.tokenType).toBe('Bearer');
    expect(loginResult.expiresIn).toBe(3600);

    await request(app.getHttpServer()).get('/api/leads').expect(401).expect({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
    await request(app.getHttpServer())
      .get('/api/leads')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    const expiredToken = await app
      .get(JwtService)
      .signAsync({ sub: registeredBroker.id }, { expiresIn: '-1s' });
    await request(app.getHttpServer())
      .get('/api/leads')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    const badPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong-password' })
      .expect(401);
    const unknownBroker = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'wrong-password' })
      .expect(401);
    expect(responseBody<ErrorResponse>(badPassword)).toEqual(
      responseBody<ErrorResponse>(unknownBroker),
    );
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Short', email: 'short@example.com', password: 'short' })
      .expect(400);
  });

  it('rejects attempts to assign privileges through public registration', async () => {
    const prisma = app.get(PrismaService);
    for (const extra of [
      { role: 'OPERATOR' },
      { permissions: ['operations:read', 'operations:replay'] },
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Forged operator',
          email: 'forged-operator@example.com',
          password: 'a-long-enough-password',
          ...extra,
        })
        .expect(400);
    }
    expect(await prisma.broker.count()).toBe(0);
  });

  it('enforces RBAC on every operations route and keeps normal routes broker-scoped', async () => {
    const prisma = app.get(PrismaService);
    const operator = await createBroker('operator@example.com');
    const broker = await createBroker('rbac-broker@example.com');
    await prisma.broker.update({
      where: { id: operator.id },
      data: { role: 'OPERATOR' },
    });
    const lead = responseBody<{ id: string }>(
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({ name: 'Other broker lead', email: 'rbac-lead@example.com' })
        .expect(201),
    );
    const followUp = responseBody<{ id: string }>(
      await request(app.getHttpServer())
        .post('/api/follow-ups')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({
          idempotencyKey: 'rbac-follow-up',
          leadId: lead.id,
          title: 'Private follow-up',
          dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          timezone: 'America/Sao_Paulo',
        })
        .expect(201),
    );
    const job = await prisma.asyncJob.findFirstOrThrow({
      where: { aggregateType: 'follow-up', aggregateId: followUp.id },
    });
    const routes = [
      { method: 'get', path: '/api/operations/jobs' },
      { method: 'get', path: `/api/operations/jobs/${job.id}` },
      { method: 'post', path: `/api/operations/jobs/${job.id}/replay` },
      { method: 'get', path: '/api/operations/metrics' },
      { method: 'get', path: '/api/operations/metrics/ai' },
    ] as const;
    const forgedRoleToken = await app.get(JwtService).signAsync({
      sub: broker.id,
      role: 'OPERATOR',
      permissions: ['operations:read', 'operations:replay'],
    });
    for (const route of routes) {
      await request(app.getHttpServer())[route.method](route.path).expect(401);
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${broker.token}`)
        .expect(403);
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${broker.token}`)
        .set('x-operations-token', 'obsolete-shared-secret')
        .expect(403);
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${forgedRoleToken}`)
        .expect(403);
    }
    expect(
      (await prisma.asyncJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('WAITING');
    await prisma.asyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED' },
    });
    for (const route of routes) {
      const result = await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${operator.token}`)
        .expect(route.method === 'post' ? 201 : 200);
      expect(result.text).not.toContain('payload');
      expect(result.text).not.toContain('Private follow-up');
      if (route.path === '/api/operations/jobs') {
        expect(
          responseBody<Array<{ id: string }>>(result).map((row) => row.id),
        ).toContain(job.id);
      }
    }
    expect(
      (await prisma.asyncJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).not.toBe('FAILED');
    await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/follow-ups/${followUp.id}/cancel`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/leads')
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .expect((response) => {
        expect(responseBody<PageResponse<LeadResponse>>(response).total).toBe(
          0,
        );
      });
    await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ name: 'Operator own lead', email: 'operator-lead@example.com' })
      .expect(201);

    await prisma.broker.update({
      where: { id: operator.id },
      data: { role: 'BROKER' },
    });
    for (const route of routes) {
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${operator.token}`)
        .expect(403);
    }
  });

  it('grants and revokes operational access through the administrative script with the same JWT', async () => {
    const broker = await createBroker('script-operator@example.com');
    const prisma = app.get(PrismaService);
    const script = fileURLToPath(
      new URL('../scripts/set-broker-role.mjs', import.meta.url),
    );
    const runScript = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], {
        env: process.env,
        encoding: 'utf8',
        timeout: 10_000,
      });
    const initial = await prisma.broker.findUniqueOrThrow({
      where: { id: broker.id },
    });
    await request(app.getHttpServer())
      .get('/api/operations/metrics')
      .set('Authorization', `Bearer ${broker.token}`)
      .expect(403);
    const promoted = runScript('--', broker.id, 'OPERATOR');
    expect(promoted.status).toBe(0);
    expect(promoted.stderr).toBe('');
    expect(JSON.parse(promoted.stdout)).toEqual({
      brokerId: broker.id,
      previousRole: 'BROKER',
      role: 'OPERATOR',
    });
    const updated = await prisma.broker.findUniqueOrThrow({
      where: { id: broker.id },
    });
    expect(updated.role).toBe('OPERATOR');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      initial.updatedAt.getTime(),
    );
    await request(app.getHttpServer())
      .get('/api/operations/metrics')
      .set('Authorization', `Bearer ${broker.token}`)
      .expect(200);

    for (const args of [
      [],
      ['invalid-uuid', 'OPERATOR'],
      [broker.id, 'ADMIN'],
      [broker.id, 'BROKER', 'extra'],
    ]) {
      const invalid = runScript(...args);
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('Usage:');
      expect(invalid.stdout).toBe('');
    }
    expect(
      (await prisma.broker.findUniqueOrThrow({ where: { id: broker.id } }))
        .role,
    ).toBe('OPERATOR');
    const missing = runScript(
      '00000000-0000-4000-8000-000000000000',
      'OPERATOR',
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toBe('Broker not found.\n');
    expect(missing.stdout).toBe('');
    const unavailable = spawnSync(
      process.execPath,
      [script, broker.id, 'BROKER'],
      {
        env: {
          ...process.env,
          DATABASE_URL:
            'postgresql://user:synthetic-secret@127.0.0.1:1/unavailable',
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(unavailable.status).toBe(1);
    expect(unavailable.stderr).toContain('Could not update broker role.');
    expect(unavailable.stderr).not.toContain('synthetic-secret');
    expect(unavailable.stdout).toBe('');

    const revoked = runScript(broker.id, 'BROKER');
    expect(revoked.status).toBe(0);
    expect(revoked.stderr).toBe('');
    expect(JSON.parse(revoked.stdout)).toEqual({
      brokerId: broker.id,
      previousRole: 'OPERATOR',
      role: 'BROKER',
    });
    await request(app.getHttpServer())
      .get('/api/operations/metrics')
      .set('Authorization', `Bearer ${broker.token}`)
      .expect(403);
  }, 20000);

  it('isolates lead CRUD by authenticated broker and enforces contact rules', async () => {
    const brokerA = await createBroker('a@example.com');
    const brokerB = await createBroker('b@example.com');

    const leadA = await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ name: '  Buyer A ', email: 'a-lead@example.com' })
      .expect(201);
    const leadB = await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${brokerB.token}`)
      .send({ name: 'Buyer B', phone: '+5511999999999' })
      .expect(201);

    const leadAResult = responseBody<LeadResponse>(leadA);
    const leadBResult = responseBody<LeadResponse>(leadB);
    expect(leadA.text).not.toContain('brokerId');
    expect(leadAResult.name).toBe('Buyer A');
    await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({
        name: 'Forged owner',
        email: 'forged@example.com',
        brokerId: brokerB.id,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ name: 'No contact' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({})
      .expect(400);

    const listA = await request(app.getHttpServer())
      .get('/api/leads')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const listB = await request(app.getHttpServer())
      .get('/api/leads')
      .set('Authorization', `Bearer ${brokerB.token}`)
      .expect(200);
    const leadPageA = responseBody<PageResponse<LeadResponse>>(listA);
    const leadPageB = responseBody<PageResponse<LeadResponse>>(listB);
    expect(leadPageA.total).toBe(1);
    expect(leadPageA.items).toHaveLength(1);
    expect(leadPageB.total).toBe(1);
    expect(leadPageA.items[0]?.id).not.toBe(leadBResult.id);

    await request(app.getHttpServer())
      .get(`/api/leads/${leadBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/leads/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/leads/${leadBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ name: 'Tampered' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/leads/${leadBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ email: null, phone: null })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200)
      .expect((response) => {
        expect(responseBody<LeadResponse>(response).email).toBe(
          'a-lead@example.com',
        );
      });

    await request(app.getHttpServer())
      .patch(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ email: null, phone: '11988887777' })
      .expect(200)
      .expect((response) => {
        const lead = responseBody<LeadResponse>(response);
        expect(lead.email).toBeNull();
        expect(lead.phone).toBe('11988887777');
      });

    await request(app.getHttpServer())
      .post('/api/leads')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ name: 'Second lead', phone: '11977776666' })
      .expect(201);
    const firstPage = await request(app.getHttpServer())
      .get('/api/leads?page=1&limit=1')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/api/leads?page=2&limit=1')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const firstLeadPage = responseBody<PageResponse<LeadResponse>>(firstPage);
    const secondLeadPage = responseBody<PageResponse<LeadResponse>>(secondPage);
    expect(firstLeadPage.total).toBe(2);
    expect(firstLeadPage.items[0]?.id).not.toBe(secondLeadPage.items[0]?.id);

    await request(app.getHttpServer())
      .delete(`/api/leads/${leadBResult.id}`)
      .set('Authorization', `Bearer ${brokerB.token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/leads/${leadBResult.id}`)
      .set('Authorization', `Bearer ${brokerB.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/leads/${leadAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);
  });

  it('filters properties deterministically and isolates property CRUD', async () => {
    const brokerA = await createBroker('property-a@example.com');
    const brokerB = await createBroker('property-b@example.com');
    const propertyA = await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({
        title: 'Apartment in Vila Mariana',
        purpose: 'SALE',
        type: 'APARTMENT',
        priceCents: 60000000,
        city: 'São Paulo',
        neighborhood: 'Vila Mariana',
        bedrooms: 2,
        parkingSpaces: 1,
      })
      .expect(201);
    const propertyB = await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${brokerB.token}`)
      .send({
        title: 'House',
        purpose: 'SALE',
        type: 'HOUSE',
        priceCents: 80000000,
        city: 'São Paulo',
        neighborhood: 'Moema',
        bedrooms: 3,
        parkingSpaces: 2,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({
        title: 'Land listing',
        purpose: 'SALE',
        type: 'LAND',
        priceCents: 30000000,
        city: 'São Paulo',
        neighborhood: 'Centro',
        bedrooms: 0,
        parkingSpaces: 0,
      })
      .expect(201);

    const propertyAResult = responseBody<PropertyResponse>(propertyA);
    const propertyBResult = responseBody<PropertyResponse>(propertyB);
    expect(propertyA.text).not.toContain('brokerId');
    const validPropertyDraft = {
      title: 'Invalid property',
      purpose: 'SALE',
      type: 'APARTMENT',
      priceCents: 100,
      city: 'São Paulo',
      neighborhood: 'Vila Mariana',
      bedrooms: 1,
      parkingSpaces: 0,
    };
    const invalidPropertyDrafts = [
      { ...validPropertyDraft, purpose: 'BUY' },
      { ...validPropertyDraft, priceCents: 0 },
      { ...validPropertyDraft, bedrooms: -1 },
      { ...validPropertyDraft, parkingSpaces: 101 },
    ];
    for (const draft of invalidPropertyDrafts) {
      await request(app.getHttpServer())
        .post('/api/properties')
        .set('Authorization', `Bearer ${brokerA.token}`)
        .send(draft)
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({
        title: 'Owner injection',
        purpose: 'SALE',
        type: 'APARTMENT',
        priceCents: 10,
        city: 'São Paulo',
        neighborhood: 'Vila Mariana',
        bedrooms: 1,
        parkingSpaces: 0,
        brokerId: brokerB.id,
      })
      .expect(400);
    const search = await request(app.getHttpServer())
      .get('/api/properties')
      .query({
        purpose: 'SALE',
        type: 'APARTMENT',
        city: 'sÃO pAULO',
        neighborhood: 'VILA MARIANA',
        minPriceCents: '60000000',
        maxPriceCents: '60000000',
        minBedrooms: '2',
        minParkingSpaces: '1',
      })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const propertyPage = responseBody<PageResponse<PropertyResponse>>(search);
    expect(propertyPage.total).toBe(1);
    expect(propertyPage.items[0]?.id).toBe(propertyAResult.id);

    const firstPropertyPageResponse = await request(app.getHttpServer())
      .get('/api/properties?page=1&limit=1')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const secondPropertyPageResponse = await request(app.getHttpServer())
      .get('/api/properties?page=2&limit=1')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200);
    const firstPropertyPage = responseBody<PageResponse<PropertyResponse>>(
      firstPropertyPageResponse,
    );
    const secondPropertyPage = responseBody<PageResponse<PropertyResponse>>(
      secondPropertyPageResponse,
    );
    expect(firstPropertyPage.total).toBe(2);
    const firstPropertyItem = firstPropertyPage.items[0];
    const secondPropertyItem = secondPropertyPage.items[0];
    expect(firstPropertyItem?.id).not.toBe(secondPropertyItem?.id);
    if (firstPropertyItem && secondPropertyItem) {
      const firstTime = Date.parse(firstPropertyItem.createdAt);
      const secondTime = Date.parse(secondPropertyItem.createdAt);
      expect(
        firstTime > secondTime ||
          (firstTime === secondTime &&
            firstPropertyItem.id > secondPropertyItem.id),
      ).toBe(true);
    }

    await request(app.getHttpServer())
      .get('/api/properties')
      .query({ minPriceCents: '1e4' })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/properties')
      .query({ brokerId: brokerB.id })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/properties')
      .query({ minPriceCents: ['100', '200'] })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/properties')
      .query({ minPriceCents: '90000000', maxPriceCents: '1000' })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(400)
      .expect((response) => {
        expect(responseBody<ErrorResponse>(response).details?.[0]?.field).toBe(
          'minPriceCents',
        );
      });
    await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({
        title: 'String price',
        purpose: 'SALE',
        type: 'APARTMENT',
        priceCents: '60000000',
        city: 'São Paulo',
        neighborhood: 'Vila Mariana',
        bedrooms: 2,
        parkingSpaces: 1,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/properties/${propertyAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/properties/${propertyAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ description: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/properties/${propertyBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/properties/${propertyBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ title: 'Tampered' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/properties/${propertyBResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);
    const brokerBProperties = await request(app.getHttpServer())
      .get('/api/properties')
      .set('Authorization', `Bearer ${brokerB.token}`)
      .expect(200);
    expect(
      responseBody<PageResponse<PropertyResponse>>(brokerBProperties).total,
    ).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/properties/${propertyAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .send({ title: 'Updated apartment', description: null })
      .expect(200)
      .expect((response) => {
        const property = responseBody<PropertyResponse>(response);
        expect(property.title).toBe('Updated apartment');
      });
    await request(app.getHttpServer())
      .delete(`/api/properties/${propertyAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/properties/${propertyAResult.id}`)
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/properties')
      .query({ page: '1', limit: '1', purpose: 'RENT' })
      .set('Authorization', `Bearer ${brokerA.token}`)
      .expect(200)
      .expect((response) => {
        expect(
          responseBody<PageResponse<PropertyResponse>>(response),
        ).toMatchObject({
          items: [],
          page: 1,
          limit: 1,
          total: 0,
        });
      });
  });

  it('maps UUID and unknown-route errors to the API envelope', async () => {
    const broker = await createBroker('validation@example.com');
    await request(app.getHttpServer())
      .get('/api/leads/not-a-uuid')
      .set('Authorization', `Bearer ${broker.token}`)
      .expect(400)
      .expect((response) => {
        expect(responseBody<ErrorResponse>(response).code).toBe(
          'VALIDATION_ERROR',
        );
      });

    await request(app.getHttpServer())
      .get('/api/unknown-route')
      .expect(404)
      .expect((response) => {
        expect(responseBody<ErrorResponse>(response).code).toBe(
          'RESOURCE_NOT_FOUND',
        );
      });
    await request(app.getHttpServer())
      .get('/api')
      .expect(404)
      .expect((response) => {
        expect(responseBody<ErrorResponse>(response).code).toBe(
          'RESOURCE_NOT_FOUND',
        );
      });
  });

  it('keeps preferences, matches, visits, interactions, tasks and funnel data consistent', async () => {
    const broker = await createBroker('stage-two@example.com');
    const otherBroker = await createBroker('stage-two-other@example.com');
    const lead = responseBody<LeadResponse>(
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({ name: 'Stage Two Lead', email: 'stage-two-lead@example.com' })
        .expect(201),
    );
    const anotherOwnedLead = responseBody<LeadResponse>(
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({ name: 'Another Lead', email: 'another-lead@example.com' })
        .expect(201),
    );
    const otherLead = responseBody<LeadResponse>(
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', `Bearer ${otherBroker.token}`)
        .send({ name: 'Other Lead', email: 'other-lead@example.com' })
        .expect(201),
    );
    const property = responseBody<PropertyResponse>(
      await request(app.getHttpServer())
        .post('/api/properties')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({
          title: 'Stage Two Home',
          purpose: 'SALE',
          type: 'APARTMENT',
          priceCents: 50000000,
          city: 'São Paulo',
          neighborhood: 'Pinheiros',
          bedrooms: 2,
          parkingSpaces: 1,
        })
        .expect(201),
    );
    const foreignProperty = responseBody<PropertyResponse>(
      await request(app.getHttpServer())
        .post('/api/properties')
        .set('Authorization', `Bearer ${otherBroker.token}`)
        .send({
          title: 'Foreign Home',
          purpose: 'SALE',
          type: 'HOUSE',
          priceCents: 80000000,
          city: 'São Paulo',
          neighborhood: 'Moema',
          bedrooms: 3,
          parkingSpaces: 2,
        })
        .expect(201),
    );
    const auth = { Authorization: `Bearer ${broker.token}` };
    await expect(
      app.get(PrismaService).leadPreference.create({
        data: {
          brokerId: broker.id,
          leadId: anotherOwnedLead.id,
          minPriceCents: 900,
          maxPriceCents: 100,
        },
      }),
    ).rejects.toThrow();

    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/preferences`)
      .set(auth)
      .send({
        minPriceCents: 10000000,
        maxPriceCents: 70000000,
        minBedrooms: 2,
        neighborhoods: ['Pinheiros'],
        purposes: ['SALE'],
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/preferences`)
      .set(auth)
      .send({ maxPriceCents: 9000000 })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}/preferences`)
      .set(auth)
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({
          minPriceCents: 10000000,
          maxPriceCents: 70000000,
          neighborhoods: ['Pinheiros'],
        }),
      );
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/matches`)
      .set(auth)
      .send({ propertyId: foreignProperty.id, score: 80 })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/leads/${otherLead.id}/matches`)
      .set(auth)
      .send({ propertyId: property.id, score: 80 })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/matches`)
      .set(auth)
      .send({
        propertyId: property.id,
        score: 80,
        rejectionReason: 'No status',
      })
      .expect(400);
    const match = await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/matches`)
      .set(auth)
      .send({ propertyId: property.id, score: 90, status: 'SUGGESTED' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/matches`)
      .set(auth)
      .send({ propertyId: property.id, score: 91 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/matches/${property.id}`)
      .set(auth)
      .send({ status: 'REJECTED', rejectionReason: 'Budget mismatch' })
      .expect(200);
    expect(match.body.score).toBe(90);
    const reopenedMatch = await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/matches/${property.id}`)
      .set(auth)
      .send({ status: 'SENT' })
      .expect(200);
    expect(reopenedMatch.body).toMatchObject({
      status: 'SENT',
      rejectionReason: null,
    });

    const starts = ['2030-02-01T10:00:00.000Z', '2030-02-01T11:00:00.000Z'];
    const visit = await request(app.getHttpServer())
      .post('/api/visits')
      .set(auth)
      .send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: starts[0],
        endAt: starts[1],
      })
      .expect(201);
    const adjacentVisit = await request(app.getHttpServer())
      .post('/api/visits')
      .set(auth)
      .send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: starts[1],
        endAt: '2030-02-01T12:00:00.000Z',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/visits/${adjacentVisit.body.id}`)
      .set(auth)
      .send({
        startAt: '2030-02-01T10:30:00.000Z',
        endAt: '2030-02-01T11:30:00.000Z',
      })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/visits/${adjacentVisit.body.id}`)
      .set('Authorization', `Bearer ${otherBroker.token}`)
      .expect(404);
    const races = await Promise.all([
      request(app.getHttpServer()).post('/api/visits').set(auth).send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: '2030-02-01T12:00:00.000Z',
        endAt: '2030-02-01T13:00:00.000Z',
      }),
      request(app.getHttpServer()).post('/api/visits').set(auth).send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: '2030-02-01T12:30:00.000Z',
        endAt: '2030-02-01T13:30:00.000Z',
      }),
    ]);
    expect(races.map((result) => result.status).sort()).toEqual([201, 409]);
    await request(app.getHttpServer())
      .patch(`/api/visits/${visit.body.id}`)
      .set(`Authorization`, `Bearer ${otherBroker.token}`)
      .send({
        startAt: '2030-02-02T10:00:00.000Z',
        endAt: '2030-02-02T11:00:00.000Z',
      })
      .expect(404);
    const canceled = await request(app.getHttpServer())
      .delete(`/api/visits/${visit.body.id}`)
      .set(auth)
      .expect(200);
    expect(canceled.body.canceledById).toBe(broker.id);
    expect(canceled.body.canceledAt).toBeTruthy();
    const rebookedVisit = await request(app.getHttpServer())
      .post('/api/visits')
      .set(auth)
      .send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: starts[0],
        endAt: starts[1],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/visits/${visit.body.id}/complete`)
      .set(auth)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/visits/${rebookedVisit.body.id}/complete`)
      .set(auth)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/visits')
      .set(auth)
      .send({
        leadId: lead.id,
        propertyId: property.id,
        startAt: starts[0],
        endAt: starts[1],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/interactions`)
      .set(auth)
      .send({
        type: 'CALL',
        occurredAt: '2026-01-01T10:00:00.000Z',
        summary: 'Discussed preferences',
        channel: 'phone',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/interactions`)
      .set(auth)
      .send({
        type: 'EMAIL',
        occurredAt: '2026-01-02T10:00:00.000Z',
        summary: 'Sent listing',
      })
      .expect(201);
    const firstInteractionPage = await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}/interactions?limit=1`)
      .set(auth)
      .expect(200);
    const firstInteraction = firstInteractionPage.body.items[0] as {
      id: string;
    };
    const interactionCursor = firstInteractionPage.body.nextCursor as string;
    await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/interactions`)
      .set(auth)
      .send({
        type: 'NOTE',
        occurredAt: '2026-01-03T10:00:00.000Z',
        summary: 'Newer event after cursor',
      })
      .expect(201);
    const secondInteractionPage = await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}/interactions`)
      .query({ limit: 1, cursor: interactionCursor })
      .set(auth)
      .expect(200);
    expect(
      (secondInteractionPage.body.items as Array<{ id: string }>)[0]?.id,
    ).not.toBe(firstInteraction.id);
    expect(secondInteractionPage.body.items).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/api/leads/${anotherOwnedLead.id}/interactions`)
      .query({ limit: 1, cursor: interactionCursor })
      .set(auth)
      .expect(400);

    const task = await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth)
      .send({
        leadId: lead.id,
        title: 'Call back',
        dueAt: '2030-02-01T09:00:00.000Z',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/tasks?status=PENDING')
      .set(auth)
      .expect(200)
      .expect((response) =>
        expect(
          response.body.items.some(
            (item: { id: string }) => item.id === task.body.id,
          ),
        ).toBe(true),
      );
    await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.id}/status`)
      .set(auth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${task.body.id}/status`)
      .set(auth)
      .send({ status: 'CANCELED' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/stage`)
      .set(auth)
      .send({ stage: 'QUALIFIED' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/stage`)
      .set(auth)
      .send({ stage: 'CONTACTED' })
      .expect(200);
    const stageUpdate = await request(app.getHttpServer())
      .patch(`/api/leads/${lead.id}/stage`)
      .set(auth)
      .set('x-request-id', 'invalid request id')
      .send({ stage: 'QUALIFIED' })
      .expect(200);
    expect(stageUpdate.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    await request(app.getHttpServer())
      .get('/api/leads/funnel')
      .set(auth)
      .expect(200)
      .expect((response) =>
        expect(response.body).toContainEqual({ stage: 'QUALIFIED', count: 1 }),
      );
    const history = await app.get(PrismaService).leadStageHistory.findMany({
      where: { brokerId: broker.id, leadId: lead.id },
    });
    expect(history.map((row) => row.toStage)).toEqual([
      'NEW',
      'CONTACTED',
      'QUALIFIED',
    ]);
    const audits = await app
      .get(PrismaService)
      .auditLog.findMany({ where: { brokerId: broker.id } });
    expect(audits.length).toBeGreaterThan(6);
    expect(JSON.stringify(audits)).not.toContain('stage-two-lead@example.com');
    expect(
      audits.some(
        (row) => row.requestId === stageUpdate.headers['x-request-id'],
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .delete(`/api/leads/${lead.id}`)
      .set(auth)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/leads/${lead.id}`)
      .set(auth)
      .expect(404);
    expect(
      await app
        .get(PrismaService)
        .interaction.count({ where: { leadId: lead.id } }),
    ).toBe(3);
    expect(
      await app
        .get(PrismaService)
        .leadStageHistory.count({ where: { leadId: lead.id } }),
    ).toBe(3);
  });

  it('rolls back a lead mutation when its audit insert fails', async () => {
    const broker = await createBroker('audit-rollback@example.com');
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`,
    );
    try {
      await request(app.getHttpServer())
        .post('/api/leads')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({ name: 'Must roll back', email: 'must-rollback@example.com' })
        .expect(500);
      expect(await prisma.lead.count({ where: { brokerId: broker.id } })).toBe(
        0,
      );
      expect(
        await prisma.auditLog.count({ where: { brokerId: broker.id } }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reject_test_audit ON audit_logs',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_test_audit()',
      );
    }
  });

  it('deduplicates and tracks asynchronous follow-ups, imports and messages', async () => {
    const broker = await createBroker('async-flows@example.com');
    const prisma = app.get(PrismaService);
    const operator = await createBroker('async-operator@example.com');
    await prisma.broker.update({
      where: { id: operator.id },
      data: { role: 'OPERATOR' },
    });
    const operationsAuth = { Authorization: `Bearer ${operator.token}` };
    const lead = await prisma.lead.create({
      data: {
        brokerId: broker.id,
        name: 'Async lead',
        email: 'async-lead@example.com',
      },
    });
    const auth = { Authorization: `Bearer ${broker.token}` };

    const followUpBody = {
      idempotencyKey: 'follow-up-command-1',
      leadId: lead.id,
      title: 'Call back',
      dueAt: new Date(Date.now() + 60_000).toISOString(),
      timezone: 'America/Sao_Paulo',
    };
    const followUp = await request(app.getHttpServer())
      .post('/api/follow-ups')
      .set(auth)
      .send(followUpBody)
      .expect(201);
    const followUpId = responseBody<{ id: string }>(followUp).id;
    const repeatedFollowUp = await request(app.getHttpServer())
      .post('/api/follow-ups')
      .set(auth)
      .send(followUpBody)
      .expect(201);
    expect(responseBody<{ id: string }>(repeatedFollowUp).id).toBe(followUpId);
    await request(app.getHttpServer())
      .patch(`/api/follow-ups/${followUpId}/cancel`)
      .set(auth)
      .expect(200);
    const followUpJob = await prisma.asyncJob.findFirstOrThrow({
      where: { aggregateType: 'follow-up', aggregateId: followUpId },
    });
    expect(followUpJob.status).toBe('CANCELED');

    const importBody = {
      idempotencyKey: 'batch-async-1',
      rows: [
        {
          externalKey: 'listing-1',
          title: 'Apartment',
          purpose: 'SALE',
          type: 'APARTMENT',
          priceCents: 25000000,
          city: 'São Paulo',
          neighborhood: 'Centro',
          bedrooms: 2,
          parkingSpaces: 1,
        },
        { externalKey: 'listing-invalid', title: 'Missing fields' },
      ],
    };
    const batch = await request(app.getHttpServer())
      .post('/api/imports/properties')
      .set(auth)
      .send(importBody)
      .expect(201);
    const batchId = responseBody<{ id: string }>(batch).id;
    const repeatedBatch = await request(app.getHttpServer())
      .post('/api/imports/properties')
      .set(auth)
      .send(importBody)
      .expect(201);
    expect(responseBody<{ id: string }>(repeatedBatch).id).toBe(batchId);
    const report = await waitFor(async () => {
      const result = await request(app.getHttpServer())
        .get(`/api/imports/properties/${batchId}`)
        .set(auth)
        .expect(200);
      return responseBody<{
        report: { read: number; accepted: number; rejected: number } | null;
      }>(result).report;
    });
    expect(report).toMatchObject({ read: 2, accepted: 1, rejected: 1 });
    expect(
      await prisma.property.count({ where: { brokerId: broker.id } }),
    ).toBe(1);
    const importedProperty = await prisma.property.findFirstOrThrow({
      where: { brokerId: broker.id },
    });
    const visitStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const visitEnd = new Date(visitStart.getTime() + 60 * 60 * 1000);
    const visitBody = {
      leadId: lead.id,
      propertyId: importedProperty.id,
      startAt: visitStart.toISOString(),
      endAt: visitEnd.toISOString(),
    };
    const visit = await request(app.getHttpServer())
      .post('/api/visits')
      .set({ ...auth, 'Idempotency-Key': 'visit-command-1' })
      .send(visitBody)
      .expect(201);
    const repeatedVisit = await request(app.getHttpServer())
      .post('/api/visits')
      .set({ ...auth, 'Idempotency-Key': 'visit-command-1' })
      .send(visitBody)
      .expect(201);
    const visitId = responseBody<{ id: string }>(visit).id;
    expect(responseBody<{ id: string }>(repeatedVisit).id).toBe(visitId);
    expect(
      await prisma.asyncJob.count({
        where: { aggregateType: 'visit', aggregateId: visitId },
      }),
    ).toBe(2);

    const messageBody = { idempotencyKey: 'message-command-1', body: 'Hello' };
    const message = await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/messages`)
      .set(auth)
      .send(messageBody)
      .expect(201);
    const messageId = responseBody<{ id: string }>(message).id;
    const repeatedMessage = await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/messages`)
      .set(auth)
      .send(messageBody)
      .expect(201);
    expect(responseBody<{ id: string }>(repeatedMessage).id).toBe(messageId);
    const sent = await waitFor(async () => {
      const result = await request(app.getHttpServer())
        .get(`/api/leads/${lead.id}/messages`)
        .set(auth)
        .expect(200);
      const status = responseBody<Array<{ id: string; status: string }>>(
        result,
      ).find((row) => row.id === messageId)?.status;
      return status === 'SENT' ? status : undefined;
    });
    expect(sent).toBe('SENT');

    await request(app.getHttpServer())
      .get('/api/operations/jobs')
      .set(auth)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/operations/jobs')
      .set(operationsAuth)
      .expect(200)
      .expect((response) => {
        expect(response.text).not.toContain('Hello');
        expect(response.text).not.toContain('payload');
      });

    const config = app.get(ConfigService);
    config.set('SIMULATED_MESSAGING_MODE', 'transient_failure');
    const retryable = await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/messages`)
      .set(auth)
      .send({ idempotencyKey: 'message-transient-retry', body: 'Retry safely' })
      .expect(201);
    const retryableId = responseBody<{ id: string }>(retryable).id;
    const retryJob = await waitFor(async () => {
      const messageRecord = await prisma.message.findUniqueOrThrow({
        where: { id: retryableId },
      });
      const job = await prisma.asyncJob.findUnique({
        where: { id: messageRecord.jobId! },
      });
      return job && job.attempts > 0 && job.status === 'WAITING'
        ? job
        : undefined;
    });
    expect(retryJob.nextRetryAt).not.toBeNull();
    const workflows = app.get(AsyncWorkflowsService);
    await workflows.onModuleDestroy();
    config.set('SIMULATED_MESSAGING_MODE', 'success');
    await workflows.onModuleInit();
    await waitFor(async () => {
      const messageRecord = await prisma.message.findUniqueOrThrow({
        where: { id: retryableId },
      });
      return messageRecord.status === 'SENT' ? messageRecord.status : undefined;
    });

    config.set('QUEUE_RATE_MAX', 1);
    config.set('QUEUE_RATE_DURATION_MS', 1000);
    await workflows.onModuleDestroy();
    await workflows.onModuleInit();
    const rateTestStarted = Date.now();
    const rateLimitedMessages = await Promise.all(
      ['rate-limit-a', 'rate-limit-b'].map(async (idempotencyKey) => {
        const response = await request(app.getHttpServer())
          .post(`/api/leads/${lead.id}/messages`)
          .set(auth)
          .send({ idempotencyKey, body: 'Rate limit check' })
          .expect(201);
        return responseBody<{ id: string }>(response).id;
      }),
    );
    await waitFor(async () => {
      const sentCount = await prisma.message.count({
        where: { id: { in: rateLimitedMessages }, status: 'SENT' },
      });
      return sentCount === rateLimitedMessages.length ? sentCount : undefined;
    });
    expect(Date.now() - rateTestStarted).toBeGreaterThanOrEqual(800);
    config.set('QUEUE_RATE_MAX', 30);

    config.set('SIMULATED_MESSAGING_MODE', 'permanent_failure');
    const failedMessage = await request(app.getHttpServer())
      .post(`/api/leads/${lead.id}/messages`)
      .set(auth)
      .send({ idempotencyKey: 'message-permanent-failure', body: 'Retry me' })
      .expect(201);
    const failedMessageId = responseBody<{ id: string }>(failedMessage).id;
    const failedJob = await waitFor(async () => {
      const result = await prisma.message.findUniqueOrThrow({
        where: { id: failedMessageId },
      });
      if (result.status !== 'FAILED') return undefined;
      return prisma.asyncJob.findUnique({ where: { id: result.jobId! } });
    });
    expect(failedJob?.status).toBe('FAILED');
    expect(failedJob?.failureMessage).not.toContain('Retry me');

    config.set('SIMULATED_MESSAGING_MODE', 'success');
    await request(app.getHttpServer())
      .post(`/api/operations/jobs/${failedJob!.id}/replay`)
      .set(operationsAuth)
      .expect(201);
    await waitFor(async () => {
      const result = await prisma.message.findUniqueOrThrow({
        where: { id: failedMessageId },
      });
      return result.status === 'SENT' ? result.status : undefined;
    });
  }, 20000);

  it('keeps committed outbox work pending while Redis is stopped and dispatches after recovery', async () => {
    const broker = await createBroker('redis-recovery@example.com');
    const lead = await app.get(PrismaService).lead.create({
      data: { brokerId: broker.id, name: 'Redis recovery lead' },
    });
    let outboxJobId = '';
    execFileSync('docker', ['compose', 'stop', 'redis'], { stdio: 'ignore' });
    try {
      const response = await request(app.getHttpServer())
        .post('/api/follow-ups')
        .set('Authorization', `Bearer ${broker.token}`)
        .send({
          idempotencyKey: 'redis-offline-follow-up',
          leadId: lead.id,
          title: 'Retry when online',
          dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          timezone: 'America/Sao_Paulo',
        })
        .expect(201);
      const followUpId = responseBody<{ id: string }>(response).id;
      const job = await app.get(PrismaService).asyncJob.findFirstOrThrow({
        where: { aggregateType: 'follow-up', aggregateId: followUpId },
      });
      outboxJobId = job.id;
      expect(job.status).toBe('WAITING');
      expect(
        await app.get(PrismaService).outboxEvent.findUniqueOrThrow({
          where: { jobId: job.id },
        }),
      ).toMatchObject({ status: 'PENDING', publishedAt: null });
    } finally {
      execFileSync('docker', ['compose', 'start', 'redis'], {
        stdio: 'ignore',
      });
    }
    const recovered = await waitFor(async () => {
      const event = await app.get(PrismaService).outboxEvent.findFirstOrThrow({
        where: { jobId: outboxJobId },
      });
      return event.status === 'PUBLISHED' ? event.status : undefined;
    });
    expect(recovered).toBe('PUBLISHED');
  });

  async function createBroker(
    email: string,
  ): Promise<{ id: string; token: string }> {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test Broker', email, password: 'a-long-enough-password' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'a-long-enough-password' })
      .expect(200);
    const identity = responseBody<BrokerResponse>(registration);
    const token = responseBody<LoginResponse>(login).accessToken;
    return { id: identity.id, token };
  }

  async function waitFor<T>(read: () => Promise<T>, attempts = 30): Promise<T> {
    let value: T;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      value = await read();
      if (
        value !== null &&
        value !== undefined &&
        value !== false &&
        value !== ''
      )
        return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Timed out waiting for asynchronous workflow');
  }

  async function clearData(): Promise<void> {
    const prisma = app.get(PrismaService);
    await prisma.$transaction(async (tx) => {
      await tx.commercialDocument.deleteMany();
      await tx.installment.deleteMany();
      await tx.opportunity.deleteMany();
      await tx.leadImportBatch.deleteMany();
      await tx.reservation.deleteMany();
      await tx.calendarBlock.deleteMany();
      await tx.calendarOccupancy.deleteMany();
      await tx.actionProposal.deleteMany();
      await tx.toolExecution.deleteMany();
      await tx.aiDailyBudget.deleteMany();
      await tx.message.deleteMany();
      await tx.conversation.deleteMany();
      await tx.followUp.deleteMany();
      await tx.propertyImportBatch.deleteMany();
      await tx.simulatedCalendarEvent.deleteMany();
      await tx.jobReceipt.deleteMany();
      await tx.outboxEvent.deleteMany();
      await tx.asyncJob.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.leadStageHistory.deleteMany();
      await tx.task.deleteMany();
      await tx.interaction.deleteMany();
      await tx.visit.deleteMany();
      await tx.leadPropertyMatch.deleteMany();
      await tx.leadPreference.deleteMany();
      await tx.property.deleteMany();
      await tx.lead.deleteMany();
      await tx.broker.deleteMany();
    });
  }
});
