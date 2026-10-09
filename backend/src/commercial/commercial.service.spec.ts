import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommercialService, commissionCents } from './commercial.service.js';
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest })
  .jest;
function service(prisma: unknown, production = false) {
  return new CommercialService(
    prisma as PrismaService,
    {
      get: (key: string) =>
        key === 'DEMO_MODE' ? true : production ? 'production' : 'test',
    } as unknown as ConfigService,
  );
}
function setup(stage = 'PROPOSAL_SENT') {
  const opportunity = {
    id: 'opportunity',
    brokerId: 'broker',
    leadId: 'lead',
    propertyId: 'property',
    alternativePropertyId: null,
    stage,
    estimatedValueCents: 138000000,
    commissionBps: 600,
    proposal: {
      valueCents: 138000000,
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      paymentTerms: 'Sinal e financiamento',
      sellerName: 'Carlos',
    },
    acceptance: null,
  };
  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([opportunity])),
    lead: {
      findFirst: jest.fn(() =>
        Promise.resolve({ id: 'lead', stage: 'NEGOTIATION' }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    property: { findFirst: jest.fn(() => Promise.resolve({ id: 'property' })) },
    leadStageHistory: {
      create: jest.fn(() => Promise.resolve({ id: 'history' })),
    },
    installment: {
      create: jest.fn(() => Promise.resolve({ id: 'installment' })),
    },
    opportunity: {
      update: jest.fn((args: { data: unknown }) =>
        Promise.resolve(Object.assign(opportunity, args.data as object)),
      ),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({ id: 'audit' })) },
  };
  const prisma = { $transaction: <T>(fn: (tx: unknown) => T) => fn(tx) };
  return { tx, opportunity, api: service(prisma) };
}
describe('commercial transactions', () => {
  it('rounds BRL commission once in integer cents', () => {
    expect(commissionCents(138000000, 600)).toBe(8280000);
    expect(commissionCents(101, 600)).toBe(6);
  });
  it('creates acceptance, lead transition and commission installments atomically', async () => {
    const { api, tx } = setup();
    const result = await api.accept(
      'broker',
      'opportunity',
      { confirmed: true, simulated: true },
      'accept-key',
    );
    expect(result.stage).toBe('WON');
    expect(result.acceptance).toMatchObject({
      simulated: true,
      commissionCents: 8280000,
    });
    await api.accept(
      'broker',
      'opportunity',
      { confirmed: true, simulated: true },
      'accept-key',
    );
    expect(tx.installment.create).toHaveBeenCalledTimes(2);
    expect(
      tx.installment.create.mock.calls.map(
        ([args]) =>
          (args as { data: { amountCents: number } }).data.amountCents,
      ),
    ).toEqual([4140000, 4140000]);
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brokerId: 'broker',
          stage: 'NEGOTIATION',
        }) as unknown,
      }),
    );
  });
  it('refuses expired proposals before changing stage or creating installments', async () => {
    const { api, tx, opportunity } = setup();
    opportunity.proposal.validUntil = '2020-01-01T00:00:00Z';
    await expect(
      api.accept(
        'broker',
        'opportunity',
        { confirmed: true, simulated: true },
        'key',
      ),
    ).rejects.toThrow(ConflictException);
    expect(tx.installment.create).not.toHaveBeenCalled();
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });
  it('requires explicit simulation and blocks production', async () => {
    await expect(
      service({}).accept(
        'broker',
        'id',
        { confirmed: true, simulated: false },
        'key',
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service({}, true).accept(
        'broker',
        'id',
        { confirmed: true, simulated: true },
        'key',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('does not expose another broker opportunity', async () => {
    const api = service({
      opportunity: { findFirst: () => Promise.resolve(null) },
    });
    await expect(api.get('broker', 'foreign-id')).rejects.toThrow(
      NotFoundException,
    );
  });
  it('prevents marking an opportunity won via generic PATCH', async () => {
    const { api, tx } = setup('QUALIFICATION');
    await expect(
      api.patch('broker', 'opportunity', { stage: 'WON' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.opportunity.update).not.toHaveBeenCalled();
  });
  it('rejects commission installment totals that disagree with negotiated value', async () => {
    const { api, tx } = setup('QUALIFICATION');
    await expect(
      api.proposal(
        'broker',
        'opportunity',
        {
          valueCents: 138000000,
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          sellerName: 'Carlos',
          paymentTerms: 'À vista',
          installments: [{ amountCents: 100 }],
        },
        'key',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tx.opportunity.update).not.toHaveBeenCalled();
  });
  it('audits a proposal-induced lead transition alongside commercial terms', async () => {
    const { api, tx } = setup('QUALIFICATION');
    tx.lead.findFirst.mockResolvedValue({ id: 'lead', stage: 'QUALIFIED' });
    const proposed = await api.proposal(
      'broker',
      'opportunity',
      {
        valueCents: 138000000,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        sellerName: 'Carlos',
        paymentTerms: 'Sinal e financiamento',
      },
      'proposal-key',
      'request-123',
    );
    expect(proposed.stage).toBe('PROPOSAL_SENT');
    const audits = (
      tx.auditLog.create.mock.calls as unknown as Array<
        [
          {
            data: {
              entityType: string;
              entityId: string;
              action: string;
              requestId: string;
              changes: { fields: string[] };
            };
          },
        ]
      >
    ).map(([event]) => event.data);
    expect(audits.find((event) => event.entityType === 'lead')).toMatchObject({
      entityId: 'lead',
      action: 'TRANSITION',
      requestId: 'request-123',
      changes: { fields: ['stage'] },
    });
    expect(
      audits.find((event) => event.entityType === 'opportunity'),
    ).toMatchObject({
      entityId: 'opportunity',
      action: 'UPDATE',
      requestId: 'request-123',
    });
    expect(tx.leadStageHistory.create).toHaveBeenCalledTimes(1);
  });
});
