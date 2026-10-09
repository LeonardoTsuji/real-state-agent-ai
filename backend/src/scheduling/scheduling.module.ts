import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { SchedulingController } from './scheduling.controller.js';
import { SchedulingService } from './scheduling.service.js';
@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [SchedulingController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
