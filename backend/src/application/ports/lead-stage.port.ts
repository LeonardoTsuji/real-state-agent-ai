import type { LeadStage } from '../../domain/leads/lead-stage.js';

export const LEAD_STAGE_PORT = Symbol('LEAD_STAGE_PORT');

export type StageTransitionResult =
  | { kind: 'updated'; stage: LeadStage; historyId: string }
  | { kind: 'conflict' };

export interface LeadStagePort {
  getCurrent(brokerId: string, leadId: string): Promise<LeadStage | undefined>;
  transition(
    brokerId: string,
    leadId: string,
    from: LeadStage,
    to: LeadStage,
    requestId?: string,
  ): Promise<StageTransitionResult>;
}
