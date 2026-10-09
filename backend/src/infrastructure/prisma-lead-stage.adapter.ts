import { Injectable } from '@nestjs/common';
import { writeAudit } from '../audit/audit.js';
import type { LeadStage } from '../domain/leads/lead-stage.js';
import type {
  LeadStagePort,
  StageTransitionResult,
} from '../application/ports/lead-stage.port.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PrismaLeadStageAdapter implements LeadStagePort {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(
    brokerId: string,
    leadId: string,
  ): Promise<LeadStage | undefined> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
      select: { stage: true },
    });
    return lead?.stage;
  }

  async transition(
    brokerId: string,
    leadId: string,
    from: LeadStage,
    to: LeadStage,
    requestId?: string,
  ): Promise<StageTransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.lead.updateMany({
        where: { id: leadId, brokerId, stage: from, deletedAt: null },
        data: { stage: to },
      });
      if (!changed.count) return { kind: 'conflict' };
      const history = await tx.leadStageHistory.create({
        data: {
          brokerId,
          leadId,
          actorId: brokerId,
          fromStage: from,
          toStage: to,
        },
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'lead',
        entityId: leadId,
        action: 'TRANSITION',
        changedFields: ['stage'],
        requestId,
      });
      return { kind: 'updated', stage: to, historyId: history.id };
    });
  }
}
