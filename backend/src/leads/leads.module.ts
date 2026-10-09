import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { LEAD_STAGE_PORT } from '../application/ports/lead-stage.port.js';
import { PrismaLeadStageAdapter } from '../infrastructure/prisma-lead-stage.adapter.js';

@Module({
  imports: [AuthModule],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    PrismaLeadStageAdapter,
    { provide: LEAD_STAGE_PORT, useExisting: PrismaLeadStageAdapter },
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
