import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LeadStagePort } from '../application/ports/lead-stage.port.js';
import { LeadsService } from './leads.service.js';
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest })
  .jest;
function service(prisma: unknown) {
  return new LeadsService(prisma as PrismaService, {} as LeadStagePort);
}
describe('lead import and filtered summaries', () => {
  it('previews valid and invalid CSV rows without creating leads', async () => {
    const create = jest.fn();
    const tx = { lead: { create } };
    const api = service({
      $transaction: <T>(fn: (tx: unknown) => T) => fn(tx),
    });
    const report = await api.importRows('broker', {
      preview: true,
      rows: [
        { name: 'Rafael', email: 'rafael@example.com' },
        { name: 'Sem contato' },
        { name: 'Inválido', email: 'invalido' },
        42,
      ],
    });
    expect(report).toMatchObject({
      total: 4,
      created: 0,
      failed: 3,
      preview: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it('replays persisted results regardless of JSON field order', async () => {
    const report = {
      items: [{ line: 1, status: 'CREATED', id: 'lead' }],
      total: 1,
      created: 1,
      failed: 0,
      preview: false,
    };
    const api = service({
      leadImportBatch: {
        findUnique: () =>
          Promise.resolve({
            input: [{ email: 'r@example.com', name: 'Rafael' }],
            report,
          }),
      },
    });
    await expect(
      api.importRows(
        'broker',
        { rows: [{ name: 'Rafael', email: 'r@example.com' }] },
        'same-key',
      ),
    ).resolves.toEqual(report);
  });
  it('does not reuse an import key for different content', async () => {
    const api = service({
      leadImportBatch: {
        findUnique: () =>
          Promise.resolve({
            input: [{ name: 'Other', email: 'r@example.com' }],
            report: {},
          }),
      },
    });
    await expect(
      api.importRows(
        'broker',
        { rows: [{ name: 'Rafael', email: 'r@example.com' }] },
        'same-key',
      ),
    ).rejects.toThrow(ConflictException);
  });
  it('filters by the latest interaction across the full carteira before paging', async () => {
    const groupBy = jest.fn(() =>
      Promise.resolve([{ leadId: 'matching-lead' }]),
    );
    const findMany = jest.fn(() =>
      Promise.resolve([
        {
          id: 'matching-lead',
          stage: 'QUALIFIED',
          preference: null,
          interactions: [{ summary: 'Contato recente' }],
        },
      ]),
    );
    const prisma = {
      interaction: { groupBy },
      lead: { findMany, count: () => Promise.resolve(1) },
      $transaction: (requests: Promise<unknown>[]) => Promise.all(requests),
    };
    const result = await service(prisma).list('broker', {
      page: 1,
      limit: 20,
      lastInteractionFrom: '2026-10-01T00:00:00Z',
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { brokerId: 'broker' },
        having: expect.objectContaining({
          occurredAt: expect.objectContaining({
            _max: expect.any(Object) as unknown,
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brokerId: 'broker',
          id: { in: ['matching-lead'] },
        }) as unknown,
      }),
    );
    expect(result.items).toEqual([
      {
        id: 'matching-lead',
        stage: 'QUALIFIED',
        preference: null,
        lastInteraction: { summary: 'Contato recente' },
      },
    ]);
  });
});
