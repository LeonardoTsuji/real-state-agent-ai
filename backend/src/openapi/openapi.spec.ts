import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RequestBodyObject, SchemaObject } from '@nestjs/swagger';
import { CreateVisitDto, CompleteVisitDto } from '../visits/visit.dto.js';
import {
  CreatePropertyDto,
  SearchPropertiesQueryDto,
} from '../properties/property.dto.js';
import { ProposalDto } from '../commercial/commercial.dto.js';
import { RegisterBrokerDto } from '../auth/auth.dto.js';
import { createOpenApiDocument, configureOpenApi } from '../openapi.js';
import { LeadsController } from '../leads/leads.controller.js';
import { LeadsService } from '../leads/leads.service.js';
import { AiController } from '../ai/ai.controller.js';
import { AiService } from '../ai/ai.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';

@Controller('visits')
class VisitFixtureController {
  @Post() create(@Body() body: CreateVisitDto) {
    return body;
  }
  @Post(':id/complete') complete(@Body() body: CompleteVisitDto) {
    return body;
  }
}
@Controller('properties')
class PropertyFixtureController {
  @Post() create(@Body() body: CreatePropertyDto) {
    return body;
  }
  @Get() list(@Query() query: SearchPropertiesQueryDto) {
    return query;
  }
}
@Controller('commercial/opportunities')
class CommercialFixtureController {
  @Post(':id/proposal') proposal(@Body() body: ProposalDto) {
    return body;
  }
}
@Controller('auth')
class AuthFixtureController {
  @Post('register') register(@Body() body: RegisterBrokerDto) {
    return body;
  }
}

describe('ESM OpenAPI contracts', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        VisitFixtureController,
        PropertyFixtureController,
        CommercialFixtureController,
        AuthFixtureController,
        LeadsController,
        AiController,
      ],
      providers: [
        { provide: LeadsService, useValue: {} },
        { provide: AiService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
  });
  afterAll(async () => {
    await app.close();
  });
  it('documents required body properties, validation enums and nested DTOs without a compiler plugin', () => {
    const doc = createOpenApiDocument(app);
    const schemas = doc.components!.schemas! as Record<string, SchemaObject>;
    const create = schemas.VisitFixtureControllerCreateVisitDto!;
    expect(create.required).toEqual(
      expect.arrayContaining(['leadId', 'propertyId', 'startAt', 'endAt']),
    );
    expect(create.properties!.startAt).toMatchObject({
      type: 'string',
      format: 'date-time',
      pattern: 'Z$',
    });
    expect(create.properties!.leadId).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    const complete = schemas.VisitFixtureControllerCompleteVisitDto!;
    expect(complete.properties!.nextStage).toMatchObject({
      enum: expect.arrayContaining(['NEGOTIATION', 'WON']) as unknown,
    });
    expect(complete.properties!.task).toMatchObject({
      allOf: [{ $ref: '#/components/schemas/VisitTaskDto' }],
    });
    expect(schemas.VisitTaskDto!.properties!.dueAt).toMatchObject({
      format: 'date-time',
    });
    const proposal = schemas.CommercialFixtureControllerProposalDto!;
    expect(
      schemas.PropertyFixtureControllerCreatePropertyDto!.properties!
        .availability,
    ).toMatchObject({
      type: 'string',
      enum: ['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED'],
      nullable: true,
    });
    expect(proposal.properties!.installments).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/InstallmentInputDto' },
    });
    expect(schemas.InstallmentInputDto!.properties!.amountCents).toMatchObject({
      type: 'integer',
      minimum: 1,
    });
    const body = doc.paths['/api/visits']!.post!
      .requestBody as RequestBodyObject;
    expect(body.content['application/json']!.schema).toEqual({
      $ref: '#/components/schemas/VisitFixtureControllerCreateVisitDto',
    });
  });
  it('documents query validation and public responses while excluding sensitive persistence fields', () => {
    const doc = createOpenApiDocument(app);
    expect(doc.paths['/api/properties']!.get!.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'query',
          name: 'purpose',
          schema: expect.objectContaining({
            enum: ['SALE', 'RENT'],
          }) as unknown,
        }),
      ]),
    );
    expect(doc.paths['/api/visits']!.post!.responses['201']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PublicVisit' },
        },
      },
    });
    expect(doc.paths['/api/auth/register']!.post!.security).toEqual([]);
    expect(doc.paths['/api/visits']!.post!.security).toEqual([{ bearer: [] }]);
    const schemas = doc.components!.schemas!;
    const publicSchemaText = JSON.stringify(
      Object.fromEntries(
        Object.entries(schemas).filter(([name]) => name.startsWith('Public')),
      ),
    );
    for (const sensitive of [
      'passwordHash',
      'argumentsHash',
      'idempotencyKey',
      'leaseUntil',
      'payload',
    ])
      expect(publicSchemaText).not.toContain(`"${sensitive}"`);
    expect(schemas.PublicUser).toMatchObject({
      properties: {
        role: { enum: ['BROKER', 'OPERATOR'] },
        summary: { type: 'object' },
      },
    });
    expect(schemas.PublicOpportunity).toMatchObject({
      properties: {
        commissionBps: { type: 'integer' },
        estimatedValueCents: { type: 'integer' },
      },
    });
  });
  it('does not register documentation in production', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(configureOpenApi(app)).toBeUndefined();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('resolves every reference, including default controller routes and request DTOs', () => {
    const doc = createOpenApiDocument(app);
    const refs: string[] = [];
    const collect = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' && typeof child === 'string') refs.push(child);
        else collect(child);
      }
    };
    collect(doc);
    for (const pointer of refs) {
      const target = pointer
        .split('/')
        .slice(1)
        .reduce<unknown>((value, key) => {
          return value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined;
        }, doc);
      expect({ pointer, exists: target !== undefined }).toEqual({
        pointer,
        exists: true,
      });
    }
    expect(doc.paths['/api/leads']!.post!.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LeadsControllerCreateLeadDto' },
        },
      },
    });
    expect(
      doc.paths['/api/leads/{leadId}/conversations']!.get!.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PublicConversationCursorPage' },
        },
      },
    });
    expect(doc.components!.schemas!.PublicConversationCursorPage).toMatchObject(
      {
        properties: {
          items: { type: 'array' },
          nextCursor: { nullable: true },
        },
      },
    );
  });
});
