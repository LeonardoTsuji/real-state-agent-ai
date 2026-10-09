import type { LeadStage } from '../../domain/leads/lead-stage.js';
import { canTransitionLeadStage } from '../../domain/leads/lead-stage.js';
import type {
  LeadStagePort,
  StageTransitionResult,
} from '../ports/lead-stage.port.js';

export type ChangeLeadStageResult =
  | { kind: 'not-found' }
  | { kind: 'invalid-transition'; from: LeadStage; to: LeadStage }
  | { kind: 'unchanged'; stage: LeadStage }
  | StageTransitionResult;

export class ChangeLeadStageUseCase {
  constructor(private readonly port: LeadStagePort) {}

  async execute(input: {
    brokerId: string;
    leadId: string;
    stage: LeadStage;
    requestId?: string;
  }): Promise<ChangeLeadStageResult> {
    const current = await this.port.getCurrent(input.brokerId, input.leadId);
    if (!current) return { kind: 'not-found' };
    if (current === input.stage) return { kind: 'unchanged', stage: current };
    if (!canTransitionLeadStage(current, input.stage)) {
      return { kind: 'invalid-transition', from: current, to: input.stage };
    }
    return this.port.transition(
      input.brokerId,
      input.leadId,
      current,
      input.stage,
      input.requestId,
    );
  }
}
