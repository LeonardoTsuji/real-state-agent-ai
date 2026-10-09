import { ChangeLeadStageUseCase } from './change-lead-stage.use-case.js';
import type { LeadStagePort } from '../ports/lead-stage.port.js';

describe('ChangeLeadStageUseCase', () => {
  it('validates transitions without database or Prisma dependencies', async () => {
    let transitionCalls = 0;
    const port: LeadStagePort = {
      getCurrent: () => Promise.resolve('NEW'),
      transition: (_brokerId, _leadId, _from, to) => {
        transitionCalls += 1;
        return Promise.resolve({
          kind: 'updated',
          stage: to,
          historyId: 'history',
        });
      },
    };
    const useCase = new ChangeLeadStageUseCase(port);

    await expect(
      useCase.execute({ brokerId: 'broker', leadId: 'lead', stage: 'WON' }),
    ).resolves.toEqual({ kind: 'invalid-transition', from: 'NEW', to: 'WON' });
    expect(transitionCalls).toBe(0);
    await expect(
      useCase.execute({
        brokerId: 'broker',
        leadId: 'lead',
        stage: 'CONTACTED',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      stage: 'CONTACTED',
      historyId: 'history',
    });
    expect(transitionCalls).toBe(1);
  });
});
