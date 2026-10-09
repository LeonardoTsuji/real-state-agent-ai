import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { APIConnectionError, APIConnectionTimeoutError } from 'openai';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { AiService, extractionFailureCode } from './ai.service.js';
import { LlmAdapter, LlmResponseError, TOOL_SCHEMAS } from './llm.adapter.js';
import type { LlmInput, LlmOutput } from './llm.adapter.js';

const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest })
  .jest;

let loggedLines: string[];
beforeEach(() => {
  loggedLines = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    if (typeof chunk === 'string') loggedLines.push(chunk);
    return true;
  });
});
afterEach(() => jest.restoreAllMocks());

describe('AiService preference extraction', () => {
  it('keeps unknown neighborhoods unresolved and does not invent a search', async () => {
    const prisma = {
      $queryRaw: () => Promise.resolve([{ reserved_tokens: 5000 }]),
      $executeRaw: () => Promise.resolve(1),
      property: { findFirst: () => Promise.resolve(null) },
      toolExecution: {
        aggregate: () => Promise.resolve({ _sum: { tokenCount: 0 } }),
        create: () => Promise.resolve({ id: 'execution' }),
      },
    };
    const llm = {
      extractPreferences: () =>
        Promise.resolve({
          json: JSON.stringify({
            schemaVersion: 'v1',
            purpose: 'RENT',
            types: ['APARTMENT'],
            neighborhoods: ['Bairro Inexistente'],
            minPriceCents: null,
            maxPriceCents: null,
            minBedrooms: null,
            maxBedrooms: null,
            confidence: 0.8,
            uncertainty: [],
            needsClarification: false,
          }),
          totalTokens: 42,
        }),
    };
    let searchCalls = 0;
    const properties = {
      list: () => {
        searchCalls += 1;
      },
    };
    const service = new AiService(
      prisma as unknown as PrismaService,
      llm as unknown as LlmAdapter,
      {} as LeadsService,
      properties as unknown as PropertiesService,
      {} as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );

    await expect(
      service.extractPreferences(
        'broker-id',
        'Quero alugar no Bairro Inexistente',
      ),
    ).resolves.toMatchObject({
      schemaVersion: 'v1',
      minPriceCents: null,
      needsClarification: true,
      neighborhoods: [],
      uncertainty: ['Bairro não encontrado: Bairro Inexistente'],
    });
    expect(searchCalls).toBe(0);
  });

  it('rejects provider output that does not match the versioned schema', async () => {
    const service = new AiService(
      {
        $queryRaw: () => Promise.resolve([{ reserved_tokens: 5000 }]),
        $executeRaw: () => Promise.resolve(1),
        toolExecution: {
          aggregate: () => Promise.resolve({ _sum: { tokenCount: 0 } }),
          create: () => Promise.resolve({ id: 'execution' }),
        },
      } as unknown as PrismaService,
      {
        extractPreferences: () =>
          Promise.resolve({ json: '{"unknown":true}', totalTokens: 0 }),
      } as unknown as LlmAdapter,
      {} as LeadsService,
      {} as PropertiesService,
      {} as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );
    await expect(
      service.extractPreferences('broker-id', 'Procuro um imóvel'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('records a safe provider authentication category without storing its message', async () => {
    let executionData: { resultCode?: string } | undefined;
    const service = new AiService(
      {
        $queryRaw: () => Promise.resolve([{ reserved_tokens: 5000 }]),
        $executeRaw: () => Promise.resolve(1),
        toolExecution: {
          create: (args: { data: { resultCode: string } }) => {
            executionData = args.data;
            return Promise.resolve({ id: 'execution' });
          },
        },
      } as unknown as PrismaService,
      {
        extractPreferences: () =>
          Promise.reject(
            Object.assign(new Error('sensitive upstream message'), {
              status: 401,
            }),
          ),
      } as unknown as LlmAdapter,
      {} as LeadsService,
      {} as PropertiesService,
      {} as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );

    await expect(
      service.extractPreferences('broker-id', 'Procuro apartamento'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(executionData).toMatchObject({
      resultCode: 'AI_PROVIDER_AUTH_FAILED',
    });
    expect(JSON.stringify(executionData)).not.toContain(
      'sensitive upstream message',
    );
  });

  it('adds only a sanitized upstream code to bad-request diagnostics', () => {
    const error = Object.assign(new Error('private provider detail'), {
      status: 400,
      code: 'invalid_json_schema',
    });

    expect(extractionFailureCode(error)).toBe(
      'AI_PROVIDER_BAD_REQUEST_INVALID_JSON_SCHEMA',
    );
    expect(extractionFailureCode(error)).not.toContain(
      'private provider detail',
    );
  });

  it('recognizes the timeout and connection error classes from the installed SDK', () => {
    expect(extractionFailureCode(new APIConnectionTimeoutError())).toBe(
      'AI_PROVIDER_TIMEOUT',
    );
    expect(extractionFailureCode(new APIConnectionError({}))).toBe(
      'AI_PROVIDER_CONNECTION_FAILED',
    );
  });

  it('records a cross-tenant conversation access attempt while returning 404', async () => {
    let auditedAction: unknown;
    const tx = {
      auditLog: {
        create: (args: { data: { action: string } }) => {
          auditedAction = args.data.action;
          return Promise.resolve({ id: 'audit' });
        },
      },
    };
    const prisma = {
      conversation: { findFirst: () => Promise.resolve(null) },
      $transaction: (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    };
    const service = new AiService(
      prisma as unknown as PrismaService,
      {} as LlmAdapter,
      {} as LeadsService,
      {} as PropertiesService,
      {} as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );

    await expect(
      service.listMessages('broker-id', 'conversation-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditedAction).toBe('ACCESS_DENIED');
  });

  it('does not create a visit when a human rejects its proposal', async () => {
    const proposal = { id: 'proposal-id', status: 'PENDING' };
    const prisma = {
      conversation: {
        findFirst: () =>
          Promise.resolve({ id: 'conversation-id', leadId: 'lead-id' }),
      },
      actionProposal: {
        findFirst: () => Promise.resolve(proposal),
        updateMany: () => Promise.resolve({ count: 1 }),
      },
    };
    let visitCreates = 0;
    const visits = {
      create: () => {
        visitCreates += 1;
        return Promise.resolve({});
      },
    };
    const leads = { get: () => Promise.resolve({ id: 'lead-id' }) };
    const service = new AiService(
      prisma as unknown as PrismaService,
      {} as LlmAdapter,
      leads as unknown as LeadsService,
      {} as PropertiesService,
      visits as unknown as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );
    await expect(
      service.confirmProposal(
        'broker-id',
        'conversation-id',
        'proposal-id',
        false,
      ),
    ).resolves.toMatchObject({ status: 'REJECTED' });
    expect(visitCreates).toBe(0);
  });

  it('atomically claims a confirmed proposal before creating the visit', async () => {
    const args = {
      leadId: '11111111-1111-4111-8111-111111111111',
      propertyId: '22222222-2222-4222-8222-222222222222',
      startAt: '2035-02-01T10:00:00.000Z',
      endAt: '2035-02-01T11:00:00.000Z',
    };
    const proposalId = '33333333-3333-4333-8333-333333333333';
    let status = 'PENDING';
    const proposal = {
      id: proposalId,
      status,
      expiresAt: new Date('2035-01-31T00:00:00.000Z'),
      actionType: 'schedule_visit',
      arguments: args,
      argumentsHash: createHash('sha256')
        .update(JSON.stringify(args))
        .digest('hex'),
    };
    const prisma = {
      conversation: {
        findFirst: () =>
          Promise.resolve({ id: 'conversation-id', leadId: args.leadId }),
      },
      actionProposal: {
        findFirst: () => Promise.resolve(proposal),
        updateMany: (query: {
          where: { status: string };
          data: { status: string };
        }) => {
          if (status !== query.where.status)
            return Promise.resolve({ count: 0 });
          status = query.data.status;
          return Promise.resolve({ count: 1 });
        },
        findUnique: () => Promise.resolve({ ...proposal, status }),
      },
    };
    const service = new AiService(
      prisma as unknown as PrismaService,
      {} as LlmAdapter,
      {
        get: () => Promise.resolve({ id: args.leadId }),
      } as unknown as LeadsService,
      {} as PropertiesService,
      {
        create: () => {
          expect(status).toBe('CONFIRMING');
          return Promise.resolve({ id: 'visit-id' });
        },
      } as unknown as VisitsService,
      {} as TasksService,
      {
        get: (_key: string, fallback: number) => fallback,
      } as unknown as ConfigService,
    );

    await expect(
      service.confirmProposal('broker-id', 'conversation-id', proposalId, true),
    ).resolves.toMatchObject({
      status: 'CONFIRMED',
      visit: { id: 'visit-id' },
    });
    expect(status).toBe('CONFIRMED');
  });
});

describe('AI failed request accounting and diagnostics', () => {
  function harness(error: Error) {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ reserved_tokens: 5000 }])),
      $executeRaw: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(1),
      toolExecution: {
        create: jest
          .fn<Promise<{ id: string }>, [unknown]>()
          .mockResolvedValue({ id: 'execution' }),
      },
    };
    const service = new AiService(
      prisma as unknown as PrismaService,
      {
        extractPreferences: () => Promise.reject(error),
      } as unknown as LlmAdapter,
      {} as LeadsService,
      {} as PropertiesService,
      {} as VisitsService,
      {} as TasksService,
      { get: (_key: string, fallback: unknown) => fallback } as ConfigService,
    );
    return { service, prisma };
  }

  it.each([400, 401, 403, 404, 422, 429])(
    'returns the token reservation when the provider rejects with HTTP %s',
    async (status) => {
      const { service, prisma } = harness(
        Object.assign(new Error('private provider message'), { status }),
      );
      await expect(
        service.extractPreferences('broker-id', 'Quero alugar'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$executeRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [5000, 0, 'broker-id', expect.any(String)],
        }),
      );
    },
  );

  it('records the parameter and upstream request ID without leaking the provider message', async () => {
    const error = Object.assign(new Error('private input and credential'), {
      status: 400,
      code: 'unsupported_parameter',
      param: 'text.format',
      requestID: 'req_synthetic',
    });
    const { service } = harness(error);
    await expect(
      service.extractPreferences('broker-id', 'Quero alugar'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const log = loggedLines.join('');
    expect(log).toContain('"providerParam":"text.format"');
    expect(log).toContain('"providerRequestId":"req_synthetic"');
    expect(log).not.toContain('private input and credential');
  });

  it('charges actual tokens for incomplete responses and records a specific error', async () => {
    const { service, prisma } = harness(
      new LlmResponseError('AI_OUTPUT_TOKEN_LIMIT', 321),
    );
    await expect(
      service.extractPreferences('broker-id', 'Quero alugar'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [5000, 321, 'broker-id', expect.any(String)],
      }),
    );
    expect(prisma.toolExecution.create.mock.calls.at(-1)?.[0]).toMatchObject({
      data: {
        resultCode: 'AI_OUTPUT_TOKEN_LIMIT',
        tokenCount: 321,
        status: 'FAILED',
      },
    });
  });

  it('retains the reservation when a timeout leaves actual usage unknown', async () => {
    const { service, prisma } = harness(new Error('AI_TIMEOUT'));
    await expect(
      service.extractPreferences('broker-id', 'Quero alugar'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('AI orchestration with reasoning models', () => {
  function harness(respond: (input: LlmInput) => Promise<LlmOutput>) {
    const tx = { auditLog: { create: () => Promise.resolve({ id: 'audit' }) } };
    const prisma = {
      $transaction: (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      $queryRaw: () => Promise.resolve([{ reserved_tokens: 5000 }]),
      $executeRaw: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(1),
      conversation: {
        findFirst: () =>
          Promise.resolve({ id: 'conversation-id', leadId: 'lead-id' }),
      },
      message: {
        deleteMany: () => Promise.resolve({ count: 0 }),
        findUnique: jest
          .fn<Promise<{ id: string; body?: string } | null>, [unknown]>()
          .mockResolvedValue(null),
        findUniqueOrThrow: () => Promise.resolve({ id: 'user-message' }),
        create: (query: { data: { body: string } }) =>
          Promise.resolve({
            id: 'message',
            ...query.data,
          }),
        findMany: () =>
          Promise.resolve([{ role: 'USER', body: 'Liste minhas tarefas' }]),
      },
      actionProposal: {
        findMany: jest
          .fn<
            Promise<
              Array<{
                id: string;
                actionType: string;
                summary: string;
                expiresAt: Date;
              }>
            >,
            [unknown]
          >()
          .mockResolvedValue([]),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'proposal-id', status: 'PENDING' }),
      },
      toolExecution: {
        create: jest
          .fn<Promise<{ id: string }>, [unknown]>()
          .mockResolvedValue({ id: 'execution' }),
      },
    };
    const tasks = { list: jest.fn(() => Promise.resolve({ items: [] })) };
    const service = new AiService(
      prisma as unknown as PrismaService,
      { respond } as LlmAdapter,
      {
        get: () => Promise.resolve({ name: 'Lead sintético' }),
        getPreference: () => Promise.resolve({}),
      } as unknown as LeadsService,
      {
        get: () => Promise.resolve({ title: 'Imóvel de teste' }),
      } as unknown as PropertiesService,
      {} as VisitsService,
      tasks as unknown as TasksService,
      { get: (_key: string, fallback: unknown) => fallback } as ConfigService,
    );
    return { service, prisma, tasks };
  }

  it.each(['AI_TOKEN_LIMIT', 'AI_TIMEOUT'])(
    'keeps a persisted proposal actionable after %s and on message replay',
    async (code) => {
      const args = JSON.stringify({
        propertyId: '11111111-1111-4111-8111-111111111111',
        startAt: '2099-10-10T17:00:00.000Z',
        endAt: '2099-10-10T18:00:00.000Z',
      });
      const respond = jest
        .fn<Promise<LlmOutput>, [LlmInput]>()
        .mockResolvedValueOnce({
          text: '',
          totalTokens: 100,
          calls: [
            { callId: 'call_visit', name: 'schedule_visit', arguments: args },
          ],
          output: [
            {
              type: 'function_call',
              call_id: 'call_visit',
              name: 'schedule_visit',
              arguments: args,
            },
          ],
        })
        .mockRejectedValueOnce(new Error(code));
      const { service, prisma } = harness(respond);
      const proposals = [
        {
          id: 'proposal-id',
          actionType: 'schedule_visit',
          summary: 'Visita ao imóvel de teste',
          expiresAt: new Date(Date.now() + 900000),
        },
      ];
      prisma.actionProposal.upsert.mockImplementation(() => {
        prisma.actionProposal.findMany.mockResolvedValue(proposals);
        return Promise.resolve({ ...proposals[0], status: 'PENDING' });
      });
      const result = await service.sendMessage(
        'broker-id',
        'conversation-id',
        'Agende uma visita',
        'client-key',
      );
      expect(result.proposals).toEqual(proposals);
      expect(result.response.body).toContain('há proposta de visita pendente');
      expect(result.response.body).toContain('A visita ainda não foi agendada');
      expect(prisma.actionProposal.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.actionProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brokerId: 'broker-id',
            conversationId: 'conversation-id',
            status: 'PENDING',
            expiresAt: { gt: expect.any(Date) as Date },
          },
        }),
      );
      expect(prisma.toolExecution.create.mock.calls.at(-1)?.[0]).toMatchObject({
        data: { status: 'FAILED', resultCode: code, tokenCount: 100 },
      });
      // Reusing the message key must not invoke the model or create another proposal.
      prisma.message.findUnique
        .mockResolvedValueOnce(result.message)
        .mockResolvedValueOnce(result.response);
      const replay = await service.sendMessage(
        'broker-id',
        'conversation-id',
        'Agende uma visita',
        'client-key',
      );
      expect(replay).toEqual(result);
      expect(respond).toHaveBeenCalledTimes(2);
      expect(prisma.actionProposal.upsert).toHaveBeenCalledTimes(1);
      // A decision/expiration changes the actionable proposals on subsequent replay.
      prisma.actionProposal.findMany.mockResolvedValue([]);
      prisma.message.findUnique
        .mockResolvedValueOnce(result.message)
        .mockResolvedValueOnce(result.response);
      const decidedReplay = await service.sendMessage(
        'broker-id',
        'conversation-id',
        'Agende uma visita',
        'client-key',
      );
      expect(decidedReplay.proposals).toEqual([]);
    },
  );

  it('uses the manual fallback when the model fails without a pending proposal', async () => {
    const respond = jest
      .fn<Promise<LlmOutput>, [LlmInput]>()
      .mockRejectedValue(new Error('AI_TIMEOUT'));
    const { service } = harness(respond);
    await expect(
      service.sendMessage(
        'broker-id',
        'conversation-id',
        'Agende uma visita',
        'client-key',
      ),
    ).resolves.toMatchObject({
      proposals: [],
      response: {
        body: 'Não consegui concluir essa solicitação agora. Ela pode ser encaminhada para atendimento manual.',
      },
    });
  });

  it.each(['responses', 'chat'])(
    'replays complete %s output once in the next model request',
    async (protocol) => {
      const output: LlmOutput['output'] =
        protocol === 'chat'
          ? [
              {
                type: 'chat_assistant',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      type: 'function',
                      id: 'call_test',
                      function: { name: 'list_pending_tasks', arguments: '{}' },
                    },
                  ],
                },
              },
            ]
          : [
              {
                type: 'reasoning',
                id: 'rs_test',
                summary: [],
                encrypted_content: 'synthetic-encrypted-reasoning',
              },
              {
                type: 'function_call',
                id: 'fc_test',
                call_id: 'call_test',
                name: 'list_pending_tasks',
                arguments: '{}',
              },
            ];
      const respond = jest
        .fn<Promise<LlmOutput>, [LlmInput]>()
        .mockResolvedValueOnce({
          text: '',
          calls: [
            {
              callId: 'call_test',
              name: 'list_pending_tasks',
              arguments: '{}',
            },
          ],
          totalTokens: 100,
          output,
        })
        .mockImplementationOnce((input) => {
          expect(input.input.slice(1)).toEqual([
            ...output,
            {
              type: 'function_call_output',
              call_id: 'call_test',
              output: '{"items":[]}',
            },
          ]);
          return Promise.resolve({
            text: 'Você não tem tarefas pendentes.',
            calls: [],
            totalTokens: 50,
            output: [],
          });
        });
      const { service, prisma, tasks } = harness(respond);
      await expect(
        service.sendMessage(
          'broker-id',
          'conversation-id',
          'Liste minhas tarefas',
          'client-key',
        ),
      ).resolves.toMatchObject({
        response: { body: 'Você não tem tarefas pendentes.' },
      });
      expect(respond).toHaveBeenCalledTimes(2);
      expect(tasks.list).toHaveBeenCalledTimes(1);
      expect(prisma.toolExecution.create.mock.calls.at(-1)?.[0]).toMatchObject({
        data: {
          toolName: 'orchestrator',
          status: 'SUCCEEDED',
          tokenCount: 150,
        },
      });
    },
  );

  it('preserves consumed tokens in the fallback when a later model request is rejected', async () => {
    const respond = jest
      .fn<Promise<LlmOutput>, [LlmInput]>()
      .mockResolvedValueOnce({
        text: '',
        calls: [
          { callId: 'call_test', name: 'list_pending_tasks', arguments: '{}' },
        ],
        totalTokens: 100,
        output: [
          {
            type: 'function_call',
            id: 'fc_test',
            call_id: 'call_test',
            name: 'list_pending_tasks',
            arguments: '{}',
          },
        ],
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('synthetic error'), {
          status: 400,
          param: 'input',
        }),
      );
    const { service, prisma } = harness(respond);
    await service.sendMessage(
      'broker-id',
      'conversation-id',
      'Liste minhas tarefas',
      'client-key',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [5000, 100, 'broker-id', expect.any(String)],
      }),
    );
    expect(prisma.toolExecution.create.mock.calls.at(-1)?.[0]).toMatchObject({
      data: {
        toolName: 'orchestrator',
        status: 'FAILED',
        tokenCount: 100,
        resultCode: 'AI_PROVIDER_BAD_REQUEST_PARAM_INPUT',
      },
    });
  });
});

describe('LLM tool definitions', () => {
  it('exposes the specified tools without allowing the model to choose an actor', () => {
    expect(TOOL_SCHEMAS.map((tool) => tool.name)).toEqual([
      'create_lead',
      'get_lead',
      'update_lead_preferences',
      'search_properties',
      'get_property_details',
      'save_property_interest',
      'list_available_visit_slots',
      'schedule_visit',
      'create_follow_up_task',
      'list_pending_tasks',
      'draft_follow_up_message',
    ]);
    expect(JSON.stringify(TOOL_SCHEMAS)).not.toContain('brokerId');
  });
});
